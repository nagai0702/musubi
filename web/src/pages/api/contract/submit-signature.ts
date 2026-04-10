import type { APIRoute } from 'astro';
import { getByToken, updateContract } from '../../../lib/contracts';

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

  return new Response(JSON.stringify({ ok: true, paymentMethod: found.contract.paymentMethod }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
