import { google } from 'googleapis';
import { getOAuthClient } from './sheets';

const SHEET_ID = import.meta.env.CONTRACT_SHEET_ID || import.meta.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Contracts';

function client() {
  return google.sheets({ version: 'v4', auth: getOAuthClient() });
}

/** Contractsシートが存在しなければヘッダー付きで自動作成 */
async function ensureSheet() {
  const c = client();
  const meta = await c.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets?.some(s => s.properties?.title === SHEET_NAME);
  if (exists) return;
  await c.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
    },
  });
  // ヘッダー行を追加
  await c.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1:T1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [['token', 'status', 'created_at', 'sales_user_id', 'sales_user_name',
        'email', 'name', 'name_kana', 'phone', 'birthday', 'postal_code', 'address',
        'cooling_off_agreed', 'notes_agreed', 'price', 'payment_method',
        'customer_id', 'signed_at', 'signature_data', 'pdf_url']],
    },
  });
}

async function read(range: string): Promise<string[][]> {
  const res = await client().spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  return (res.data.values as string[][]) || [];
}

async function append(range: string, row: (string | number | boolean)[]) {
  await client().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

async function updateRow(range: string, values: (string | number | boolean)[]) {
  await client().spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

/* ===== Types ===== */

export type ContractStatus = 'draft' | 'customer_filled' | 'priced' | 'signed' | 'payment_done';
export type PaymentMethod = 'transfer' | 'credit' | 'lifti';

export interface Contract {
  token: string;
  status: ContractStatus;
  createdAt: string;
  salesUserId: string;
  salesUserName: string;
  email: string;
  name: string;
  nameKana: string;
  phone: string;
  birthday: string;
  postalCode: string;
  address: string;
  coolingOffAgreed: boolean;
  notesAgreed: boolean;
  price: string;
  paymentMethod: PaymentMethod | '';
  customerId: string;
  signedAt: string;
  signatureData: string;
  pdfUrl: string;
}

function rowToContract(r: string[]): Contract {
  return {
    token: r[0] || '',
    status: (r[1] || 'draft') as ContractStatus,
    createdAt: r[2] || '',
    salesUserId: r[3] || '',
    salesUserName: r[4] || '',
    email: r[5] || '',
    name: r[6] || '',
    nameKana: r[7] || '',
    phone: r[8] || '',
    birthday: r[9] || '',
    postalCode: r[10] || '',
    address: r[11] || '',
    coolingOffAgreed: r[12] === 'TRUE',
    notesAgreed: r[13] === 'TRUE',
    price: r[14] || '',
    paymentMethod: (r[15] || '') as PaymentMethod | '',
    customerId: r[16] || '',
    signedAt: r[17] || '',
    signatureData: r[18] || '',
    pdfUrl: r[19] || '',
  };
}

function contractToRow(c: Contract): (string | boolean)[] {
  return [
    c.token,
    c.status,
    c.createdAt,
    c.salesUserId,
    c.salesUserName,
    c.email,
    c.name,
    c.nameKana,
    c.phone,
    c.birthday,
    c.postalCode,
    c.address,
    c.coolingOffAgreed ? 'TRUE' : 'FALSE',
    c.notesAgreed ? 'TRUE' : 'FALSE',
    c.price,
    c.paymentMethod,
    c.customerId,
    c.signedAt,
    c.signatureData,
    c.pdfUrl,
  ];
}

/* ===== CRUD ===== */

export async function getByToken(token: string): Promise<{ contract: Contract; rowIndex: number } | null> {
  let rows: string[][];
  try {
    rows = await read(`${SHEET_NAME}!A2:T`);
  } catch {
    // シートが存在しない場合
    return null;
  }
  const idx = rows.findIndex(r => r[0] === token);
  if (idx === -1) return null;
  return { contract: rowToContract(rows[idx]), rowIndex: idx + 2 };
}

export async function createContract(salesUserId: string, salesUserName: string): Promise<Contract> {
  await ensureSheet();
  const token = crypto.randomUUID();
  const now = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const c: Contract = {
    token,
    status: 'draft',
    createdAt: now,
    salesUserId,
    salesUserName,
    email: '',
    name: '',
    nameKana: '',
    phone: '',
    birthday: '',
    postalCode: '',
    address: '',
    coolingOffAgreed: false,
    notesAgreed: false,
    price: '',
    paymentMethod: '',
    customerId: '',
    signedAt: '',
    signatureData: '',
    pdfUrl: '',
  };
  await append(`${SHEET_NAME}!A:T`, contractToRow(c));
  return c;
}

export async function updateContract(token: string, patch: Partial<Contract>): Promise<Contract> {
  const found = await getByToken(token);
  if (!found) throw new Error('契約が見つかりません');
  const updated = { ...found.contract, ...patch };
  await updateRow(`${SHEET_NAME}!A${found.rowIndex}:T${found.rowIndex}`, contractToRow(updated));
  return updated;
}

/** 自動採番: C + 6桁ゼロ埋め */
export async function generateCustomerId(): Promise<string> {
  let rows: string[][] = [];
  try { rows = await read(`${SHEET_NAME}!Q2:Q`); } catch { /* シート未作成 */ }
  const ids = rows.map(r => parseInt(r[0]?.replace('C', '') || '0', 10)).filter(n => !isNaN(n));
  const next = ids.length > 0 ? Math.max(...ids) + 1 : 1;
  return `C${String(next).padStart(6, '0')}`;
}

/** 営業マンの全契約一覧 */
export async function listBySalesUser(salesUserId: string): Promise<Contract[]> {
  let rows: string[][] = [];
  try { rows = await read(`${SHEET_NAME}!A2:T`); } catch { /* シート未作成 */ }
  return rows.filter(r => r[3] === salesUserId).map(rowToContract);
}
