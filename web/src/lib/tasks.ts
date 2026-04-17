/** Notion Tasks DB — タスク管理 CRUD（個人 Notion アカウント用） */

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

function getApiKey(): string {
  const key = import.meta.env.NOTION_PERSONAL_API_KEY;
  if (!key) throw new Error('NOTION_PERSONAL_API_KEY is not set');
  return key;
}

function getDbId(): string {
  const id = import.meta.env.NOTION_TASKS_DB_ID;
  if (!id) throw new Error('NOTION_TASKS_DB_ID is not set');
  return id;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

/* ---------- Notion REST helpers (personal account) ---------- */

async function queryDatabase(dbId: string, body: any = {}): Promise<any[]> {
  const id = dbId.replace(/-/g, '');
  const results: any[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`${NOTION_API}/databases/${id}/query`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(cursor ? { ...body, start_cursor: cursor } : body),
    });
    if (!res.ok) throw new Error(`Notion query failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as any;
    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

async function createPage(parent: any, properties: any): Promise<any> {
  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ parent, properties }),
  });
  if (!res.ok) throw new Error(`Notion create page failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as any;
}

async function updatePage(pageId: string, properties: any): Promise<any> {
  const res = await fetch(`${NOTION_API}/pages/${pageId.replace(/-/g, '')}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`Notion update page failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as any;
}

/* ---------- property helpers ---------- */

function buildTitle(text: string) {
  return { title: [{ type: 'text', text: { content: text } }] };
}
function buildRichText(text: string) {
  return { rich_text: text ? [{ type: 'text', text: { content: text } }] : [] };
}
function buildSelect(name: string | null) {
  return name ? { select: { name } } : { select: null };
}
function buildDate(iso: string | null) {
  return iso ? { date: { start: iso } } : { date: null };
}

function propTitle(p: any): string {
  return (p?.title || []).map((t: any) => t.plain_text || '').join('').trim();
}
function propText(p: any): string {
  return (p?.rich_text || []).map((t: any) => t.plain_text || '').join('').trim();
}
function propSelect(p: any): string | null {
  return p?.select?.name || null;
}
function propDate(p: any): string | null {
  return p?.date?.start || null;
}

/* ---------- Task type & CRUD ---------- */

export type Task = {
  pageId: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  source: string;
  sourceMessage: string;
  createdAt: string;
};

function toTask(page: any): Task {
  const p = page.properties;
  return {
    pageId: page.id,
    title: propTitle(p['タスク名']),
    status: propSelect(p['ステータス']) || 'Todo',
    priority: propSelect(p['優先度']) || 'Medium',
    dueDate: propDate(p['期日']),
    source: propSelect(p['ソース']) || '',
    sourceMessage: propText(p['元メッセージ']),
    createdAt: page.created_time || '',
  };
}

export async function createTask(params: {
  title: string;
  priority?: string;
  dueDate?: string;
  source?: string;
  sourceMessage?: string;
}): Promise<Task> {
  const properties: Record<string, any> = {
    'タスク名': buildTitle(params.title),
    'ステータス': buildSelect('Todo'),
    '優先度': buildSelect(params.priority || 'Medium'),
    'ソース': buildSelect(params.source || 'slack'),
  };
  if (params.dueDate) properties['期日'] = buildDate(params.dueDate);
  if (params.sourceMessage) {
    properties['元メッセージ'] = buildRichText(params.sourceMessage.slice(0, 1800));
  }

  const page = await createPage({ database_id: getDbId() }, properties);
  return toTask(page);
}

export async function listTasks(status?: string): Promise<Task[]> {
  const filter = status
    ? { filter: { property: 'ステータス', select: { equals: status } } }
    : {};
  const pages = await queryDatabase(getDbId(), {
    ...filter,
    sorts: [{ property: '期日', direction: 'ascending' }],
  });
  return pages.map(toTask);
}

export async function updateTaskStatus(pageId: string, status: string): Promise<void> {
  await updatePage(pageId, { 'ステータス': buildSelect(status) });
}

/** タスク候補を「スキップ」ステータスで記録（次回以降の抽出から除外するため） */
export async function recordSkippedTask(params: {
  title: string;
  sourceMessage?: string;
}): Promise<void> {
  const properties: Record<string, any> = {
    'タスク名': buildTitle(params.title),
    'ステータス': buildSelect('Skipped'),
    'ソース': buildSelect('slack'),
  };
  if (params.sourceMessage) {
    properties['元メッセージ'] = buildRichText(params.sourceMessage.slice(0, 1800));
  }
  await createPage({ database_id: getDbId() }, properties);
}

/** 既存タスクのタイトル一覧を取得（抽出時の重複除外用） */
export async function listAllTaskTitles(): Promise<string[]> {
  const pages = await queryDatabase(getDbId(), {});
  return pages.map(toTask).map((t) => t.title).filter(Boolean);
}
