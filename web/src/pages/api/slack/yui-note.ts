import type { APIRoute } from 'astro';
import { verifySlackSignature } from '@/lib/slack';
import * as members from '@/lib/crm/members';
import * as timeline from '@/lib/crm/timeline';
import { invalidateSuggestionCache } from '@/lib/crm/suggestion';

export const prerender = false;

/**
 * /yui-note <会員ID or 氏名先頭一致> <本文>
 * 例: /yui-note tanaka 今日電話で体調崩したとのこと
 * Slackは3秒以内ACK必須のため即座に200を返し、処理は waitUntil 的に裏で走らせる。
 */
export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();
  const ts = request.headers.get('x-slack-request-timestamp');
  const sig = request.headers.get('x-slack-signature');
  if (!verifySlackSignature(raw, ts, sig)) {
    return new Response('invalid signature', { status: 401 });
  }

  const params = new URLSearchParams(raw);
  const text = (params.get('text') || '').trim();
  const userName = params.get('user_name') || 'unknown';

  const spaceIdx = text.indexOf(' ');
  const target = spaceIdx > 0 ? text.slice(0, spaceIdx) : text;
  const note = spaceIdx > 0 ? text.slice(spaceIdx + 1).trim() : '';

  if (!target || !note) {
    return respondEphemeral('使い方: `/yui-note <会員ID> <メモ本文>` の形式で入力してください');
  }

  // 非同期に処理（Slackには即ACK）
  queueMicrotask(async () => {
    try {
      const member = await members.getById(target);
      if (!member) return;
      await timeline.append({
        memberPageId: member.pageId,
        occurredAt: new Date().toISOString(),
        kind: 'プランナーメモ',
        content: `[${userName}] ${note}`,
        source: 'プランナー',
      });
      invalidateSuggestionCache(member.pageId);
    } catch (e) {
      console.error('[yui-note] async error', e);
    }
  });

  return respondEphemeral(`メモを受け付けました: \`${target}\` に対する記録を追加します`);
};

function respondEphemeral(text: string): Response {
  return new Response(JSON.stringify({ response_type: 'ephemeral', text }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
