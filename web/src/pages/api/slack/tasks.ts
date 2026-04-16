/** Slack スラッシュコマンド /tasks — 過去のSlackを解析して永井のタスクを抽出 */
import type { APIRoute } from 'astro';
import { verifySlackSignature } from '@/lib/slack';
import { extractTasks, sendDM, buildTasksBlocks } from '@/lib/task-extractor';

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();
  const ts = request.headers.get('x-slack-request-timestamp');
  const sig = request.headers.get('x-slack-signature');
  if (!verifySlackSignature(raw, ts, sig)) {
    return new Response('invalid signature', { status: 401 });
  }

  const params = new URLSearchParams(raw);
  const userId = params.get('user_id') || '';
  const text = (params.get('text') || '').trim();

  // デフォルト 7 日、引数あれば数値として解釈
  let days = 7;
  const parsed = parseInt(text, 10);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 30) days = parsed;

  // 非同期処理（3秒以内ACKのため）
  queueMicrotask(async () => {
    try {
      const tasks = await extractTasks(days);
      const blocks = buildTasksBlocks(tasks, days);
      await sendDM(userId, `タスク抽出完了 (${tasks.length}件)`, blocks);
    } catch (e: any) {
      await sendDM(userId, `タスク抽出エラー: ${e.message}`);
    }
  });

  // 即レス
  return new Response(
    JSON.stringify({
      response_type: 'ephemeral',
      text: `過去${days}日間のSlackを解析しています... 完了したらDMでお知らせします。`,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
