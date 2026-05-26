import { readRangeCached, SOURCES, parseYen, parsePct } from './sheets';

export type PLMonth = {
  month: string;
  target: number;
  actual: number;
  achievement: number | null;
};

export type PLItem = {
  name: string;
  level: 0 | 1 | 2;
  months: PLMonth[];
};

export type PLData = {
  months: string[];
  items: PLItem[];
  fetchedAt: string;
};

function levelOf(name: string): 0 | 1 | 2 {
  if (name.startsWith('　┣')) return 2;
  if (name.startsWith('　')) return 1;
  if (name.startsWith(' ')) return 1;
  return 0;
}

export async function getPL(): Promise<PLData> {
  const rows = await readRangeCached(SOURCES.GYOSEKI, '【3期】業績PL!A1:AN40');

  const monthHeaderRow = rows[1] || [];
  const months: string[] = [];
  for (let c = 2; c < monthHeaderRow.length; c += 3) {
    const m = (monthHeaderRow[c] || '').trim();
    if (m && !m.includes('合計')) months.push(m);
    else if (!m && months.length === 0) break;
  }

  const items: PLItem[] = [];
  for (let r = 3; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = (row[1] || '').trim();
    if (!name) continue;
    const monthsData: PLMonth[] = [];
    for (let i = 0; i < months.length; i++) {
      const base = 2 + i * 3;
      monthsData.push({
        month: months[i],
        target: parseYen(row[base]),
        actual: parseYen(row[base + 1]),
        achievement: parsePct(row[base + 2]),
      });
    }
    items.push({ name, level: levelOf(row[1] || ''), months: monthsData });
  }

  return { months, items, fetchedAt: new Date().toISOString() };
}

export function pickItem(data: PLData, name: string): PLItem | undefined {
  return data.items.find(it => it.name.replace(/\s/g, '') === name.replace(/\s/g, ''));
}

export function currentMonthIndex(months: string[], jstNow = new Date()): number {
  const jst = new Date(jstNow.getTime() + 9 * 3600 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const target = `${y}年${m}月`;
  const idx = months.findIndex(x => x === target);
  return idx === -1 ? months.length - 1 : idx;
}
