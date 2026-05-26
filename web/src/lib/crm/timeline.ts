/** イベントタイムライン DB: append / query / 冪等チェック */
import {
  queryDatabase,
  createPage,
  propTitle,
  propText,
  propSelect,
  propDate,
  propRelation,
  buildTitle,
  buildRichText,
  buildSelect,
  buildDate,
  buildRelation,
} from './_client';

export type TimelineKind =
  | 'LINE受信'
  | 'LINE送信'
  | '申し込み'
  | '申し受け'
  | '交際開始'
  | '交際終了'
  | '打ち合わせ'
  | 'プランナーメモ'
  | 'システム';

export type TimelineSource = 'LINE' | '連盟' | 'プランナー' | 'システム';

export type TimelineEntry = {
  pageId: string;
  memberPageId: string | null;
  title: string;
  occurredAt: string | null;
  kind: string;
  content: string;
  source: string | null;
  eventId: string;
};

export type AppendParams = {
  memberPageId: string;
  occurredAt: string; // ISO-8601
  kind: TimelineKind;
  content: string;
  source: TimelineSource;
  eventId?: string; // 冪等キー (LINE webhookEventId等)
};

function getDbId(): string {
  const id = import.meta.env.NOTION_CRM_TIMELINE_DB_ID;
  if (!id) throw new Error('NOTION_CRM_TIMELINE_DB_ID is not set');
  return id;
}

function parseEntry(page: any): TimelineEntry {
  const p = page.properties || {};
  const rel = propRelation(p['会員']);
  return {
    pageId: page.id,
    memberPageId: rel[0] || null,
    title: propTitle(p['タイトル']),
    occurredAt: propDate(p['発生日時']),
    kind: propSelect(p['種別']) || '',
    content: propText(p['内容']),
    source: propSelect(p['ソース']),
    eventId: propText(p['イベントID']),
  };
}

function buildTitleText(params: AppendParams): string {
  const dt = params.occurredAt.slice(0, 16).replace('T', ' ');
  return `${dt} ${params.kind}`;
}

/** 既にそのeventIdを持つ行が存在するか（LINE webhook重複対策） */
export async function existsByEventId(eventId: string): Promise<boolean> {
  if (!eventId) return false;
  const rows = await queryDatabase(getDbId(), {
    filter: { property: 'イベントID', rich_text: { equals: eventId } },
    page_size: 1,
  });
  return rows.length > 0;
}

export async function append(params: AppendParams): Promise<TimelineEntry> {
  if (params.eventId && (await existsByEventId(params.eventId))) {
    // 冪等 — 既存を返す（検索して返してもいいが、ここでは最小実装）
    const rows = await queryDatabase(getDbId(), {
      filter: { property: 'イベントID', rich_text: { equals: params.eventId } },
      page_size: 1,
    });
    return parseEntry(rows[0]);
  }
  const page = await createPage(
    { database_id: getDbId().replace(/-/g, '') },
    {
      タイトル: buildTitle(buildTitleText(params)),
      会員: buildRelation([params.memberPageId]),
      発生日時: buildDate(params.occurredAt),
      種別: buildSelect(params.kind),
      内容: buildRichText(params.content.slice(0, 1800)),
      ソース: buildSelect(params.source),
      イベントID: buildRichText(params.eventId || ''),
    },
  );
  return parseEntry(page);
}

/** 会員の最新イベント（desc, default 50件） */
export async function recent(memberPageId: string, n = 50): Promise<TimelineEntry[]> {
  const rows = await queryDatabase(getDbId(), {
    filter: { property: '会員', relation: { contains: memberPageId } },
    sorts: [{ property: '発生日時', direction: 'descending' }],
    page_size: Math.min(n, 100),
  });
  return rows.slice(0, n).map(parseEntry);
}

/** 指定種別のイベントが直近 withinDays 日以内にあるか */
export async function hasRecentOfType(memberPageId: string, kind: TimelineKind, withinDays: number): Promise<boolean> {
  const since = new Date(Date.now() - withinDays * 86400 * 1000).toISOString();
  const rows = await queryDatabase(getDbId(), {
    filter: {
      and: [
        { property: '会員', relation: { contains: memberPageId } },
        { property: '種別', select: { equals: kind } },
        { property: '発生日時', date: { on_or_after: since } },
      ],
    },
    page_size: 1,
  });
  return rows.length > 0;
}

/** 最後に指定種別が起きたのが何日前か（無ければ null） */
export async function daysSinceLast(memberPageId: string, kind: TimelineKind): Promise<number | null> {
  const rows = await queryDatabase(getDbId(), {
    filter: {
      and: [
        { property: '会員', relation: { contains: memberPageId } },
        { property: '種別', select: { equals: kind } },
      ],
    },
    sorts: [{ property: '発生日時', direction: 'descending' }],
    page_size: 1,
  });
  const last = rows[0] ? propDate(rows[0].properties['発生日時']) : null;
  if (!last) return null;
  return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
}
