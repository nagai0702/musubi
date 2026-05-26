/** Notion API client — fetch-based, no SDK dependency */

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

function headers() {
  const key = import.meta.env.NOTION_API_KEY;
  if (!key) throw new Error('NOTION_API_KEY is not set');
  return {
    Authorization: `Bearer ${key}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

/* ---------- Types ---------- */

export type SearchResult = {
  id: string;
  title: string;
  url: string;
  snippet: string;
};

export type MeetingPageParams = {
  title: string;
  date: string;           // YYYY-MM-DD
  participants: string[];
  transcript: string;
  summary?: string;
  keyPoints?: string[];
  actionItems?: string[];
};

/* ---------- Search ---------- */

export async function searchNotion(query: string): Promise<SearchResult[]> {
  const res = await fetch(`${NOTION_API}/search`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      query,
      filter: { property: 'object', value: 'page' },
      page_size: 5,
    }),
  });
  if (!res.ok) throw new Error(`Notion search failed: ${res.status}`);
  const data = (await res.json()) as any;

  return (data.results || []).map((page: any) => {
    const titleProp = page.properties?.title?.title
      || page.properties?.Name?.title
      || page.properties?.['名前']?.title
      || [];
    const title = titleProp.map((t: any) => t.plain_text).join('') || 'Untitled';
    return { id: page.id, title, url: page.url || '', snippet: '' };
  });
}

/* ---------- Content cache ---------- */

const contentCache = new Map<string, { text: string; cachedAt: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10分

/* ---------- Get page content ---------- */

export async function getPageContent(pageId: string, maxDepth = 2): Promise<string> {
  const cached = contentCache.get(pageId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.text;
  }
  const text = await fetchBlocks(pageId, 0, maxDepth);
  contentCache.set(pageId, { text, cachedAt: Date.now() });
  return text;
}

async function fetchBlocks(blockId: string, depth: number, maxDepth: number): Promise<string> {
  const parts: string[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${NOTION_API}/blocks/${blockId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);

    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) break;
    const data = (await res.json()) as any;

    for (const block of data.results || []) {
      const text = extractText(block);
      if (text) parts.push(text);

      if (block.has_children && depth < maxDepth) {
        const children = await fetchBlocks(block.id, depth + 1, maxDepth);
        if (children) parts.push(children);
      }
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return parts.join('\n');
}

function extractText(block: any): string {
  const type = block.type;
  const richTexts: any[] =
    block[type]?.rich_text ||
    block[type]?.text ||
    [];
  const text = richTexts.map((rt: any) => rt.plain_text || '').join('');

  switch (type) {
    case 'heading_1': return `# ${text}`;
    case 'heading_2': return `## ${text}`;
    case 'heading_3': return `### ${text}`;
    case 'bulleted_list_item': return `• ${text}`;
    case 'numbered_list_item': return `- ${text}`;
    case 'to_do': return `${block.to_do?.checked ? '☑' : '☐'} ${text}`;
    case 'toggle': return `▸ ${text}`;
    case 'callout': return `💡 ${text}`;
    case 'quote': return `> ${text}`;
    case 'divider': return '---';
    case 'table_row': {
      const cells = (block.table_row?.cells || []).map(
        (cell: any[]) => cell.map((c: any) => c.plain_text || '').join('')
      );
      return `| ${cells.join(' | ')} |`;
    }
    default: return text;
  }
}

/* ---------- Create meeting page ---------- */

export async function createMeetingPage(params: MeetingPageParams): Promise<{ id: string; url: string }> {
  const dbId = import.meta.env.NOTION_MEETING_DB_ID;
  if (!dbId) throw new Error('NOTION_MEETING_DB_ID is not set');

  const children: any[] = [];

  // Summary section
  if (params.summary) {
    children.push(heading2('要約'));
    children.push(paragraph(params.summary));
  }

  // Key points
  if (params.keyPoints?.length) {
    children.push(heading2('キーポイント'));
    for (const point of params.keyPoints) {
      children.push(bulletItem(point));
    }
  }

  // Action items
  if (params.actionItems?.length) {
    children.push(heading2('アクションアイテム'));
    for (const item of params.actionItems) {
      children.push(todoItem(item));
    }
  }

  // Transcript in a toggle
  children.push(heading2('文字起こし'));
  const transcriptChunks = splitText(params.transcript, 1800);
  for (const chunk of transcriptChunks) {
    children.push(paragraph(chunk));
  }

  // Notion limits 100 children per request
  const firstBatch = children.slice(0, 100);

  const body: any = {
    parent: { database_id: dbId.replace(/-/g, '') },
    properties: {
      title: { title: [{ text: { content: params.title } }] },
    },
    children: firstBatch,
  };

  // Add date property if available
  if (params.date) {
    body.properties['日付'] = { date: { start: params.date } };
  }

  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion create page failed: ${res.status} ${err}`);
  }

  const page = (await res.json()) as any;

  // Append remaining children if > 100
  if (children.length > 100) {
    const remaining = children.slice(100);
    for (let i = 0; i < remaining.length; i += 100) {
      const batch = remaining.slice(i, i + 100);
      await fetch(`${NOTION_API}/blocks/${page.id}/children`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ children: batch }),
      });
    }
  }

  return { id: page.id, url: page.url || '' };
}

/* ---------- Block helpers ---------- */

function richText(content: string) {
  return [{ type: 'text', text: { content } }];
}

function paragraph(content: string) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText(content) } };
}

function heading2(content: string) {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: richText(content) } };
}

function bulletItem(content: string) {
  return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText(content) } };
}

function todoItem(content: string) {
  return { object: 'block', type: 'to_do', to_do: { rich_text: richText(content), checked: false } };
}

function splitText(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks.length ? chunks : [''];
}
