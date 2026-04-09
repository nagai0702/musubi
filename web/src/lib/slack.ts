/** Slack OAuth (Sign in with Slack) + Bot polling */

const CLIENT_ID = import.meta.env.SLACK_CLIENT_ID!;
const CLIENT_SECRET = import.meta.env.SLACK_CLIENT_SECRET!;
const REDIRECT_URI = import.meta.env.SLACK_REDIRECT_URI!;
const TEAM_ID = import.meta.env.SLACK_TEAM_ID || '';

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: 'openid profile email',
    redirect_uri: REDIRECT_URI,
    state,
    nonce: crypto.randomUUID()
  });
  if (TEAM_ID) params.set('team', TEAM_ID);
  return 'https://slack.com/openid/connect/authorize?' + params.toString();
}

export async function exchangeCode(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI
  });
  const res = await fetch('https://slack.com/api/openid.connect.token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json() as any;
  if (!data.ok) throw new Error('slack token error: ' + (data.error || 'unknown'));

  const userRes = await fetch('https://slack.com/api/openid.connect.userInfo', {
    headers: { Authorization: 'Bearer ' + data.access_token }
  });
  const user = await userRes.json() as any;
  return {
    id: user.sub || user['https://slack.com/user_id'],
    name: user.name || user.given_name || 'unknown',
    email: user.email || ''
  };
}

/** Slack ユーザー情報をキャッシュ付きで取得 */
const userCache = new Map<string, { name: string; image: string; cachedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1時間

export async function getSlackUser(userId: string): Promise<{ name: string; image: string }> {
  const token = import.meta.env.SLACK_BOT_TOKEN;
  if (!token || !userId) return { name: '', image: '' };
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return { name: cached.name, image: cached.image };
  }
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json() as any;
    if (!data.ok) return { name: '', image: '' };
    const p = data.user.profile || {};
    const info = {
      name: p.real_name || data.user.real_name || data.user.name || '',
      image: p.image_192 || p.image_72 || p.image_48 || ''
    };
    userCache.set(userId, { ...info, cachedAt: Date.now() });
    return info;
  } catch {
    return { name: '', image: '' };
  }
}

/** お知らせチャンネルの直近メッセージを取得 */
export async function getNotices(limit = 10): Promise<Array<{ ts: string; text: string; userName: string; image: string }>> {
  const token = import.meta.env.SLACK_BOT_TOKEN;
  const channel = import.meta.env.SLACK_NOTICE_CHANNEL_ID;
  if (!token || !channel) return [];
  try {
    const res = await fetch(`https://slack.com/api/conversations.history?channel=${channel}&limit=${limit}`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json() as any;
    if (!data.ok) return [];
    const PREFIX = /^\/?お知らせ[\s　]+/;
    const messages = (data.messages || [])
      .filter((m: any) => !m.subtype && m.text && PREFIX.test(m.text))
      .map((m: any) => ({ ...m, text: m.text.replace(PREFIX, '').trim() }))
      .filter((m: any) => m.text);
    const result = await Promise.all(messages.map(async (m: any) => {
      const u = m.user ? await getSlackUser(m.user) : { name: '', image: '' };
      return { ts: m.ts, text: m.text, userName: u.name || 'unknown', image: u.image };
    }));
    return result;
  } catch {
    return [];
  }
}

/** #attendance チャンネルにメッセージ投稿 */
export async function postToAttendanceChannel(text: string): Promise<void> {
  const token = import.meta.env.SLACK_BOT_TOKEN;
  const channel = import.meta.env.SLACK_ATTENDANCE_CHANNEL_ID;
  if (!token || !channel) return;
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ channel, text })
  });
}

/* ===== Attendance polling (出勤/退勤のみ) ===== */
const KEYWORDS: Record<string, 'in' | 'out'> = { '出勤': 'in', '退勤': 'out' };

export async function pollAttendance(): Promise<Array<{ ts: number; userId: string; type: 'in' | 'out' }>> {
  const token = import.meta.env.SLACK_BOT_TOKEN!;
  const channel = import.meta.env.SLACK_ATTENDANCE_CHANNEL_ID!;
  const oldest = Math.floor(Date.now() / 1000) - 600; // 直近10分
  const url = `https://slack.com/api/conversations.history?channel=${channel}&oldest=${oldest}&limit=200`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const data = await res.json() as any;
  if (!data.ok) throw new Error('slack: ' + data.error);
  const out: Array<{ ts: number; userId: string; type: 'in' | 'out' }> = [];
  for (const m of data.messages || []) {
    if (m.subtype) continue;
    const t = KEYWORDS[(m.text || '').trim()];
    if (!t) continue;
    out.push({ ts: parseFloat(m.ts), userId: m.user, type: t });
  }
  return out;
}
