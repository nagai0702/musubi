/** Slack スラッシュコマンド /tasks — 過去のSlackを解析して永井のタスクを抽出 */
import type { APIRoute } from 'astro';
import { verifyHisyoSignature, hisyoSlackAPI } from '@/lib/hisyo';
import { extractTasks, buildTasksBlocks } from '@/lib/task-extractor';

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();
  const ts = request.headers.get('x-slack-request-timestamp');
  const sig = request.headers.get('x-slack-signature');
  if (!verifyHisyoSignature(raw, ts, sig)) {
    return new Response('invalid signature', { status: 401 });
  }

  const params = new URLSearchParams(raw);
  const text = (params.get('text') || '').trim();

  // デフォルト 7 日、引数あれば数値として解釈
  let days = 7;
  const parsed = parseInt(text, 10);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 30) days = parsed;

  const digestChannel = import.meta.env.SLACK_DIGEST_CHANNEL_ID;

  // 非同期処理（3秒以内ACKのため）
  queueMicrotask(async () => {
    try {
      const tasks = await extractTasks(days);
      const blocks = buildTasksBlocks(tasks, days);
      await hisyoSlackAPI('chat.postMessage', {
        channel: digestChannel,
        text: `タスク抽出完了 (${tasks.length}件)`,
        blocks,
      });
    } catch (e: any) {
      await hisyoSlackAPI('chat.postMessage', {
        channel: digestChannel,
        text: `タスク抽出エラー: ${e.message}`,
      });
    }
  });

  // 即レス
  return new Response(
    JSON.stringify({
      response_type: 'ephemeral',
      text: `過去${days}日間のSlackを解析しています... 完了したら <#${digestChannel}> に投稿します。`,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
