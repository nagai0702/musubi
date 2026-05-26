import type { APIRoute } from 'astro';
import { getSession } from '@/lib/session';
import { pushMessage } from '@/lib/line';
import * as members from '@/lib/crm/members';
import * as timeline from '@/lib/crm/timeline';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = getSession(cookies);
  if (!user) return new Response('unauthorized', { status: 401 });

  let body: { memberIdOrPageId?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const text = (body.text || '').trim();
  const idOrPage = body.memberIdOrPageId || '';
  if (!text || !idOrPage) return new Response('missing fields', { status: 400 });

  const member = await members.getById(idOrPage);
  if (!member) return new Response('member not found', { status: 404 });
  if (!member.lineUserId) {
    return new Response('会員に LINE userId が未設定です', { status: 400 });
  }

  await pushMessage(member.lineUserId, text);

  // Timeline に「LINE送信」として記録（最終LINE返信日時は更新しない — 沈黙検知は「受信のみ」基準）
  const occurredAt = new Date().toISOString();
  const entry = await timeline.append({
    memberPageId: member.pageId,
    occurredAt,
    kind: 'LINE送信',
    content: text,
    source: 'プランナー',
  });

  return new Response(JSON.stringify({ ok: true, entryId: entry.pageId }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
