import type { APIRoute } from 'astro';
import { getLatestPerUser, addAttendance, popLatestReminderId } from '@/lib/sheets';
import { postToAttendanceChannel, cancelScheduledMessage } from '@/lib/slack';

const AUTO_CHECKOUT_HOURS = 48;

export const GET: APIRoute = async ({ request }) => {
  // Vercel Cron 認証 (CRON_SECRET 設定時のみ)
  const secret = import.meta.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('unauthorized', { status: 401 });
  }

  const latest = await getLatestPerUser();
  const now = Date.now();
  const results: string[] = [];

  for (const [userId, record] of Object.entries(latest)) {
    if (record.type !== 'in') continue;

    const punchInTime = new Date(`${record.date}T${record.time}:00+09:00`).getTime();
    const elapsedHours = (now - punchInTime) / 3600000;

    if (elapsedHours < AUTO_CHECKOUT_HOURS) continue;

    // リマインダーキャンセル
    const reminderId = await popLatestReminderId(userId);
    if (reminderId) cancelScheduledMessage(reminderId).catch(() => {});

    // 自動退勤
    await addAttendance(userId, record.userName, 'out', 'auto');

    // Slack通知
    await postToAttendanceChannel(
      `<@${userId}> 退勤を忘れていたから代わりにしておいたロボ～🤖 (出勤から${Math.round(elapsedHours)}時間経過)`
    );

    results.push(`${record.userName}: auto checkout after ${Math.round(elapsedHours)}h`);
  }

  return new Response(JSON.stringify({ processed: results.length, details: results }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
