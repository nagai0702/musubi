/** Slack Interactivity — ボタンクリック処理（タスク登録など） */
import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import { verifyHisyoSignature } from '@/lib/hisyo';
import { addTasksToNotion, type ExtractedTask } from '@/lib/task-extractor';
import { recordSkippedTask } from '@/lib/tasks';

const BOT_TOKEN = () => import.meta.env.HISYO_BOT_TOKEN!;

async function slackAPI(method: string, body: any): Promise<any> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: 'Bearer ' + BOT_TOKEN(),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** block_id にインデックス i を含むブロックをメッセージから除去 */
function removeTaskBlocks(blocks: any[], i: number): any[] {
  const targetSection = `task_section_${i}`;
  const targetActions = `task_actions_${i}`;
  return blocks.filter((b: any) => b.block_id !== targetSection && b.block_id !== targetActions);
}

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();
  const ts = request.headers.get('x-slack-request-timestamp');
  const sig = request.headers.get('x-slack-signature');
  if (!verifyHisyoSignature(raw, ts, sig)) {
    return new Response('invalid signature', { status: 401 });
  }

  // Slack Interactivity は payload=<JSON> 形式で送信される
  const params = new URLSearchParams(raw);
  const payload = JSON.parse(params.get('payload') || '{}');

  const action = payload.actions?.[0];
  if (!action) return new Response('ok');

  const channel = payload.channel?.id;
  const messageTs = payload.message?.ts;
  const messageText = payload.message?.text || '';
  const messageBlocks: any[] = payload.message?.blocks || [];

  // 非同期処理で実行（3秒以内ACKのため）— waitUntil でレスポンス後も継続
  waitUntil((async () => {
    try {
      // === キャンセル（全消去） ===
      if (action.action_id === 'cancel_tasks') {
        await slackAPI('chat.update', {
          channel,
          ts: messageTs,
          text: 'キャンセルしました',
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: ':x: *キャンセルしました*' } }],
        });
        return;
      }

      // === すべて登録 ===
      if (action.action_id === 'add_all_tasks') {
        const tasks = JSON.parse(action.value) as ExtractedTask[];
        const count = await addTasksToNotion(tasks);
        await slackAPI('chat.update', {
          channel,
          ts: messageTs,
          text: `${count}件のタスクをNotionに登録しました`,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `:white_check_mark: *${count}件のタスクをNotionに登録しました*` },
            },
          ],
        });
        return;
      }

      // === 個別登録 ===
      if (action.action_id?.startsWith('add_task_')) {
        const i = parseInt(action.action_id.replace('add_task_', ''), 10);
        const task = JSON.parse(action.value) as ExtractedTask;
        await addTasksToNotion([task]);
        // メッセージから該当タスクブロックを削除
        const newBlocks = removeTaskBlocks(messageBlocks, i);
        await slackAPI('chat.update', {
          channel,
          ts: messageTs,
          text: messageText,
          blocks: newBlocks,
        });
        // エフェメラル通知
        await slackAPI('chat.postEphemeral', {
          channel,
          user: payload.user.id,
          text: `:white_check_mark: 「${task.title}」を登録しました`,
        });
        return;
      }

      // === 個別スキップ（登録しない） ===
      if (action.action_id?.startsWith('skip_task_')) {
        const i = parseInt(action.action_id.replace('skip_task_', ''), 10);

        // 該当タスクを messageBlocks から探してタイトル取得 → Notion にスキップ記録
        const sectionBlock = messageBlocks.find((b: any) => b.block_id === `task_section_${i}`);
        const sectionText: string = sectionBlock?.text?.text || '';
        // フォーマット: ":red_circle: *タスク名*\n_理由_\n..."
        const titleMatch = sectionText.match(/\*(.+?)\*/);
        const reasonMatch = sectionText.match(/_(.+?)_/);
        const title = titleMatch?.[1]?.trim() || '';
        const reason = reasonMatch?.[1]?.trim() || '';

        if (title) {
          try {
            await recordSkippedTask({ title, sourceMessage: reason });
          } catch (e) {
            console.error('[interactions] recordSkippedTask failed:', e);
          }
        }

        const newBlocks = removeTaskBlocks(messageBlocks, i);
        await slackAPI('chat.update', {
          channel,
          ts: messageTs,
          text: messageText,
          blocks: newBlocks,
        });
        return;
      }
    } catch (e) {
      console.error('[slack/interactions] error:', e);
    }
  })());

  return new Response('', { status: 200 });
};
