/** Slack/Calendar/Gmail から永井のタスクを抽出 */
import { createTask } from './tasks';
import { getTodayEvents, type CalendarEvent } from './google-calendar';
import { getPersonalEmailsNeedingReply, type GmailThread } from './gmail';

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

export type ExtractResult = {
  tasks: ExtractedTask[];
  calendar: CalendarEvent[];
  emails: GmailThread[];
};

/** 過去 days 日分の監視対象チャンネルからメッセージを取得 */
async function fetchRecentMessages(days: number): Promise<Array<{ channel: string; channelId: string; text: string; user: string; ts: string; isIm: boolean }>> {
  const oldest = String(Math.floor(Date.now() / 1000) - days * 86400);
  const results: Array<{ channel: string; channelId: string; text: string; user: string; ts: string; isIm: boolean }> = [];

  // Bot が参加中のチャンネル一覧（DM/グループDM含む）
  let cursor: string | undefined;
  const channels: Array<{ id: string; name: string; isIm: boolean; user?: string }> = [];
  do {
    const qs = cursor ? `&cursor=${cursor}` : '';
    const res = await slackAPI(`users.conversations?types=public_channel,private_channel,im,mpim&limit=200${qs}`);
    if (!res.ok) {
      console.error('[task-extractor] users.conversations failed:', res.error);
      break;
    }
    for (const ch of res.channels || []) {
      channels.push({
        id: ch.id,
        name: ch.name || (ch.is_im ? `DM` : 'channel'),
        isIm: !!ch.is_im || !!ch.is_mpim,
        user: ch.user,
      });
    }
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
          isIm: ch.isIm,
        });
      }
    } catch {}
  }

  return results;
}

/** Slack user ID からユーザー名を取得（キャッシュ付き） */
const userNameCache = new Map<string, string>();
async function getUserName(userId: string): Promise<string> {
  if (!userId) return '';
  if (userNameCache.has(userId)) return userNameCache.get(userId)!;
  try {
    const res = await slackAPI(`users.info?user=${userId}`);
    const name = res.user?.real_name || res.user?.profile?.display_name || res.user?.name || userId;
    userNameCache.set(userId, name);
    return name;
  } catch {
    return userId;
  }
}

/** Claude でタスク抽出（Slack + Calendar + Gmail） */
export async function extractAll(days = 7): Promise<ExtractResult> {
  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const ownerId = OWNER_USER_ID();

  // 並列でデータ取得
  const [slackResult, calResult, emailResult] = await Promise.allSettled([
    fetchRecentMessages(days),
    getTodayEvents(),
    getPersonalEmailsNeedingReply(30),
  ]);

  const messages = slackResult.status === 'fulfilled' ? slackResult.value : [];
  const calendar = calResult.status === 'fulfilled' ? calResult.value : [];
  const emails = emailResult.status === 'fulfilled' ? emailResult.value : [];

  // 永井関連のメッセージに絞る（DMは全メッセージ対象）
  const relevant = messages.filter((m) => {
    if (m.isIm) return true; // DM/グループDMは全てが1:1会話なので全部対象
    if (m.user === ownerId) return true;
    if (m.text.includes(`<@${ownerId}>`)) return true;
    if (m.text.includes('永井')) return true;
    return false;
  });

  if (relevant.length === 0 && emails.length === 0) {
    return { tasks: [], calendar, emails };
  }

  // Slack ユーザー名を解決（ユニークな user ID について）
  const uniqueUsers = Array.from(new Set(relevant.map((m) => m.user).filter(Boolean)));
  await Promise.all(uniqueUsers.map((u) => getUserName(u)));

  // Claude に渡すため整形
  const slackText = relevant
    .slice(-200)
    .map((m) => {
      const userName = m.user === ownerId ? '永井' : (userNameCache.get(m.user) || m.user);
      const prefix = m.isIm ? `[DM:${m.channel}]` : `[#${m.channel}]`;
      return `${prefix} ${userName}: ${m.text}`;
    })
    .join('\n');

  const emailText = emails
    .slice(0, 30)
    .map((e) => `[${e.isImportant ? '重要' : '通常'}] From: ${e.from} | 件名: ${e.subject} | ${e.snippet.slice(0, 200)}`)
    .join('\n');

  const formatted = `
=== Slack メッセージ（永井関連） ===
${slackText || '(該当なし)'}

=== 個人メール（一斉配信除外済み） ===
${emailText || '(該当なし)'}
`;

  const systemPrompt = `あなたは株式会社結びの経営者・永井さんの秘書です。
SlackのメッセージとGmailから、以下のいずれかに該当する「未完了」のタスクを抽出してください:
1. 永井さんが「やります」「対応します」「確認します」などと宣言したもの
2. 他の人から永井さんに依頼・質問されたもの
3. 永井さんが検討・決定すべき事項
4. 個人メールで返信が必要なもの（質問・依頼・相談）

【重要】以下は除外してください:
- すでに相手からの返信で完了と判断できるもの
- 単なる雑談・相槌
- 既に別の人が引き取った作業
- 会議の日程調整など、特定の時点で完了する細かいやりとり
- メールマガジン、自動通知、広告などの一斉配信

出力はJSON配列のみ。説明文なし。
形式:
[
  {
    "title": "タスクの簡潔なタイトル（50文字以内）",
    "priority": "High" | "Medium" | "Low",
    "dueDate": "YYYY-MM-DD" (あれば、なければ省略),
    "reason": "なぜこれがタスクか、根拠となる会話の概要（100文字以内）",
    "channel": "チャンネル名 または メール"
  }
]

優先度の基準:
- High: 期日が今週中、または経営に直結する重要事項、個人メールで返信未送信
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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `以下の情報を分析し、永井さんの未完了タスクを抽出してください:\n${formatted}` }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as any;
  const text = data.content?.[0]?.text || '';

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return { tasks: [], calendar, emails };

  try {
    const tasks = JSON.parse(jsonMatch[0]) as ExtractedTask[];
    return { tasks, calendar, emails };
  } catch {
    return { tasks: [], calendar, emails };
  }
}

/** 後方互換: タスクのみ返す */
export async function extractTasks(days = 7): Promise<ExtractedTask[]> {
  const r = await extractAll(days);
  return r.tasks;
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

function formatTime(iso: string): string {
  if (!iso.includes('T')) return '終日';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function cleanFromName(from: string): string {
  // "Name <email>" を Name に、または email のみ
  const m = from.match(/^(.+?)\s*<.*>$/);
  if (m) return m[1].replace(/"/g, '').trim();
  return from;
}

/** 抽出結果を Block Kit で整形（Calendar + Email + Tasks） */
export function buildTasksBlocks(arg: ExtractedTask[] | ExtractResult, days: number): any[] {
  // 後方互換: ExtractedTask[] も受け付ける
  const result: ExtractResult = Array.isArray(arg)
    ? { tasks: arg, calendar: [], emails: [] }
    : arg;

  const { tasks, calendar, emails } = result;

  const blocks: any[] = [
    { type: 'header', text: { type: 'plain_text', text: `タスクチェック (過去${days}日分)` } },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `:calendar: ${calendar.length}件の予定 | :email: ${emails.length}件の要返信メール | :clipboard: ${tasks.length}件のタスク候補`,
        },
      ],
    },
    { type: 'divider' },
  ];

  // === カレンダー ===
  if (calendar.length > 0) {
    const lines = calendar.map((e) => {
      const time = formatTime(e.start);
      const meet = e.hangoutLink ? ' :video_camera:' : '';
      const loc = e.location ? ` @ ${e.location}` : '';
      return `• *${time}* ${e.summary}${meet}${loc}`;
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `:calendar: *今日のスケジュール*\n${lines.join('\n')}` },
    });
    blocks.push({ type: 'divider' });
  }

  // === 個人メール（要返信） ===
  if (emails.length > 0) {
    const lines = emails.slice(0, 10).map((e) => {
      const star = e.isImportant ? ':star: ' : '';
      const fromName = cleanFromName(e.from);
      return `• ${star}*${e.subject}* — _${fromName}_`;
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `:email: *要返信メール (個人発信)*\n${lines.join('\n')}` },
    });
    blocks.push({ type: 'divider' });
  }

  // === タスク候補 ===
  if (tasks.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: ':clipboard: *タスク候補*\n_新しいタスクは見つかりませんでした_' },
    });
    return blocks;
  }

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `:clipboard: *タスク候補 ${tasks.length}件*\n_内容を確認してNotionに登録するタスクを選んでください_` },
  });

  tasks.forEach((t, i) => {
    const priorityEmoji =
      t.priority === 'High' ? ':red_circle:' : t.priority === 'Medium' ? ':large_orange_circle:' : ':large_blue_circle:';
    const dueText = t.dueDate ? ` | 期日: ${t.dueDate}` : '';
    const channelText = t.channel ? ` | ${t.channel}` : '';

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
