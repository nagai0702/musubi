/** Slack メッセージから永井のタスクを抽出 */
import { createTask } from './tasks';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const BOT_TOKEN = () => import.meta.env.HISYO_BOT_TOKEN!;
const OWNER_USER_ID = () => import.meta.env.SLACK_OWNER_USER_ID!;

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

export type ExtractedTask = {
  title: string;
  priority: 'High' | 'Medium' | 'Low';
  dueDate?: string;
  reason: string; // 根拠となるメッセージ概要
  channel?: string;
};

/** 過去 days 日分の監視対象チャンネルからメッセージを取得 */
async function fetchRecentMessages(days: number): Promise<Array<{ channel: string; channelId: string; text: string; user: string; ts: string }>> {
  const oldest = String(Math.floor(Date.now() / 1000) - days * 86400);
  const results: Array<{ channel: string; channelId: string; text: string; user: string; ts: string }> = [];

  // Bot が参加中のチャンネル一覧
  let cursor: string | undefined;
  const channels: Array<{ id: string; name: string }> = [];
  do {
    const qs = cursor ? `&cursor=${cursor}` : '';
    const res = await slackAPI(`users.conversations?types=public_channel,private_channel,im&limit=200${qs}`);
    for (const ch of res.channels || []) channels.push({ id: ch.id, name: ch.name || ch.user || 'dm' });
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);

  // 各チャンネルから最新メッセージ取得
  for (const ch of channels) {
    try {
      const res = await slackAPI(`conversations.history?channel=${ch.id}&oldest=${oldest}&limit=50`);
      for (const m of res.messages || []) {
        if (m.subtype) continue;
        if (!m.text) continue;
        results.push({
          channel: ch.name,
          channelId: ch.id,
          text: m.text.slice(0, 500),
          user: m.user || '',
          ts: m.ts,
        });
      }
    } catch {}
  }

  return results;
}

/** Claude でタスク抽出 */
export async function extractTasks(days = 7): Promise<ExtractedTask[]> {
  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const ownerId = OWNER_USER_ID();
  const messages = await fetchRecentMessages(days);

  // 永井関連のメッセージに絞る（永井の発言、永井へのメンション、永井宛）
  const relevant = messages.filter((m) => {
    if (m.user === ownerId) return true;
    if (m.text.includes(`<@${ownerId}>`)) return true;
    if (m.text.includes('永井')) return true;
    return false;
  });

  if (relevant.length === 0) return [];

  // Claude に渡すため整形
  const formatted = relevant
    .slice(-200) // 最新200件まで
    .map((m) => `[#${m.channel}] ${m.user === ownerId ? '永井' : m.user}: ${m.text}`)
    .join('\n');

  const systemPrompt = `あなたは株式会社結びの経営者・永井さんの秘書です。
Slackのメッセージ履歴から、以下のいずれかに該当する「未完了」のタスクを抽出してください:
1. 永井さんが「やります」「対応します」「確認します」などと宣言したもの
2. 他の人から永井さんに依頼・質問されたもの
3. 永井さんが検討・決定すべき事項

【重要】以下は除外してください:
- すでに相手からの返信で完了と判断できるもの
- 単なる雑談・相槌
- 既に別の人が引き取った作業
- 会議の日程調整など、特定の時点で完了する細かいやりとり

出力はJSON配列のみ。説明文なし。
形式:
[
  {
    "title": "タスクの簡潔なタイトル（50文字以内）",
    "priority": "High" | "Medium" | "Low",
    "dueDate": "YYYY-MM-DD" (あれば、なければ省略),
    "reason": "なぜこれがタスクか、根拠となる会話の概要（100文字以内）",
    "channel": "チャンネル名"
  }
]

優先度の基準:
- High: 期日が今週中、または経営に直結する重要事項
- Medium: 通常業務
- Low: 長期構想・検討事項`;

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `以下のSlackメッセージを分析し、永井さんの未完了タスクを抽出してください:\n\n${formatted}` }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as any;
  const text = data.content?.[0]?.text || '';

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    return JSON.parse(jsonMatch[0]) as ExtractedTask[];
  } catch {
    return [];
  }
}

/** DM 送信 */
export async function sendDM(userId: string, text: string, blocks?: any[]): Promise<string | null> {
  // DM チャンネル開く
  const open = await slackAPI('conversations.open', { users: userId });
  if (!open.ok) return null;
  const channel = open.channel.id;

  const msg = await slackAPI('chat.postMessage', { channel, text, blocks });
  return msg.ok ? msg.ts : null;
}

/** 抽出タスクを Block Kit で整形 */
export function buildTasksBlocks(tasks: ExtractedTask[], days: number): any[] {
  if (tasks.length === 0) {
    return [
      { type: 'section', text: { type: 'mrkdwn', text: `過去${days}日間のSlackを確認しましたが、新しいタスクは見つかりませんでした。` } },
    ];
  }

  const blocks: any[] = [
    { type: 'header', text: { type: 'plain_text', text: `タスク候補 ${tasks.length}件 (過去${days}日分)` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: '内容を確認して、Notionに登録するタスクを選んでください' }] },
    { type: 'divider' },
  ];

  tasks.forEach((t, i) => {
    const priorityEmoji = t.priority === 'High' ? ':red_circle:' : t.priority === 'Medium' ? ':large_orange_circle:' : ':large_blue_circle:';
    const dueText = t.dueDate ? ` | 期日: ${t.dueDate}` : '';
    const channelText = t.channel ? ` | #${t.channel}` : '';

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `${priorityEmoji} *${t.title}*\n_${t.reason}_\n${t.priority}${dueText}${channelText}` },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: '登録' },
        style: 'primary',
        action_id: `add_task_${i}`,
        value: JSON.stringify(t).slice(0, 1900),
      },
    });
  });

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: `すべて登録 (${tasks.length}件)` },
        style: 'primary',
        action_id: 'add_all_tasks',
        value: JSON.stringify(tasks).slice(0, 1900),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'キャンセル' },
        action_id: 'cancel_tasks',
      },
    ],
  });

  return blocks;
}

/** 抽出タスクを Notion に登録 */
export async function addTasksToNotion(tasks: ExtractedTask[]): Promise<number> {
  let count = 0;
  for (const t of tasks) {
    try {
      await createTask({
        title: t.title,
        priority: t.priority,
        dueDate: t.dueDate,
        source: 'slack',
        sourceMessage: t.reason,
      });
      count++;
    } catch (e) {
      console.error('[task-extractor] failed to add:', t.title, e);
    }
  }
  return count;
}
