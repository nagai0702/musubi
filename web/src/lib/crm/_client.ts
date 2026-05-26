/** Notion REST helper shared across CRM modules. API v2022-06-28 / database_id ベース。 */

export const NOTION_API = 'https://api.notion.com/v1';
export const NOTION_VERSION = '2022-06-28';

export function notionHeaders(): Record<string, string> {
  const key = import.meta.env.NOTION_API_KEY;
  if (!key) throw new Error('NOTION_API_KEY is not set');
  return {
    Authorization: `Bearer ${key}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

export async function queryDatabase(dbId: string, body: any = {}): Promise<any[]> {
  const id = dbId.replace(/-/g, '');
  const results: any[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`${NOTION_API}/databases/${id}/query`, {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify(cursor ? { ...body, start_cursor: cursor } : body),
    });
    if (!res.ok) throw new Error(`Notion query failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as any;
    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

export async function createPage(parent: any, properties: any): Promise<any> {
  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: notionHeaders(),
    body: JSON.stringify({ parent, properties }),
  });
  if (!res.ok) throw new Error(`Notion create page failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as any;
}

export async function updatePage(pageId: string, properties: any): Promise<any> {
  const res = await fetch(`${NOTION_API}/pages/${pageId.replace(/-/g, '')}`, {
    method: 'PATCH',
    headers: notionHeaders(),
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`Notion update page failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as any;
}

export async function retrievePage(pageId: string): Promise<any> {
  const res = await fetch(`${NOTION_API}/pages/${pageId.replace(/-/g, '')}`, {
    headers: notionHeaders(),
  });
  if (!res.ok) throw new Error(`Notion retrieve page failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as any;
}

/* ---------- property extractors ---------- */

export function propTitle(p: any): string {
  return (p?.title || []).map((t: any) => t.plain_text || '').join('').trim();
}
export function propText(p: any): string {
  return (p?.rich_text || []).map((t: any) => t.plain_text || '').join('').trim();
}
export function propNumber(p: any): number | null {
  return typeof p?.number === 'number' ? p.number : null;
}
export function propSelect(p: any): string | null {
  return p?.select?.name || null;
}
export function propCheckbox(p: any): boolean {
  return !!p?.checkbox;
}
export function propDate(p: any): string | null {
  return p?.date?.start || null;
}
export function propPeople(p: any): Array<{ id: string; name?: string }> {
  return (p?.people || []).map((x: any) => ({ id: x.id, name: x.name }));
}
export function propRelation(p: any): string[] {
  return (p?.relation || []).map((r: any) => r.id);
}

/* ---------- property builders ---------- */

export function buildTitle(text: string) {
  return { title: [{ type: 'text', text: { content: text } }] };
}
export function buildRichText(text: string) {
  return { rich_text: text ? [{ type: 'text', text: { content: text } }] : [] };
}
export function buildSelect(name: string | null) {
  return name ? { select: { name } } : { select: null };
}
export function buildDate(iso: string | null) {
  return iso ? { date: { start: iso } } : { date: null };
}
export function buildCheckbox(v: boolean) {
  return { checkbox: v };
}
export function buildRelation(ids: string[]) {
  return { relation: ids.map((id) => ({ id })) };
}
