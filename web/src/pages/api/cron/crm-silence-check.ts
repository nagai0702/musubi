import type { APIRoute } from 'astro';
import * as members from '@/lib/crm/members';
import * as timeline from '@/lib/crm/timeline';
import * as rules from '@/lib/crm/rules';
import { dispatch } from '@/lib/crm/notify';

export const prerender = false;

/**
 * 沈黙検知 cron。ENV CRON_SECRET があれば Bearer 認証。
 * - 有効な「沈黙」ルールをすべて列挙し閾値の最小値を取得
 * - 活動中/交際中の会員を走査し、last-reply から閾値超過なら dispatch
 * - 二重通知防止: その日すでに 'システム' 種別の `[silence-check] memberId=...` が存在すれば skip
 */
export const GET: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('unauthorized', { status: 401 });
  }

  const activeRules = (await rules.listActive()).filter((r) => r.trigger === '沈黙');
  if (activeRules.length === 0) {
    return json({ processed: 0, skipped: 0, note: 'no silence rules active' });
  }

  const active = await members.listActive();
  const today = new Date().toISOString().slice(0, 10);

  let processed = 0;
  let skipped = 0;
  const details: string[] = [];

  for (const m of active) {
    if (!m.lastReplyAt) continue;
    const daysSince = Math.floor((Date.now() - new Date(m.lastReplyAt).getTime()) / 86400000);

    const matched = await rules.evaluate({ triggerKind: 'silence', silenceDays: daysSince });
    if (matched.length === 0) continue;

    // 冪等: 今日すでに silence 通知を送っていればスキップ
    const dedupeKey = `[silence-check:${today}] memberPageId=${m.pageId}`;
    const already = await timeline.hasRecentOfType(m.pageId, 'システム', 2);
    if (already) {
      // 直近2日の"システム"行のうちキー一致を確認
      const recent = await timeline.recent(m.pageId, 10);
      if (recent.some((e) => e.kind === 'システム' && e.content.includes(`[silence-check:${today}]`))) {
        skipped++;
        continue;
      }
    }

    const latest = (await timeline.recent(m.pageId, 1))[0] || null;
    for (const r of matched) {
      const eventStub = latest || {
        pageId: '',
        memberPageId: m.pageId,
        title: '沈黙検知',
        occurredAt: new Date().toISOString(),
        kind: 'システム',
        content: `最終返信から${daysSince}日`,
        source: 'システム',
        eventId: '',
      };
      await dispatch({ member: m, event: eventStub as any, rule: r });
    }

    // 冪等マーカーを timeline に残す
    await timeline.append({
      memberPageId: m.pageId,
      occurredAt: new Date().toISOString(),
      kind: 'システム',
      content: dedupeKey,
      source: 'システム',
    });

    processed++;
    details.push(`${m.name}: ${daysSince}日`);
  }

  return json({ processed, skipped, details });
};

function json(obj: any): Response {
  return new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });
}
