import type { APIRoute } from 'astro';
import { getByToken } from '../../../lib/contracts';
import { exportSingleSheetPdf } from '../../../lib/contract-sheet';

/**
 * GET /api/contract/pdf?token=xxx&sheet=0|1|2
 * sheet: 0=契約書, 1=概要書面, 2=サービス利用料金
 */
export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token');
  const sheetIdx = parseInt(url.searchParams.get('sheet') || '0', 10);
  if (!token) return new Response(JSON.stringify({ error: 'トークンが必要です' }), { status: 400 });

  const found = await getByToken(token);
  if (!found) return new Response(JSON.stringify({ error: '契約が見つかりません' }), { status: 404 });

  const spreadsheetId = found.contract.pdfUrl;
  if (!spreadsheetId) return new Response(JSON.stringify({ error: '契約書が未生成です' }), { status: 400 });

  const sheetNames = [
    '恋愛婚活相談サービス利用申込契約書',
    '恋愛婚活相談サービス概要書面',
    'サービス利用料金',
  ];
  const fileLabels = ['利用申込契約書', '概要書面', 'サービス利用料金'];

  if (sheetIdx < 0 || sheetIdx >= sheetNames.length) {
    return new Response(JSON.stringify({ error: '無効なシート番号です' }), { status: 400 });
  }

  try {
    const pdfBuffer = await exportSingleSheetPdf(spreadsheetId, sheetNames[sheetIdx]);
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(found.contract.name + '_' + fileLabels[sheetIdx] + '.pdf')}`,
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'PDF生成エラー: ' + e.message }), { status: 500 });
  }
};
