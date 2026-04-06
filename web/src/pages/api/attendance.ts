import type { APIRoute } from 'astro';
import { getAttendance, addAttendance, getLatestPerUser } from '@/lib/sheets';
import { getSession } from '@/lib/session';
import { postToAttendanceChannel } from '@/lib/slack';

function todayJST(): string {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10);
}

export const GET: APIRoute = async ({ url }) => {
  const date = url.searchParams.get('date') || todayJST();
  return new Response(JSON.stringify(await getAttendance(date)), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = getSession(cookies);
  if (!user) return new Response(JSON.stringify({ error: 'ログインが必要です' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const { type } = await request.json();
  if (type !== 'in' && type !== 'out') {
    return new Response(JSON.stringify({ error: 'invalid type' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // 全期間の最新打刻を確認（日またぎ対応）
  const latest = (await getLatestPerUser())[user.id];
  if (latest && latest.type === type) {
    const when = latest.date === todayJST() ? latest.time : `${latest.date} ${latest.time}`;
    const msg = type === 'in'
      ? `すでに出勤済みです (${when})`
      : `すでに退勤済みです (${when})`;
    return new Response(JSON.stringify({ error: msg }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }

  await addAttendance(user.id, user.name, type, 'web');

  // Slack通知
  const label = type === 'in' ? '🟢 出勤' : '🔴 退勤';
  const time = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(11, 16);
  postToAttendanceChannel(`${label} ${user.name} (${time})`).catch(() => {});

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
