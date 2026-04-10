import type { APIRoute } from 'astro';
import { getLatestPerUser, addAttendance, popLatestReminderId } from '@/lib/sheets';
import { postToAttendanceChannel, cancelScheduledMessage } from '@/lib/slack';

const AUTO_CHECKOUT_HOURS = 48;

const MESSAGES = [
  "今日も一日がんばりましょう！💪",
  "笑顔で乗り越えよう、今日も素敵な一日に✨",
  "小さな一歩が大きな成果につながる🚀",
  "あなたの頑張りは誰かの力になっています🌸",
  "今日のベストを尽くそう、それで十分👍",
  "昨日より成長した自分を信じて🌱",
  "良い一日は良い挨拶から、おはようございます☀️",
  "チームで乗り越えれば何でもできる🤝",
  "今日も最高の一日にしよう🔥",
  "焦らず着実に、一つずつ片付けよう📋",
  "困った時はお互い様、頼り合っていこう💬",
  "休憩も大事な仕事のうち☕",
  "あなたがいるからチームが輝く⭐",
  "新しい発見がある一日になりますように🔍",
  "今週もあと少し、ラストスパート🏃",
  "丁寧な仕事は信頼につながる🎯",
  "今日の努力は未来の自分へのプレゼント🎁",
  "いい天気でもそうでなくても、気持ちは晴れやかに🌈",
  "失敗は成功のもと、チャレンジしていこう💡",
  "みんなの笑顔が最高のエネルギー😊",
  "コツコツ積み重ねた人が最後に勝つ🏆",
  "今日も誰かを幸せにできる一日に💕",
  "深呼吸して、さぁ始めよう🌬️",
  "やるべきことをやる、それが一番カッコいい😎",
  "仲間がいるから頑張れる、今日もよろしく🙌",
  "目の前のことに全力で取り組もう🎯",
  "「ありがとう」を忘れずに、感謝の一日を🙏",
  "今日も結びらしく、温かい一日を🫶",
  "自分を褒めることも忘れずに🌟",
  "ワクワクする気持ちを大切に🎪",
  "一緒に最高のサービスを届けよう💒",
];

function todayMessage(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  return MESSAGES[dayOfYear % MESSAGES.length];
}

export const GET: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('unauthorized', { status: 401 });
  }

  const results: string[] = [];

  // 1. 朝のお知らせ
  const msg = todayMessage();
  await postToAttendanceChannel(`/お知らせ ${msg}`);
  results.push(`morning: ${msg}`);

  // 2. 48時間超え自動退勤
  const latest = await getLatestPerUser();
  const now = Date.now();

  for (const [userId, record] of Object.entries(latest)) {
    if (record.type !== 'in') continue;
    const punchInTime = new Date(`${record.date}T${record.time}:00+09:00`).getTime();
    const elapsedHours = (now - punchInTime) / 3600000;
    if (elapsedHours < AUTO_CHECKOUT_HOURS) continue;

    const reminderId = await popLatestReminderId(userId);
    if (reminderId) cancelScheduledMessage(reminderId).catch(() => {});

    await addAttendance(userId, record.userName, 'out', 'auto');
    await postToAttendanceChannel(
      `<@${userId}> 退勤を忘れていたから代わりにしておいたロボ～🤖 (出勤から${Math.round(elapsedHours)}時間経過)`
    );
    results.push(`auto-checkout: ${record.userName} (${Math.round(elapsedHours)}h)`);
  }

  return new Response(JSON.stringify({ processed: results.length, details: results }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
