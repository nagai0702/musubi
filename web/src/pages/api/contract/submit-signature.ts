import type { APIRoute } from 'astro';
import { getByToken, updateContract } from '../../../lib/contracts';
import { exportSingleSheetPdf } from '../../../lib/contract-sheet';
import { sendContractEmail } from '../../../lib/mail';
import { addStampToPdf } from '../../../lib/stamp-pdf';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { token, signatureData } = body;

  if (!token || !signatureData) {
    return new Response(JSON.stringify({ error: '署名データが必要です' }), { status: 400 });
  }

  const found = await getByToken(token);
  if (!found) return new Response(JSON.stringify({ error: '契約が見つかりません' }), { status: 404 });
  if (found.contract.status !== 'priced') {
    return new Response(JSON.stringify({ error: '単価設定が完了していません' }), { status: 400 });
  }

  const now = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  await updateContract(token, {
    status: 'signed',
    signedAt: now,
    signatureData,
  });

  // 契約書PDFをメール送付（バックグラウンド実行、失敗しても押印は完了扱い）
  const spreadsheetId = found.contract.pdfUrl;
  if (spreadsheetId && found.contract.email) {
    const sheetNames = [
      { name: '恋愛婚活相談サービス利用申込契約書', label: '利用申込契約書', stamp: true },
      { name: '恋愛婚活相談サービス概要書面', label: 'サービス概要書面', stamp: true },
      { name: 'サービス利用料金', label: 'サービス利用料金', stamp: false },
    ];
    // 非同期でメール送信（レスポンスをブロックしない）
    (async () => {
      try {
        const pdfBuffers = [];
        for (const s of sheetNames) {
          let buf = await exportSingleSheetPdf(spreadsheetId, s.name);
          // 契約書と概要書面に押印画像を重ねる
          if (signatureData && signatureData.startsWith('data:image/png') && s.stamp) {
            try {
              buf = await addStampToPdf(buf, signatureData);
            } catch (e) {
              console.error(`[contract] 押印重ね失敗(${s.label}):`, e);
            }
          }
          pdfBuffers.push({ filename: `${found.contract.name}_${s.label}.pdf`, data: buf });
        }
        await sendContractEmail(found.contract.email, found.contract.name, pdfBuffers);
        console.log(`[contract] メール送信完了: ${found.contract.email}`);
      } catch (e) {
        console.error(`[contract] メール送信エラー:`, e);
      }
    })();
  }

  return new Response(JSON.stringify({ ok: true, paymentMethod: found.contract.paymentMethod }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
