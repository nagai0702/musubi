import type { APIRoute } from 'astro';
import { getByToken } from '../../../lib/contracts';

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token');
  if (!token) return new Response(JSON.stringify({ error: 'トークンが必要です' }), { status: 400 });

  const found = await getByToken(token);
  if (!found) return new Response(JSON.stringify({ error: '契約が見つかりません' }), { status: 404 });

  const { contract } = found;
  return new Response(JSON.stringify({
    status: contract.status,
    name: contract.name,
    nameKana: contract.nameKana,
    email: contract.email,
    phone: contract.phone,
    birthday: contract.birthday,
    postalCode: contract.postalCode,
    address: contract.address,
    price: contract.price,
    paymentMethod: contract.paymentMethod,
    customerId: contract.customerId,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
