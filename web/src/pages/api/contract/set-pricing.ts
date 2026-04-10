import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/session';
import { getByToken, updateContract } from '../../../lib/contracts';
import type { PaymentMethod } from '../../../lib/contracts';
import { writeCustomerData, writeSalesData } from '../../../lib/contract-sheet';

export const POST: APIRoute = async ({ cookies, request }) => {
  const user = getSession(cookies);
  if (!user) return new Response(JSON.stringify({ error: '認証が必要です' }), { status: 401 });

  const body = await request.json();
  const {
    token, paymentMethod,
    contractStartDate, activityStartDate, plan,
    initialPaymentMethod, upfrontPayment, paymentInstallments,
    monthlyPaymentMethod, contractPeriod,
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
      address: `${c.postalCode} ${c.address}`,
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
      contractPeriod: contractPeriod || '12か月',
    });

    // 3. Contractsシートを更新（テンプレートシートIDを保存）
    await updateContract(token, {
      status: 'priced',
      price: upfrontPayment || '',
      paymentMethod: paymentMethod as PaymentMethod,
      pdfUrl: templateSheetId,
    });

    return new Response(JSON.stringify({ ok: true, sheetId: templateSheetId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'スプレッドシート処理エラー: ' + e.message }), { status: 500 });
  }
};
