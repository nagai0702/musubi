import { google } from 'googleapis';

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

function client() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

async function read(range: string): Promise<string[][]> {
  const res = await client().spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  return (res.data.values as string[][]) || [];
}

async function append(range: string, row: (string | number)[]) {
  await client().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [row] }
  });
}

async function deleteRow(sheetName: string, rowIndex: number) {
  const meta = await client().spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheet = meta.data.sheets?.find(s => s.properties?.title === sheetName);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId == null) throw new Error('sheet not found: ' + sheetName);
  await client().spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 }
        }
      }]
    }
  });
}

/* ===== Attendance ===== */
export type AttendanceRow = { time: string; userId: string; userName: string; type: 'in' | 'out'; };

export async function getAttendance(date: string): Promise<AttendanceRow[]> {
  const rows = await read('Attendance!A2:E');
  return rows
    .filter(r => (r[0] || '').startsWith(date))
    .map(r => ({
      time: (r[0] || '').slice(11, 16),
      userId: r[1] || '',
      userName: r[2] || '',
      type: (r[3] as 'in' | 'out') || 'in'
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export async function addAttendance(userId: string, userName: string, type: 'in' | 'out', source = 'web') {
  const ts = new Date().toISOString();
  await append('Attendance!A:E', [ts, userId, userName, type, source]);
}

/* ===== Bookings ===== */
export type Booking = { id: string; date: string; room: string; start: string; end: string; title: string; userId: string; userName: string; };

export async function getBookings(date: string): Promise<Booking[]> {
  const rows = await read('Bookings!A2:I');
  return rows
    .filter(r => r[1] === date)
    .map(r => ({ id: r[0], date: r[1], room: r[2], start: r[3], end: r[4], title: r[5], userId: r[6], userName: r[7] }));
}

export async function createBooking(b: Omit<Booking, 'id'>): Promise<Booking> {
  const existing = (await getBookings(b.date)).filter(x => x.room === b.room);
  for (const x of existing) {
    if (b.start < x.end && b.end > x.start) {
      throw new Error(`時間が重複: ${x.title} (${x.userName})`);
    }
  }
  const id = crypto.randomUUID();
  await append('Bookings!A:I', [id, b.date, b.room, b.start, b.end, b.title, b.userId, b.userName, new Date().toISOString()]);
  return { id, ...b };
}

export async function deleteBooking(id: string, userId: string) {
  const rows = await read('Bookings!A2:I');
  const idx = rows.findIndex(r => r[0] === id);
  if (idx === -1) throw new Error('予約が見つかりません');
  if (rows[idx][6] !== userId) throw new Error('予約者本人のみ削除できます');
  await deleteRow('Bookings', idx + 1);
}

/* ===== Visitors ===== */
export type Visitor = { id: string; date: string; time: string; name: string; company: string; purpose: string; host: string; };

export async function getVisitors(date: string): Promise<Visitor[]> {
  const rows = await read('Visitors!A2:H');
  return rows
    .filter(r => r[1] === date)
    .map(r => ({ id: r[0], date: r[1], time: r[2], name: r[3], company: r[4] || '', purpose: r[5] || '', host: r[6] || '' }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export async function addVisitor(v: Omit<Visitor, 'id'>): Promise<Visitor> {
  const id = crypto.randomUUID();
  await append('Visitors!A:H', [id, v.date, v.time, v.name, v.company, v.purpose, v.host, new Date().toISOString()]);
  return { id, ...v };
}
