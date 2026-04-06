import { google } from 'googleapis';

const SHEET_ID = import.meta.env.GOOGLE_SHEET_ID;

export function getOAuthClient() {
  const oauth = new google.auth.OAuth2(
    import.meta.env.GOOGLE_CLIENT_ID,
    import.meta.env.GOOGLE_CLIENT_SECRET,
    import.meta.env.GOOGLE_REDIRECT_URI
  );
  if (import.meta.env.GOOGLE_REFRESH_TOKEN) {
    oauth.setCredentials({ refresh_token: import.meta.env.GOOGLE_REFRESH_TOKEN });
  }
  return oauth;
}

function client() {
  return google.sheets({ version: 'v4', auth: getOAuthClient() });
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

async function updateRow(range: string, values: (string | number)[]) {
  await client().spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [values] }
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

/** UTC ISO or JST string -> { date, time } in JST */
function toJST(raw: string): { date: string; time: string } {
  if (!raw) return { date: '', time: '' };
  // タイムゾーン情報なしの "YYYY-MM-DD HH:MM:SS" は JST として扱う
  const d = /[Z+]/.test(raw) ? new Date(raw) : new Date(raw.replace(' ', 'T') + '+09:00');
  if (isNaN(d.getTime())) return { date: '', time: '' };
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  const iso = jst.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

function nowJSTString(): string {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 19).replace('T', ' ');
}

export async function getAttendance(date: string): Promise<AttendanceRow[]> {
  const rows = await read('Attendance!A2:E');
  return rows
    .map(r => ({ ...toJST(r[0] || ''), userId: r[1] || '', userName: r[2] || '', type: (r[3] as 'in' | 'out') || 'in' }))
    .filter(r => r.date === date)
    .map(r => ({ time: r.time, userId: r.userId, userName: r.userName, type: r.type }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export async function addAttendance(userId: string, userName: string, type: 'in' | 'out', source = 'web') {
  await append('Attendance!A:E', [nowJSTString(), userId, userName, type, source]);
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

export async function updateBooking(id: string, userId: string, patch: Partial<Omit<Booking, 'id' | 'userId' | 'userName'>>): Promise<Booking> {
  const rows = await read('Bookings!A2:I');
  const idx = rows.findIndex(r => r[0] === id);
  if (idx === -1) throw new Error('予約が見つかりません');
  if (rows[idx][6] !== userId) throw new Error('予約者本人のみ編集できます');
  const cur = rows[idx];
  const next = {
    id: cur[0],
    date: patch.date ?? cur[1],
    room: patch.room ?? cur[2],
    start: patch.start ?? cur[3],
    end: patch.end ?? cur[4],
    title: patch.title ?? cur[5],
    userId: cur[6],
    userName: cur[7]
  };
  // 重複チェック (自分以外)
  const sameDayRoom = (await getBookings(next.date)).filter(x => x.room === next.room && x.id !== id);
  for (const x of sameDayRoom) {
    if (next.start < x.end && next.end > x.start) {
      throw new Error(`時間が重複: ${x.title} (${x.userName})`);
    }
  }
  await updateRow(`Bookings!A${idx + 2}:I${idx + 2}`,
    [next.id, next.date, next.room, next.start, next.end, next.title, next.userId, next.userName, cur[8] || new Date().toISOString()]);
  return next;
}

export async function deleteBooking(id: string, userId: string) {
  const rows = await read('Bookings!A2:I');
  const idx = rows.findIndex(r => r[0] === id);
  if (idx === -1) throw new Error('予約が見つかりません');
  if (rows[idx][6] !== userId) throw new Error('予約者本人のみ削除できます');
  await deleteRow('Bookings', idx + 1);
}

/* ===== Visitors ===== */
export type Visitor = { id: string; date: string; time: string; name: string; company: string; purpose: string; host: string; place: string; };

export async function getVisitors(date: string): Promise<Visitor[]> {
  const rows = await read('Visitors!A2:I');
  return rows
    .filter(r => r[1] === date)
    .map(r => ({ id: r[0], date: r[1], time: r[2], name: r[3], company: r[4] || '', purpose: r[5] || '', host: r[6] || '', place: r[8] || '' }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export async function addVisitor(v: Omit<Visitor, 'id'>): Promise<Visitor> {
  const id = crypto.randomUUID();
  await append('Visitors!A:I', [id, v.date, v.time, v.name, v.company, v.purpose, v.host, new Date().toISOString(), v.place]);
  return { id, ...v };
}
