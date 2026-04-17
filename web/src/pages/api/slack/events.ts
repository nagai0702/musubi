/** Slack Events API — メッセージ受信 → タスク自動判定 */
import type { APIRoute } from 'astro';
import { verifyHisyoSignature } from '@/lib/hisyo';
import { classifyAndCreateTask } from '@/lib/morning-digest';

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();
  const body = JSON.parse(raw);

  // Slack URL verification challenge（初回セットアップ時）
  if (body.type === 'url_verification') {
    return new Response(JSON.stringify({ challenge: body.challenge }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Slack リトライ時は即 200 返却（重複防止）
  if (request.headers.get('x-slack-retry-num')) {
    return new Response('ok', { status: 200 });
  }

  // 署名検証
  const ts = request.headers.get('x-slack-request-timestamp');
  const sig = request.headers.get('x-slack-signature');
  if (!verifyHisyoSignature(raw, ts, sig)) {
    return new Response('invalid signature', { status: 401 });
  }

  // メッセージイベント処理
  if (body.event?.type === 'message' && !body.event?.bot_id && !body.event?.subtype) {
    const digestChannel = import.meta.env.SLACK_DIGEST_CHANNEL_ID;
    if (body.event.channel === digestChannel) {
      // 非同期処理（3秒以内に 200 返却するため）
      queueMicrotask(async () => {
        try {
          await classifyAndCreateTask({
            text: body.event.text,
            user: body.event.user,
            ts: body.event.ts,
            channel: body.event.channel,
          });
        } catch (e) {
          console.error('[slack/events] task classification error:', e);
        }
      });
    }
  }

  return new Response('ok', { status: 200 });
};
