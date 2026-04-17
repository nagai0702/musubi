/** Slack Interactivity — ボタンクリック処理（タスク登録など） */
import type { APIRoute } from 'astro';
import { verifyHisyoSignature } from '@/lib/hisyo';
import { addTasksToNotion, type ExtractedTask } from '@/lib/task-extractor';

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

  // 非同期処理で実行（3秒以内ACKのため）
  queueMicrotask(async () => {
    try {
      if (action.action_id === 'cancel_tasks') {
        await slackAPI('chat.update', {
          channel,
          ts: messageTs,
          text: 'キャンセルしました',
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: ':x: *キャンセルしました*' } }],
        });
        return;
      }

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

      if (action.action_id?.startsWith('add_task_')) {
        const task = JSON.parse(action.value) as ExtractedTask;
        await addTasksToNotion([task]);
        // 元メッセージにリアクション
        await slackAPI('reactions.add', { channel, timestamp: messageTs, name: 'white_check_mark' });
        // エフェメラル通知
        await slackAPI('chat.postEphemeral', {
          channel,
          user: payload.user.id,
          text: `「${task.title}」を登録しました`,
        });
        return;
      }
    } catch (e) {
      console.error('[slack/interactions] error:', e);
    }
  });

  return new Response('', { status: 200 });
};
