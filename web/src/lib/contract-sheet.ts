/**
 * 契約書スプレッドシートへの書き込み・PDFエクスポート
 * テンプレートシートID: 1ZCDNnB0Y1USDQaylAIa2UiQjdtevHeN-HlUXRDGRc0I
 *
 * テンプレートに直接書き込み→PDF出力する方式
 * （Drive APIスコープ不要）
 */
import { google } from 'googleapis';
import { getOAuthClient } from './sheets';

const TEMPLATE_SHEET_ID = import.meta.env.CONTRACT_TEMPLATE_SHEET_ID || '1ZCDNnB0Y1USDQaylAIa2UiQjdtevHeN-HlUXRDGRc0I';

function client() {
  return google.sheets({ version: 'v4', auth: getOAuthClient() });
}

/** 顧客情報を入力用シートに書き込み（黄色セル） */
export async function writeCustomerData(sheetId: string, data: {
  name: string;
  email: string;
  phone: string;
  address: string;
  birthday: string; // YYYYMMDD
}) {
  const c = client();
  await c.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: '入力用シート!C4', values: [[data.name]] },
        { range: '入力用シート!C5', values: [[data.email]] },
        { range: '入力用シート!C6', values: [[data.phone]] },
        { range: '入力用シート!C7', values: [[data.address]] },
        { range: '入力用シート!C8', values: [[data.birthday]] },
      ],
    },
  });
}

/** 営業マン入力情報を入力用シートに書き込み（白セル） */
export async function writeSalesData(sheetId: string, data: {
  contractStartDate: string;  // YYYY/MM/DD
  activityStartDate: string;  // YYYY/MM/DD
  salesRep: string;
  plan: string;
  initialPaymentMethod: string;
  upfrontPayment: string;     // ¥0 or amount
  paymentInstallments: string;
  monthlyPaymentMethod: string;
  contractPeriod: string;     // e.g. "12か月"
}) {
  const c = client();
  await c.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: '入力用シート!C9', values: [[data.contractStartDate]] },
        { range: '入力用シート!C10', values: [[data.activityStartDate]] },
        { range: '入力用シート!C15', values: [[data.salesRep]] },
        { range: '入力用シート!C17', values: [[data.plan]] },
        { range: '入力用シート!C18', values: [[data.initialPaymentMethod]] },
        { range: '入力用シート!C19', values: [[data.upfrontPayment]] },
        { range: '入力用シート!C20', values: [[data.paymentInstallments]] },
        { range: '入力用シート!C21', values: [[data.monthlyPaymentMethod]] },
        { range: '入力用シート!C23', values: [[data.contractPeriod]] },
      ],
    },
  });
}

/** 契約書シートをPDFとしてエクスポート（各シートごとにPDFを生成し結合は省略、最初のシートを返す） */
export async function exportContractPdf(sheetId: string): Promise<string> {
  const auth = getOAuthClient();
  const token = await auth.getAccessToken();

  // 契約書関連の3シートのgidを取得
  const c = client();
  const meta = await c.spreadsheets.get({ spreadsheetId: sheetId });
  const targetSheets = [
    '恋愛婚活相談サービス利用申込契約書',
    '恋愛婚活相談サービス概要書面',
    'サービス利用料金',
  ];

  const gids = meta.data.sheets
    ?.filter(s => targetSheets.includes(s.properties?.title || ''))
    .map(s => s.properties?.sheetId) || [];

  if (gids.length === 0) throw new Error('契約書シートが見つかりません');

  // 各シートを個別にPDFエクスポートして連結
  const pdfParts: Buffer[] = [];
  for (const gid of gids) {
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=pdf&size=A4&portrait=true&fitw=true&gid=${gid}`;
    const res = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${token.token}` },
    });
    if (!res.ok) throw new Error(`PDF export failed for gid=${gid}: ${res.status}`);
    pdfParts.push(Buffer.from(await res.arrayBuffer()));
  }

  // 最初のシートのPDFを返す（複数シート結合は後日対応）
  // TODO: pdf-libで結合
  return pdfParts[0].toString('base64');
}

/** 指定シート名のPDFをBufferで返す */
export async function exportSingleSheetPdf(spreadsheetId: string, sheetName: string): Promise<Buffer> {
  const auth = getOAuthClient();
  const token = await auth.getAccessToken();

  const c = client();
  const meta = await c.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find(s => s.properties?.title === sheetName);
  if (!sheet) throw new Error(`シート "${sheetName}" が見つかりません`);

  const gid = sheet.properties?.sheetId;
  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=pdf&size=A4&portrait=true&fitw=true&gridlines=false&gid=${gid}`;
  const res = await fetch(exportUrl, {
    headers: { Authorization: `Bearer ${token.token}` },
  });
  if (!res.ok) throw new Error(`PDF export failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** スプレッドシートのURLを取得 */
export function getSheetUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
}
