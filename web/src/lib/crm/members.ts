/** 結び会員マスター DB CRUD */
import {
  queryDatabase,
  createPage,
  updatePage,
  retrievePage,
  propTitle,
  propText,
  propNumber,
  propSelect,
  propDate,
  propPeople,
  buildTitle,
  buildRichText,
  buildSelect,
  buildDate,
} from './_client';

export type Member = {
  pageId: string;
  name: string;
  memberId: string;
  federationId: string;
  lineUserId: string;
  status: string | null; // '活動中' | '交際中' | '休会' | '退会'
  age: number | null;
  occupation: string;
  joinedAt: string | null;
  planners: Array<{ id: string; name?: string }>;
  personalityNotes: string;
  lastReplyAt: string | null;
};

function getDbId(): string {
  const id = import.meta.env.NOTION_CRM_MEMBERS_DB_ID;
  if (!id) throw new Error('NOTION_CRM_MEMBERS_DB_ID is not set');
  return id;
}

function parseMember(page: any): Member {
  const p = page.properties || {};
  return {
    pageId: page.id,
    name: propTitle(p['氏名']),
    memberId: propText(p['会員ID']),
    federationId: propText(p['連盟ID']),
    lineUserId: propText(p['LINE userId']),
    status: propSelect(p['ステータス']),
    age: propNumber(p['年齢']),
    occupation: propText(p['職業']),
    joinedAt: propDate(p['入会日']),
    planners: propPeople(p['担当プランナー']),
    personalityNotes: propText(p['性格・趣向性メモ']),
    lastReplyAt: propDate(p['最終LINE返信日時']),
  };
}

export async function getById(memberIdOrPageId: string): Promise<Member | null> {
  // pageId (UUID形式) ならretrieve、そうでなければ会員ID検索
  const isUuid = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(memberIdOrPageId);
  if (isUuid) {
    try {
      const page = await retrievePage(memberIdOrPageId);
      return page && !page.archived ? parseMember(page) : null;
    } catch {
      return null;
    }
  }
  const rows = await queryDatabase(getDbId(), {
    filter: { property: '会員ID', rich_text: { equals: memberIdOrPageId } },
    page_size: 1,
  });
  return rows[0] ? parseMember(rows[0]) : null;
}

export async function getByLineUserId(lineUserId: string): Promise<Member | null> {
  if (!lineUserId) return null;
  const rows = await queryDatabase(getDbId(), {
    filter: { property: 'LINE userId', rich_text: { equals: lineUserId } },
    page_size: 1,
  });
  return rows[0] ? parseMember(rows[0]) : null;
}

export async function getByFederationId(federationId: string): Promise<Member | null> {
  if (!federationId) return null;
  const rows = await queryDatabase(getDbId(), {
    filter: { property: '連盟ID', rich_text: { contains: federationId } },
    page_size: 1,
  });
  return rows[0] ? parseMember(rows[0]) : null;
}

export async function listActive(): Promise<Member[]> {
  const rows = await queryDatabase(getDbId(), {
    filter: {
      or: [
        { property: 'ステータス', select: { equals: '活動中' } },
        { property: 'ステータス', select: { equals: '交際中' } },
      ],
    },
  });
  return rows.map(parseMember);
}

/** LINE userId をキーに会員を作成（初回follow時の暫定登録用） */
export async function createProvisional(lineUserId: string, displayName: string): Promise<Member> {
  const page = await createPage(
    { database_id: getDbId().replace(/-/g, '') },
    {
      氏名: buildTitle(displayName || '（未設定）'),
      'LINE userId': buildRichText(lineUserId),
      ステータス: buildSelect('活動中'),
    },
  );
  return parseMember(page);
}

export async function setLastReplyAt(pageId: string, iso: string): Promise<void> {
  await updatePage(pageId, { 最終LINE返信日時: buildDate(iso) });
}

export async function updateLineUserId(pageId: string, lineUserId: string): Promise<void> {
  await updatePage(pageId, { 'LINE userId': buildRichText(lineUserId) });
}
