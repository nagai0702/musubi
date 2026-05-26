import { readRangeCached, SOURCES, parseYen, parseNum, parsePct } from './sheets';

export type MediaMonth = {
  month: string;
  ad_cost: number;
  ad_cost_with_fee: number;
  imp: number;
  cpm: number;
  clicks: number;
  ctr: number | null;
  cpc: number;
  line_register: number;
  reg_cpa: number;
  reservation_total: number;
  reservation_rate: number | null;
  reservation_cpa: number;
  in_scope_rate: number | null;
  in_scope_reservation: number;
};

export type MediaData = {
  total: MediaMonth | null;
  months: MediaMonth[];
  fetchedAt: string;
};

function rowToMonth(row: string[]): MediaMonth {
  return {
    month: (row[0] || '').replace(/\s+の合計$/, '').trim(),
    ad_cost: parseYen(row[7]),
    ad_cost_with_fee: parseYen(row[8]),
    imp: parseNum(row[9]),
    cpm: parseYen(row[10]),
    clicks: parseNum(row[11]),
    ctr: parsePct(row[12]),
    cpc: parseYen(row[13]),
    line_register: parseNum(row[18]),
    reg_cpa: parseYen(row[19]),
    reservation_total: parseNum(row[20]),
    reservation_rate: parsePct(row[21]),
    reservation_cpa: parseYen(row[22]),
    in_scope_rate: parsePct(row[23]),
    in_scope_reservation: parseNum(row[24]),
  };
}

export async function getMediaSummary(): Promise<MediaData> {
  const rows = await readRangeCached(SOURCES.ML_TX, '表示用＿広告サマリ!A1:AE40');
  const months: MediaMonth[] = [];
  let total: MediaMonth | null = null;
  for (let r = 5; r < rows.length; r++) {
    const row = rows[r] || [];
    const label = (row[0] || '').trim();
    if (!label) continue;
    if (label === '総計') {
      total = rowToMonth(row);
      continue;
    }
    if (/合計$/.test(label) || /^\d{4}-\d{1,2}月/.test(label)) {
      months.push(rowToMonth(row));
    }
  }
  return { total, months, fetchedAt: new Date().toISOString() };
}
