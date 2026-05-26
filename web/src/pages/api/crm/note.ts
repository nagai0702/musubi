import type { APIRoute } from 'astro';
import { getSession } from '@/lib/session';
import * as members from '@/lib/crm/members';
import * as timeline from '@/lib/crm/timeline';
import { invalidateSuggestionCache } from '@/lib/crm/suggestion';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = getSession(cookies);
  const headerAuth = request.headers.get('x-internal-token');
  const internalOk = headerAuth && headerAuth === import.meta.env.CRM_INTERNAL_TOKEN;
  if (!user && !internalOk) return new Response('unauthorized', { status: 401 });

  let body: { memberIdOrPageId?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const content = (body.content || '').trim();
  const idOrPage = body.memberIdOrPageId || '';
  if (!content || !idOrPage) return new Response('missing fields', { status: 400 });

  const member = await members.getById(idOrPage);
  if (!member) return new Response('member not found', { status: 404 });

  const entry = await timeline.append({
    memberPageId: member.pageId,
    occurredAt: new Date().toISOString(),
    kind: 'プランナーメモ',
    content,
    source: 'プランナー',
  });
  invalidateSuggestionCache(member.pageId);

  return new Response(JSON.stringify({ ok: true, entryId: entry.pageId }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
