import type { APIRoute } from 'astro';
import { getByToken, updateContract, generateCustomerId } from '../../../lib/contracts';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { token, email, name, nameKana, phone, birthday, postalCode, address, coolingOffAgreed, notesAgreed } = body;

  if (!token) return new Response(JSON.stringify({ error: 'トークンが必要です' }), { status: 400 });

  const found = await getByToken(token);
  if (!found) return new Response(JSON.stringify({ error: '契約が見つかりません' }), { status: 404 });
  if (found.contract.status !== 'draft') {
    return new Response(JSON.stringify({ error: '既に入力済みです' }), { status: 400 });
  }

  const customerId = await generateCustomerId();
  await updateContract(token, {
    status: 'customer_filled',
    email,
    name,
    nameKana,
    phone,
    birthday,
    postalCode,
    address,
    coolingOffAgreed: !!coolingOffAgreed,
    notesAgreed: !!notesAgreed,
    customerId,
  });

  return new Response(JSON.stringify({ ok: true, customerId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
