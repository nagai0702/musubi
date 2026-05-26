import { readRangeCached, SOURCES, parseYen, parseNum, parsePct } from './sheets';

export type FunnelDay = {
  date: string;
  ad_cost_actual: number;
  line_register_actual: number;
  reservation_actual: number;
  seat_actual: number;
  order_actual: number;
  ad_cost_plan: number;
  line_register_plan: number;
  reservation_plan: number;
  seat_plan: number;
  order_plan: number;
};

export type FunnelData = {
  month: string;
  days: FunnelDay[];
  totals: {
    ad_cost_actual: number;
    line_register_actual: number;
    reservation_actual: number;
    seat_actual: number;
    order_actual: number;
    ad_cost_plan: number;
    line_register_plan: number;
    reservation_plan: number;
    seat_plan: number;
    order_plan: number;
  };
  rates: {
    line_to_reservation: number | null;
    reservation_to_seat: number | null;
    seat_to_order: number | null;
    line_to_order: number | null;
  };
  fetchedAt: string;
};

export async function getFunnel(): Promise<FunnelData> {
  const rows = await readRangeCached(SOURCES.ML_TX, '進捗管理!A1:AE60');
  const month = (rows[0]?.[0] || '').trim();
  const days: FunnelDay[] = [];
  let lastCumulative = {
    ad_cost: 0, line_register: 0, reservation: 0, seat: 0, order: 0,
    plan_ad_cost: 0, plan_line_register: 0, plan_reservation: 0, plan_seat: 0, plan_order: 0,
  };
  for (let r = 3; r < rows.length; r++) {
    const row = rows[r] || [];
    const date = (row[0] || '').trim();
    if (!date || !/^\d{4}\/\d{2}\/\d{2}$/.test(date)) continue;
    const hasActual = parseNum(row[2]) > 0 || parseYen(row[1]) > 0;
    if (hasActual) {
      lastCumulative = {
        ad_cost: parseYen(row[1]),
        line_register: parseNum(row[2]),
        reservation: parseNum(row[3]),
        seat: parseNum(row[4]),
        order: parseNum(row[5]),
        plan_ad_cost: parseYen(row[6]),
        plan_line_register: parseNum(row[7]),
        plan_reservation: parseNum(row[8]),
        plan_seat: parseNum(row[9]),
        plan_order: parseNum(row[10]),
      };
    }
    days.push({
      date,
      ad_cost_actual: parseYen(row[16]),
      line_register_actual: parseNum(row[17]),
      reservation_actual: parseNum(row[18]),
      seat_actual: parseNum(row[19]),
      order_actual: parseNum(row[20]),
      ad_cost_plan: parseYen(row[21]),
      line_register_plan: parseNum(row[22]),
      reservation_plan: parseNum(row[23]),
      seat_plan: parseNum(row[24]),
      order_plan: parseNum(row[25]),
    });
  }

  const totals = {
    ad_cost_actual: lastCumulative.ad_cost,
    line_register_actual: lastCumulative.line_register,
    reservation_actual: lastCumulative.reservation,
    seat_actual: lastCumulative.seat,
    order_actual: lastCumulative.order,
    ad_cost_plan: lastCumulative.plan_ad_cost,
    line_register_plan: lastCumulative.plan_line_register,
    reservation_plan: lastCumulative.plan_reservation,
    seat_plan: lastCumulative.plan_seat,
    order_plan: lastCumulative.plan_order,
  };

  const safeRate = (n: number, d: number) => (d > 0 ? n / d : null);
  const rates = {
    line_to_reservation: safeRate(totals.reservation_actual, totals.line_register_actual),
    reservation_to_seat: safeRate(totals.seat_actual, totals.reservation_actual),
    seat_to_order: safeRate(totals.order_actual, totals.seat_actual),
    line_to_order: safeRate(totals.order_actual, totals.line_register_actual),
  };

  return { month, days, totals, rates, fetchedAt: new Date().toISOString() };
}

export type IncomeBracket = {
  label: string;
  reservation: number;
  seat: number;
  order: number;
};

export type IncomeAnalysis = {
  recentMonths: { month: string; brackets: IncomeBracket[] }[];
  totalRecent: IncomeBracket[];
  fetchedAt: string;
};

const INCOME_LABELS = [
  '100万円未満', '101~200万円', '201~300万円', '301~400万円', '401~500万円',
  '501~600万円', '601~700万円', '701~800万円', '801万円以上'
];

export async function getIncomeAnalysis(): Promise<IncomeAnalysis> {
  const rows = await readRangeCached(SOURCES.KOBETSU, '重要指標（工事中）!A1:AB30');
  const parseBlock = (row: string[]): IncomeBracket[] => {
    const out: IncomeBracket[] = [];
    for (let i = 0; i < 9; i++) {
      out.push({
        label: INCOME_LABELS[i],
        reservation: parsePct(row[1 + i]) ?? 0,
        seat: parsePct(row[10 + i]) ?? 0,
        order: parsePct(row[19 + i]) ?? 0,
      });
    }
    return out;
  };
  const totalRecent = parseBlock(rows[4] || []);
  const recentMonths: IncomeAnalysis['recentMonths'] = [];
  for (let r = 5; r < 11; r++) {
    const row = rows[r] || [];
    if (!row[0]) continue;
    recentMonths.push({ month: row[0], brackets: parseBlock(row) });
  }
  return { recentMonths, totalRecent, fetchedAt: new Date().toISOString() };
}
