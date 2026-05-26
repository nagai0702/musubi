/** 通知ルール DB — プランナーがNotion上で随時追加・調整する */
import {
  queryDatabase,
  propTitle,
  propText,
  propSelect,
  propCheckbox,
} from './_client';

export type RuleTrigger = '連盟イベント' | '沈黙' | 'LINE受信' | 'カスタム';

export type Rule = {
  pageId: string;
  name: string;
  trigger: RuleTrigger | string;
  condition: Record<string, any>;
  template: string;
  enabled: boolean;
};

function getDbId(): string {
  const id = import.meta.env.NOTION_CRM_RULES_DB_ID;
  if (!id) throw new Error('NOTION_CRM_RULES_DB_ID is not set');
  return id;
}

function parseRule(page: any): Rule {
  const p = page.properties || {};
  let cond: Record<string, any> = {};
  const raw = propText(p['条件JSON']);
  if (raw) {
    try {
      cond = JSON.parse(raw);
    } catch {
      /* JSON壊れている場合は空オブジェクト扱い */
    }
  }
  return {
    pageId: page.id,
    name: propTitle(p['ルール名']),
    trigger: (propSelect(p['トリガー種別']) as RuleTrigger) || 'カスタム',
    condition: cond,
    template: propText(p['通知メッセージテンプレ']),
    enabled: propCheckbox(p['有効']),
  };
}

let cache: { rules: Rule[]; cachedAt: number } | null = null;
const CACHE_TTL = 60 * 1000; // 1分

export async function listActive(): Promise<Rule[]> {
  if (cache && Date.now() - cache.cachedAt < CACHE_TTL) return cache.rules;
  const rows = await queryDatabase(getDbId(), {
    filter: { property: '有効', checkbox: { equals: true } },
  });
  const rules = rows.map(parseRule);
  cache = { rules, cachedAt: Date.now() };
  return rules;
}

export function invalidateCache() {
  cache = null;
}

/** 与えられたコンテキストに対しどのルールが発火するか評価 */
export type EvalContext = {
  triggerKind: 'federation' | 'silence' | 'line-in' | 'custom';
  federationEvent?: 'breakup' | 'new-apply' | 'new-receive' | 'reapproach' | string;
  reapproachDays?: number; // 不在日数（reapproach判定用）
  silenceDays?: number; // 沈黙日数
};

export async function evaluate(ctx: EvalContext): Promise<Rule[]> {
  const all = await listActive();
  return all.filter((r) => matches(r, ctx));
}

function matches(rule: Rule, ctx: EvalContext): boolean {
  const c = rule.condition || {};
  const t = c.type;
  if (!t) return false;

  if (ctx.triggerKind === 'federation' && t === 'federation') {
    if (c.event !== ctx.federationEvent) return false;
    if (c.afterDays != null) {
      if ((ctx.reapproachDays ?? 0) < c.afterDays) return false;
    }
    return true;
  }
  if (ctx.triggerKind === 'silence' && t === 'silence') {
    const threshold = typeof c.days === 'number' ? c.days : 7;
    return (ctx.silenceDays ?? 0) >= threshold;
  }
  if (ctx.triggerKind === 'line-in' && t === 'line-in') {
    return true;
  }
  if (ctx.triggerKind === 'custom' && t === 'custom') {
    return true;
  }
  return false;
}

export function renderTemplate(tmpl: string, vars: Record<string, string>): string {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}
