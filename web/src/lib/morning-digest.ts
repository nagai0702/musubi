/** Morning Digest — 朝のサマリー生成 & タスク自動判定 */
import { getTodayEvents, type CalendarEvent } from './google-calendar';
import { getRecentEmails, type GmailThread } from './gmail';
import { createTask } from './tasks';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const BOT_TOKEN = () => import.meta.env.SLACK_BOT_TOKEN!;
const DIGEST_CHANNEL = () => import.meta.env.SLACK_DIGEST_CHANNEL_ID!;
/** 監視チャンネル。"all" の場合は Bot が参加しているチャンネルを全取得。 */
async function getWatchChannels(): Promise<string[]> {
  const raw = import.meta.env.SLACK_DIGEST_WATCH_CHANNELS || '';
  if (raw !== 'all') return raw.split(',').filter(Boolean);

  // Bot が参加しているチャンネルを全取得
  const channels: string[] = [];
  let cursor: string | undefined;
  do {
    const qs = cursor ? `&cursor=${cursor}` : '';
    const res = await slackAPI(`users.conversations?types=public_channel,private_channel&limit=200${qs}`);
    for (const ch of res.channels || []) channels.push(ch.id);
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  // ダイジェスト投稿先チャンネルは除外
  const digestCh = DIGEST_CHANNEL();
  return channels.filter((id) => id !== digestCh);
}
const OWNER_USER_ID = () => import.meta.env.SLACK_OWNER_USER_ID || '';

/* ---------- Slack helpers ---------- */

async function slackAPI(method: string, body?: any): Promise<any> {
  const opts: RequestInit = { headers: { Authorization: 'Bearer ' + BOT_TOKEN() } };
  if (body) {
    opts.method = 'POST';
    opts.headers = { ...opts.headers, 'Content-Type': 'application/json; charset=utf-8' } as any;
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`https://slack.com/api/${method}`, opts);
  return res.json();
}

export type SlackChannelSummary = {
  channelId: string;
  channelName: string;
  messageCount: number;
  mentionCount: number;
  highlights: string[];
};

/** 監視チャンネルの直近24hメッセージをサマリー */
async function fetchSlackSummary(): Promise<SlackChannelSummary[]> {
  const channels = await getWatchChannels();
  if (channels.length === 0) return [];

  const oldest = String(Math.floor(Date.now() / 1000) - 86400);
  const ownerId = OWNER_USER_ID();

  const results = await Promise.allSettled(
    channels.map(async (channelId: string) => {
      const info = await slackAPI(`conversations.info?channel=${channelId}`);
      const name = info.channel?.name || channelId;

      const history = await slackAPI(`conversations.history?channel=${channelId}&oldest=${oldest}&limit=200`);
      const messages: any[] = (history.messages || []).filter((m: any) => !m.subtype);

      const mentionCount = messages.filter(
        (m) => ownerId && m.text?.includes(`<@${ownerId}>`)
      ).length;

      // 直近メッセージからハイライト抽出（最新5件のテキスト）
      const highlights = messages
        .slice(0, 5)
        .map((m) => (m.text || '').slice(0, 120))
        .filter(Boolean);

      return { channelId, channelName: name, messageCount: messages.length, mentionCount, highlights };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<SlackChannelSummary> => r.status === 'fulfilled')
    .map((r) => r.value);
}

/* ---------- Claude AI ---------- */

async function callClaude(system: string, userMessage: string, maxTokens = 1500): Promise<string> {
  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as any;
  return data.content?.[0]?.text || '';
}

/* ---------- Digest 生成 ---------- */

type DigestData = {
  calendar: CalendarEvent[];
  emails: GmailThread[];
  slack: SlackChannelSummary[];
};

function formatTime(iso: string): string {
  if (!iso.includes('T')) return '終日';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function buildBlocks(calendar: CalendarEvent[], emails: GmailThread[], slack: SlackChannelSummary[], aiSummary: string): any[] {
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dayName = dayNames[new Date(Date.now() + 9 * 3600_000).getDay()];

  const blocks: any[] = [
    { type: 'header', text: { type: 'plain_text', text: `Daily Digest - ${today} (${dayName})` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${calendar.length} 件の予定 | ${emails.filter((e) => e.isUnread).length} 通の未読メール | Slack ${slack.reduce((s, c) => s + c.messageCount, 0)} 件` }] },
    { type: 'divider' },
  ];

  // Calendar
  const calLines = calendar.length > 0
    ? calendar.map((e) => `- ${formatTime(e.start)} ${e.summary}${e.hangoutLink ? ' (Meet)' : ''}`).join('\n')
    : '_予定なし_';
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `:calendar: *今日のスケジュール*\n${calLines}` } });
  blocks.push({ type: 'divider' });

  // Emails
  const importantEmails = emails.filter((e) => e.isImportant);
  const unreadEmails = emails.filter((e) => e.isUnread && !e.isImportant);
  const emailLines: string[] = [];
  for (const e of importantEmails.slice(0, 5)) emailLines.push(`- :star: ${e.subject} — _${e.from.split('<')[0].trim()}_`);
  for (const e of unreadEmails.slice(0, 5)) emailLines.push(`- ${e.subject} — _${e.from.split('<')[0].trim()}_`);
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `:email: *メール* (${importantEmails.length} 重要, ${unreadEmails.length} 未読)\n${emailLines.length > 0 ? emailLines.join('\n') : '_新着なし_'}` },
  });
  blocks.push({ type: 'divider' });

  // Slack
  const slackLines = slack.map(
    (c) => `- #${c.channelName}: ${c.messageCount}件${c.mentionCount > 0 ? `, @メンション${c.mentionCount}件` : ''}`
  );
  if (slackLines.length > 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `:speech_balloon: *Slack ハイライト*\n${slackLines.join('\n')}` } });
    blocks.push({ type: 'divider' });
  }

  // AI summary
  if (aiSummary) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `:dart: *AI おすすめ優先タスク*\n${aiSummary}` } });
  }

  return blocks;
}

/** ダイジェスト生成 & 投稿。既に当日分が投稿済みならスキップ。 */
export async function postDigest(): Promise<void> {
  const channel = DIGEST_CHANNEL();
  const token = BOT_TOKEN();
  if (!channel || !token) return;

  // 冪等チェック: 今日の 0:00 JST 以降に投稿済みか
  const todayMidnight = new Date(Date.now() + 9 * 3600_000);
  todayMidnight.setUTCHours(-9, 0, 0, 0);
  const oldest = String(Math.floor(todayMidnight.getTime() / 1000));
  const existing = await slackAPI(`conversations.history?channel=${channel}&oldest=${oldest}&limit=5`);
  const already = (existing.messages || []).some(
    (m: any) => m.bot_id && (m.text || '').includes('Daily Digest')
  );
  if (already) return;

  // データ収集（並列）
  const [calResult, emailResult, slackResult] = await Promise.allSettled([
    getTodayEvents(),
    getRecentEmails(),
    fetchSlackSummary(),
  ]);

  const calendar = calResult.status === 'fulfilled' ? calResult.value : [];
  const emails = emailResult.status === 'fulfilled' ? emailResult.value : [];
  const slack = slackResult.status === 'fulfilled' ? slackResult.value : [];

  // AI でまとめ & 優先タスク提案
  let aiSummary = '';
  try {
    const context = JSON.stringify({ calendar, emails: emails.map((e) => ({ subject: e.subject, from: e.from, important: e.isImportant })), slack: slack.map((s) => ({ channel: s.channelName, count: s.messageCount, mentions: s.mentionCount })) });
    aiSummary = await callClaude(
      'あなたは結婚相談所「株式会社結び」の経営者のアシスタントです。今日の予定・メール・Slackを踏まえて、優先すべきタスクを3〜5件、箇条書きで提案してください。簡潔に日本語で。',
      context,
      500,
    );
  } catch {}

  // Block Kit 組み立て & 投稿
  const blocks = buildBlocks(calendar, emails, slack, aiSummary);
  const fallbackText = `Daily Digest - ${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)}`;

  await slackAPI('chat.postMessage', { channel, text: fallbackText, blocks });
}

/* ---------- タスク自動判定 ---------- */

export async function classifyAndCreateTask(event: {
  text: string;
  user: string;
  ts: string;
  channel: string;
}): Promise<void> {
  const { text, ts, channel } = event;
  if (!text || text.length < 2) return;

  const result = await callClaude(
    `あなたはタスク判定アシスタントです。ユーザーのメッセージがタスク（やるべきこと）かどうか判定してください。
タスクの場合は以下のJSON形式で返してください:
{"isTask": true, "title": "タスク名", "priority": "High|Medium|Low", "dueDate": "YYYY-MM-DD or null"}
タスクでない場合（雑談、質問、感想など）:
{"isTask": false}
必ずJSON形式のみで返してください。`,
    text,
    200,
  );

  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return;

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return;
  }

  if (!parsed.isTask) return;

  await createTask({
    title: parsed.title || text.slice(0, 100),
    priority: parsed.priority || 'Medium',
    dueDate: parsed.dueDate || undefined,
    source: 'slack',
    sourceMessage: text,
  });

  // チェックマークリアクション
  await slackAPI('reactions.add', { channel, timestamp: ts, name: 'white_check_mark' });
}
