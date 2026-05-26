import type { APIRoute } from 'astro';
import * as members from '@/lib/crm/members';
import * as timeline from '@/lib/crm/timeline';
import * as rules from '@/lib/crm/rules';
import { dispatch } from '@/lib/crm/notify';

export const prerender = false;

/**
 * Chrome拡張から送られてくる連盟イベント。x-ext-token で認証。
 * body: { type: 'breakup'|'new-apply'|'new-receive'|'reapproach', 連盟ID, observedAt, raw }
 */
export const POST: APIRoute = async ({ request }) => {
  const expected = import.meta.env.CRM_EXT_TOKEN;
  const token = request.headers.get('x-ext-token');
  if (!expected || token !== expected) {
    return new Response('unauthorized', { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }

  // ping のみは疎通確認
  if (body?.ping) {
    return new Response(JSON.stringify({ ok: true, ping: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { type, federationId, observedAt, raw, eventId, reapproachDays } = body || {};
  if (!type || !federationId) return new Response('missing fields', { status: 400 });

  const member = await members.getByFederationId(federationId);
  if (!member) {
    console.warn(`[federation-event] member not found: federationId=${federationId}`);
    return new Response(JSON.stringify({ ok: false, reason: 'member not found' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const kind =
    type === 'breakup' ? '交際終了' :
    type === 'new-apply' ? '申し込み' :
    type === 'new-receive' ? '申し受け' :
    type === 'reapproach' ? (raw?.direction === 'receive' ? '申し受け' : '申し込み') :
    'システム';

  const content = JSON.stringify(raw ?? {}, null, 0).slice(0, 1500);
  const entry = await timeline.append({
    memberPageId: member.pageId,
    occurredAt: observedAt || new Date().toISOString(),
    kind: kind as any,
    content,
    source: '連盟',
    eventId,
  });

  const matched = await rules.evaluate({
    triggerKind: 'federation',
    federationEvent: type,
    reapproachDays,
  });
  for (const r of matched) {
    await dispatch({ member, event: entry, rule: r });
  }

  return new Response(JSON.stringify({ ok: true, triggered: matched.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
