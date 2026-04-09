import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { addAttendance, createBooking, addVisitor, getBookings, popLatestReminderId } from '@/lib/sheets';
import { postToAttendanceChannel, schedulePunchOutReminder, cancelScheduledMessage } from '@/lib/slack';

const SIGNING_SECRET = import.meta.env.SLACK_SIGNING_SECRET || '';

function verify(req: Request, body: string): boolean {
  if (!SIGNING_SECRET) return true; // dev fallback
  const ts = req.headers.get('x-slack-request-timestamp') || '';
  const sig = req.headers.get('x-slack-signature') || '';
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const base = `v0:${ts}:${body}`;
  const expected = 'v0=' + crypto.createHmac('sha256', SIGNING_SECRET).update(base).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

function reply(text: string, ephemeral = true) {
  return new Response(JSON.stringify({
    response_type: ephemeral ? 'ephemeral' : 'in_channel',
    text
  }), { headers: { 'Content-Type': 'application/json' } });
}

function todayJST(offset = 0): string {
  const d = new Date();
  d.setHours(d.getHours() + 9 + offset * 24);
  return d.toISOString().slice(0, 10);
}

const ROOMS = ['会議室', '撮影部屋', '洗面所'];

/** 先頭が 今日/明日/明後日/YYYY-MM-DD なら抽出して残りを返す */
function parseDatePrefix(text: string): { date: string; rest: string } {
  const t = text.trim();
  if (/^今日(\s|$)/.test(t)) return { date: todayJST(0), rest: t.replace(/^今日\s*/, '') };
  if (/^明日(\s|$)/.test(t)) return { date: todayJST(1), rest: t.replace(/^明日\s*/, '') };
  if (/^明後日(\s|$)/.test(t)) return { date: todayJST(2), rest: t.replace(/^明後日\s*/, '') };
  const m = t.match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/);
  if (m) return { date: m[1], rest: m[2] };
  return { date: todayJST(0), rest: t };
}

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();
  if (!verify(request, raw)) return new Response('invalid signature', { status: 401 });
  const params = new URLSearchParams(raw);
  const command = params.get('command') || '';
  const text = (params.get('text') || '').trim();
  const userId = params.get('user_id') || '';
  const userName = params.get('user_name') || '';

  try {
    switch (command) {
      case '/出勤': {
        const reminderId = await schedulePunchOutReminder(userId, 10);
        await addAttendance(userId, userName, 'in', 'slack', reminderId);
        return reply(`✅ ${userName} さん 出勤を記録しました`, false);
      }

      case '/退勤': {
        const prevId = await popLatestReminderId(userId);
        if (prevId) cancelScheduledMessage(prevId).catch(() => {});
        await addAttendance(userId, userName, 'out', 'slack');
        return reply(`✅ ${userName} さん 退勤を記録しました`, false);
      }

      case '/予約': {
        // 例: [今日|明日|YYYY-MM-DD] 会議室 14:00-15:00 採用面接
        const { date, rest } = parseDatePrefix(text);
        const m = rest.match(/^(\S+)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s+(.+)$/);
        if (!m) return reply('使い方: `/予約 [今日|明日|2026-04-08] 会議室 14:30-15:45 用件`\n場所: 会議室 / 撮影部屋 / 洗面所');
        const [, room, start, end, title] = m;
        if (!ROOMS.includes(room)) return reply('場所は 会議室 / 撮影部屋 / 洗面所 のいずれか');
        await createBooking({ date, room, start, end, title, userId, userName });
        return reply(`✅ 予約完了: ${date} ${room} ${start}-${end} 「${title}」 (${userName})`, false);
      }

      case '/来客': {
        // 例: [今日|明日|YYYY-MM-DD] 13:00 会議室 田中様 ABC社 業務打合せ
        const { date, rest } = parseDatePrefix(text);
        const m = rest.match(/^(\d{1,2}:\d{2})\s+(\S+)\s+(\S+)(?:\s+(\S+))?(?:\s+(.+))?$/);
        if (!m) return reply('使い方: `/来客 [今日|明日|2026-04-08] 13:30 会議室 田中様 ABC社 業務打合せ`');
        const [, time, place, name, company = '', purpose = ''] = m;
        if (!ROOMS.includes(place)) return reply('場所は 会議室 / 撮影部屋 / 洗面所 のいずれか');
        await addVisitor({ date, time, place, name, company, purpose, host: userName });
        return reply(`✅ 来客登録: ${date} ${time} ${place} ${name} ${company} (担当: ${userName})`, false);
      }

      case '/お知らせ': {
        if (!text) return reply('使い方: `/お知らせ 明日は休みです`');
        // #attendance チャンネルに強制投稿（どのチャンネルで叩かれても）
        await postToAttendanceChannel(`/お知らせ ${userName}: ${text}`);
        return reply(`📢 お知らせを投稿しました`, true);
      }

      case '/一覧': {
        const { date } = parseDatePrefix(text);
        const list = await getBookings(date);
        if (!list.length) return reply(`${date} の予約はありません`);
        const lines = list
          .sort((a, b) => a.start.localeCompare(b.start))
          .map(b => `• ${b.room} ${b.start}-${b.end} ${b.title} (${b.userName})`);
        return reply(`📅 ${date} の予約\n` + lines.join('\n'));
      }

      default:
        return reply(`未対応コマンド: ${command}`);
    }
  } catch (e: any) {
    return reply(`❌ ${e.message}`);
  }
};
