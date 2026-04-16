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
};

function client() {
  return google.gmail({ version: 'v1', auth: getOAuthClient() });
}

function getHeader(headers: Array<{ name?: string; value?: string }>, name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
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

    threads.push({
      id: msg.id || '',
      subject: getHeader(headers, 'Subject') || '(件名なし)',
      from: getHeader(headers, 'From'),
      snippet: msg.snippet || '',
      date: getHeader(headers, 'Date'),
      isImportant: labels.includes('IMPORTANT'),
      isUnread: labels.includes('UNREAD'),
    });
  }

  return threads;
}
