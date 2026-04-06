/** Slack OAuth (Sign in with Slack) + Bot polling */

const CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET!;
const REDIRECT_URI = process.env.SLACK_REDIRECT_URI!;
const TEAM_ID = process.env.SLACK_TEAM_ID || '';

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: 'openid profile email',
    redirect_uri: REDIRECT_URI,
    state
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

/* ===== Attendance polling (出勤/退勤のみ) ===== */
const KEYWORDS: Record<string, 'in' | 'out'> = { '出勤': 'in', '退勤': 'out' };

export async function pollAttendance(): Promise<Array<{ ts: number; userId: string; type: 'in' | 'out' }>> {
  const token = process.env.SLACK_BOT_TOKEN!;
  const channel = process.env.SLACK_ATTENDANCE_CHANNEL_ID!;
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
