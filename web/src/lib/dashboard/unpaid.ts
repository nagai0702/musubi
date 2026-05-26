import { readRangeCached, SOURCES, parseYen, parseNum, parsePct } from './sheets';

export type UnpaidEntry = {
  date: string;
  customerId: string;
  customerName: string;
  category: string;
  subject: string;
  amount: number;
  payMethod: string;
  installments: string;
  status: string;
  note: string;
};

export type UnpaidMonth = {
  month: string;
  count: number;
  amount: number;
  recoveredCount: number;
  recoveredAmount: number;
  promptedCount: number;
  promptedAmount: number;
  pendingCount: number;
  pendingAmount: number;
  recoveryRateCount: number | null;
  recoveryRateAmount: number | null;
};

export type UnpaidData = {
  list: UnpaidEntry[];
  monthly: UnpaidMonth[];
  totalAmount: number;
  totalCount: number;
  fetchedAt: string;
};

export async function getUnpaid(): Promise<UnpaidData> {
  const [listRows, monthlyRows] = await Promise.all([
    readRangeCached(SOURCES.EA_NYUKIN, '❹未入金一覧!A1:L500'),
    readRangeCached(SOURCES.EA_NYUKIN, '未入金集計!A1:M30'),
  ]);

  const list: UnpaidEntry[] = [];
  for (let r = 1; r < listRows.length; r++) {
    const row = listRows[r] || [];
    const date = (row[0] || '').trim();
    if (!date) continue;
    list.push({
      date,
      customerId: (row[1] || '').trim(),
      customerName: (row[2] || '').trim(),
      category: (row[3] || '').trim(),
      subject: (row[4] || '').trim(),
      amount: parseYen(row[5]),
      payMethod: (row[6] || '').trim(),
      installments: (row[7] || '').trim(),
      status: (row[8] || '').trim(),
      note: (row[11] || '').trim(),
    });
  }

  const monthly: UnpaidMonth[] = [];
  for (let r = 1; r < monthlyRows.length; r++) {
    const row = monthlyRows[r] || [];
    const month = (row[0] || '').trim();
    if (!month || !/^\d{4}\/\d{1,2}/.test(month)) continue;
    monthly.push({
      month,
      count: parseNum(row[1]),
      amount: parseYen(row[2]),
      recoveredCount: parseNum(row[3]),
      recoveredAmount: parseYen(row[4]),
      promptedCount: parseNum(row[5]),
      promptedAmount: parseYen(row[6]),
      pendingCount: parseNum(row[9]),
      pendingAmount: parseYen(row[10]),
      recoveryRateCount: parsePct(row[11]),
      recoveryRateAmount: parsePct(row[12]),
    });
  }

  const totalAmount = list.reduce((a, b) => a + b.amount, 0);
  return { list, monthly, totalAmount, totalCount: list.length, fetchedAt: new Date().toISOString() };
}
