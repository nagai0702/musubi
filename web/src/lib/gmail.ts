/** Gmail API — 未読/重要メール取得 */
import { google } from 'googleapis';
import { getOAuthClient } from './sheets';

export type GmailThread = {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  isImportant: boolean;
  isUnread: boolean;
  isMass?: boolean;
  isPersonal?: boolean;
};

function client() {
  return google.gmail({ version: 'v1', auth: getOAuthClient() });
}

function getHeader(headers: Array<{ name?: string; value?: string }>, name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

/** 一斉配信系メールかどうかを判定 */
const MASS_SENDER_PATTERNS = [
  /noreply/i, /no-reply/i, /donotreply/i, /do-not-reply/i,
  /mailer-daemon/i, /postmaster/i, /notifications?@/i,
  /newsletter/i, /news@/i, /info@/i, /support@/i,
  /automated/i, /system@/i, /alerts?@/i,
  /billing@/i, /invoice@/i, /receipt/i,
];
const MASS_KEYWORDS_SUBJECT = [
  'メルマガ', 'お知らせ', 'ニュースレター', '配信停止',
  'キャンペーン', 'セール', '特別価格', '【重要】お知らせ',
  'Newsletter', 'Unsubscribe', 'Weekly', 'Monthly',
  '自動送信', '自動配信', 'Digest',
];

function isMassEmail(from: string, subject: string, headers: Array<{ name?: string; value?: string }>): boolean {
  // List-Unsubscribe ヘッダーがあれば一斉配信の可能性が高い
  if (getHeader(headers, 'List-Unsubscribe')) return true;
  if (getHeader(headers, 'Precedence')?.match(/bulk|list|junk/i)) return true;
  if (getHeader(headers, 'List-Id')) return true;

  // 送信元が自動系パターンにマッチ
  if (MASS_SENDER_PATTERNS.some((re) => re.test(from))) return true;

  // 件名が配信系キーワードを含む
  if (MASS_KEYWORDS_SUBJECT.some((k) => subject.includes(k))) return true;

  return false;
}

/** 直近24hの未読 or 重要メールを取得（上限 maxResults） */
export async function getRecentEmails(maxResults = 20): Promise<GmailThread[]> {
  const gm = client();

  const listRes = await gm.users.messages.list({
    userId: 'me',
    q: 'is:unread OR is:important newer_than:1d',
    maxResults,
  });

  const ids = (listRes.data.messages || []).map((m) => m.id!).filter(Boolean);
  if (ids.length === 0) return [];

  const threads: GmailThread[] = [];

  // 並列で取得（最大 maxResults 件）
  const results = await Promise.allSettled(
    ids.map((id) =>
      gm.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] })
    )
  );

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const msg = r.value.data;
    const headers = (msg.payload?.headers || []) as Array<{ name?: string; value?: string }>;
    const labels = msg.labelIds || [];

    const subject = getHeader(headers, 'Subject') || '(件名なし)';
    const from = getHeader(headers, 'From');
    const isMass = isMassEmail(from, subject, headers);

    threads.push({
      id: msg.id || '',
      subject,
      from,
      snippet: msg.snippet || '',
      date: getHeader(headers, 'Date'),
      isImportant: labels.includes('IMPORTANT'),
      isUnread: labels.includes('UNREAD'),
      isMass,
      isPersonal: !isMass,
    });
  }

  return threads;
}

/** 個人宛で返信が必要なメールのみ取得（一斉配信系を除外） */
export async function getPersonalEmailsNeedingReply(maxResults = 30): Promise<GmailThread[]> {
  // 過去3日の未読メールをベースにする（返信期限がありそうなもの）
  const all = await getRecentEmails(maxResults);
  return all.filter((e) => e.isPersonal && e.isUnread);
}

/** Gmail でメッセージをアーカイブ（INBOX ラベル削除） */
export async function archiveMessage(messageId: string): Promise<boolean> {
  const gm = client();
  try {
    await gm.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { removeLabelIds: ['INBOX'] },
    });
    return true;
  } catch (e) {
    console.error('[gmail] archive failed for', messageId, e);
    return false;
  }
}

/** 自動アーカイブする送信元のパターン（部分一致） */
export const AUTO_ARCHIVE_SENDERS = [
  'クラウドリンクス',
  'crowdlinks',
  'afb',
  'afb運営',
  'LinkedIn',
  'linkedin.com',
  'メディアレーダー',
  'media-radar.jp',
  'Notta',
  'notta.ai',
  'no-reply@notification',
  'カシモWiMAX',
  'kashimo',
  'ラクスル',
  'raksul',
];

export function shouldAutoArchive(email: GmailThread): boolean {
  const from = (email.from || '').toLowerCase();
  const subject = (email.subject || '').toLowerCase();
  return AUTO_ARCHIVE_SENDERS.some((p) => from.includes(p.toLowerCase()) || subject.includes(p.toLowerCase()));
}

/** 自動アーカイブ対象のメールを一括アーカイブし、アーカイブしたIDを返す */
export async function autoArchiveEmails(emails: GmailThread[]): Promise<{ archived: string[]; remaining: GmailThread[] }> {
  const toArchive: GmailThread[] = [];
  const remaining: GmailThread[] = [];

  for (const e of emails) {
    if (shouldAutoArchive(e)) toArchive.push(e);
    else remaining.push(e);
  }

  const archivedIds: string[] = [];
  for (const e of toArchive) {
    const ok = await archiveMessage(e.id);
    if (ok) archivedIds.push(e.id);
  }

  return { archived: archivedIds, remaining };
}
