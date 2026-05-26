import { readRangeCached, SOURCES, parseNum, parsePct } from './sheets';

export type StatusCount = {
  date: string;
  status: string;
  count: number;
  planner: string;
  team: string;
};

export type MemberStatusSnapshot = {
  date: string;
  byStatus: Record<string, number>;
  byPlanner: Record<string, number>;
  fetchedAt: string;
};

export async function getMemberStatusSnapshot(): Promise<MemberStatusSnapshot> {
  const rows = await readRangeCached(SOURCES.KAIN_BUNSEKI, '会員ステータス日次集計!A2:H30000', 60_000);
  const all: StatusCount[] = rows
    .filter(r => r[0])
    .map(r => ({
      date: (r[0] || '').trim(),
      status: (r[2] || '').trim(),
      count: parseNum(r[3]),
      planner: (r[4] || '').trim(),
      team: (r[5] || '').trim(),
    }));
  if (all.length === 0) {
    return { date: '', byStatus: {}, byPlanner: {}, fetchedAt: new Date().toISOString() };
  }
  const latestDate = all.map(r => r.date).sort().pop() || '';
  const today = all.filter(r => r.date === latestDate);
  const byStatus: Record<string, number> = {};
  const byPlanner: Record<string, number> = {};
  for (const r of today) {
    if (r.team === '全体' && r.planner === '全体') {
      byStatus[r.status] = (byStatus[r.status] || 0) + r.count;
    }
    const isActiveStatus = r.status === 'プレ交際' || r.status === '真剣交際' || r.status === '今月お見合い未成立' || r.status === '今月お見合い成立';
    if (isActiveStatus && r.team !== '全体' && r.planner !== '全体' && r.planner) {
      byPlanner[r.planner] = (byPlanner[r.planner] || 0) + r.count;
    }
  }
  return { date: latestDate, byStatus, byPlanner, fetchedAt: new Date().toISOString() };
}

export type MarriageRateMonth = {
  month: string;
  active: number;
  pause: number;
  midWithdraw: number;
  marriage: number;
  pauseRate: number | null;
  midWithdrawRate: number | null;
  basicMarriageRate: number | null;
  seriousToMarriageRate: number | null;
  activeToMarriageRate: number | null;
};

export async function getMarriageRate(): Promise<MarriageRateMonth[]> {
  const rows = await readRangeCached(SOURCES.KAIN_BUNSEKI, '成婚率集計（手動）!A1:K20');
  const out: MarriageRateMonth[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const month = (row[0] || '').trim();
    if (!month || month.includes('入会') || month.includes('プランナー') || month.includes('成婚月') || /^\d{4}\//.test(month) || month === 'ALL') continue;
    if (!/月/.test(month)) continue;
    out.push({
      month: month.replace(/\n.*/, ''),
      active: parseNum(row[1]),
      pause: parseNum(row[2]),
      midWithdraw: parseNum(row[3]),
      marriage: parseNum(row[4]),
      pauseRate: parsePct(row[5]),
      midWithdrawRate: parsePct(row[6]),
      basicMarriageRate: parsePct(row[7]),
      seriousToMarriageRate: parsePct(row[8]),
      activeToMarriageRate: parsePct(row[9]),
    });
  }
  return out;
}
