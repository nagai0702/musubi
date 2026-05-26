import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/session';
import { getByToken, updateContract } from '../../../lib/contracts';
import type { PaymentMethod } from '../../../lib/contracts';
import { writeCustomerData, writeSalesData, exportSingleSheetPdf } from '../../../lib/contract-sheet';
import { setPdfCache, cacheKey } from '../../../lib/pdf-cache';

export const POST: APIRoute = async ({ cookies, request }) => {
  const user = getSession(cookies);
  if (!user) return new Response(JSON.stringify({ error: '認証が必要です' }), { status: 401 });

  const body = await request.json();
  const {
    token, paymentMethod,
    contractStartDate, activityStartDate, plan,
    initialPaymentMethod, upfrontPayment, paymentInstallments,
    monthlyPaymentMethod, monthlyPaymentDay, monthlyPaymentType, contractPeriod,
    initialCost, marriageFee,
  } = body;

  if (!token || !paymentMethod || !plan) {
    return new Response(JSON.stringify({ error: '必須項目が不足しています' }), { status: 400 });
  }

  const found = await getByToken(token);
  if (!found) return new Response(JSON.stringify({ error: '契約が見つかりません' }), { status: 404 });
  if (found.contract.status !== 'customer_filled') {
    return new Response(JSON.stringify({ error: '顧客情報の入力が完了していません' }), { status: 400 });
  }

  const c = found.contract;

  // テンプレートスプシIDを取得（環境変数 or デフォルト）
  const templateSheetId = import.meta.env.CONTRACT_TEMPLATE_SHEET_ID || '1ZCDNnB0Y1USDQaylAIa2UiQjdtevHeN-HlUXRDGRc0I';

  try {
    // 1. テンプレートに顧客データを書き込み
    const birthday = c.birthday.replace(/-/g, ''); // YYYY-MM-DD → YYYYMMDD
    await writeCustomerData(templateSheetId, {
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      birthday,
    });

    // 2. テンプレートに営業データを書き込み
    await writeSalesData(templateSheetId, {
      contractStartDate: contractStartDate || new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
      activityStartDate: activityStartDate || '',
      salesRep: user.name,
      plan,
      initialPaymentMethod: initialPaymentMethod || (paymentMethod === 'credit' ? 'クレジットカード' : '振込'),
      upfrontPayment: upfrontPayment || '¥0',
      paymentInstallments: paymentInstallments || '',
      monthlyPaymentMethod: monthlyPaymentMethod || 'クレジットカード',
      monthlyPaymentDay: monthlyPaymentDay || '毎月28日',
      monthlyPaymentType: monthlyPaymentType || '分割払い（割賦販売契約）',
      contractPeriod: contractPeriod || '12か月',
      initialCost: initialCost || '',
      marriageFee: marriageFee || '¥220,000',
    });

    // 3. Contractsシートを更新（テンプレートシートIDを保存）
    await updateContract(token, {
      status: 'priced',
      price: upfrontPayment || '',
      paymentMethod: paymentMethod as PaymentMethod,
      pdfUrl: templateSheetId,
    });

    // 4. PDF事前生成・キャッシュ（バックグラウンド、レスポンスをブロックしない）
    (async () => {
      try {
        const sheetNames = [
          '恋愛婚活相談サービス利用申込契約書',
          '恋愛婚活相談サービス概要書面',
          'サービス利用料金',
        ];
        for (let i = 0; i < sheetNames.length; i++) {
          const buf = await exportSingleSheetPdf(templateSheetId, sheetNames[i]);
          setPdfCache(cacheKey(token, i), buf);
        }
        console.log('[contract] PDF cache generated for', token);
      } catch (e) {
        console.error('[contract] PDF cache error:', e);
      }
    })();

    return new Response(JSON.stringify({ ok: true, sheetId: templateSheetId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'スプレッドシート処理エラー: ' + e.message }), { status: 500 });
  }
};
