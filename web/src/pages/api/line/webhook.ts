import type { APIRoute } from 'astro';
import { verifySignature, getProfile, type LineWebhookEvent } from '@/lib/line';
import * as members from '@/lib/crm/members';
import * as timeline from '@/lib/crm/timeline';
import * as rules from '@/lib/crm/rules';
import { dispatch } from '@/lib/crm/notify';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();
  const signature = request.headers.get('x-line-signature');

  if (!verifySignature(raw, signature)) {
    return new Response('invalid signature', { status: 401 });
  }

  let body: { events?: LineWebhookEvent[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const events = body.events || [];

  // LINE は 1分以内のACK を期待する。処理が遅くなる場合は早期 200 を返す戦略もあるが
  // ここでは件数が少ない前提で同期処理する。重複耐性は eventId ベースの冪等で担保。
  for (const ev of events) {
    try {
      await handleEvent(ev);
    } catch (e) {
      console.error('[line/webhook] event error', e);
    }
  }
  return new Response('ok', { status: 200 });
};

async function handleEvent(ev: LineWebhookEvent): Promise<void> {
  const userId = ev.source?.userId;
  if (!userId) return;

  // 1) 会員解決（無ければ follow 時に暫定登録）
  let member = await members.getByLineUserId(userId);
  if (!member) {
    if (ev.type === 'follow' || ev.type === 'message') {
      const prof = await getProfile(userId);
      member = await members.createProvisional(userId, prof?.displayName || '');
    } else {
      return;
    }
  }

  // 2) イベント種別ごとに処理
  if (ev.type === 'message' && ev.message?.type === 'text') {
    const content = ev.message.text || '';
    const occurredAt = new Date(ev.timestamp || Date.now()).toISOString();
    const entry = await timeline.append({
      memberPageId: member.pageId,
      occurredAt,
      kind: 'LINE受信',
      content,
      source: 'LINE',
      eventId: ev.webhookEventId,
    });
    // 「受信」のみで last-reply を更新（送信では更新しない）
    await members.setLastReplyAt(member.pageId, occurredAt);

    // 3) ルール評価 — LINE受信トリガーがあれば発火
    const matched = await rules.evaluate({ triggerKind: 'line-in' });
    for (const r of matched) {
      await dispatch({ member, event: entry, rule: r });
    }
  } else if (ev.type === 'follow') {
    // 新規登録のシステムログのみ
    await timeline.append({
      memberPageId: member.pageId,
      occurredAt: new Date(ev.timestamp || Date.now()).toISOString(),
      kind: 'システム',
      content: `LINE友だち追加 (userId: ${userId})`,
      source: 'システム',
      eventId: ev.webhookEventId,
    });
  } else if (ev.type === 'unfollow') {
    await timeline.append({
      memberPageId: member.pageId,
      occurredAt: new Date(ev.timestamp || Date.now()).toISOString(),
      kind: 'システム',
      content: 'LINE友だち解除',
      source: 'システム',
      eventId: ev.webhookEventId,
    });
  }
}
