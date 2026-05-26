import type { APIRoute } from 'astro';
import { getSession } from '@/lib/session';
import * as members from '@/lib/crm/members';
import * as timeline from '@/lib/crm/timeline';
import { generateOutreachSuggestion, invalidateSuggestionCache } from '@/lib/crm/suggestion';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = getSession(cookies);
  if (!user) return new Response('unauthorized', { status: 401 });

  let body: { memberIdOrPageId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const idOrPage = body.memberIdOrPageId || '';
  if (!idOrPage) return new Response('missing fields', { status: 400 });

  const member = await members.getById(idOrPage);
  if (!member) return new Response('member not found', { status: 404 });

  invalidateSuggestionCache(member.pageId);
  const recent = await timeline.recent(member.pageId, 20);
  const latest = recent[0] || null;
  const sug = await generateOutreachSuggestion(member, latest, recent);

  return new Response(JSON.stringify({ ok: true, suggestion: sug }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
