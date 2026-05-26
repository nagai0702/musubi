import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/session';
import { createContract } from '../../../lib/contracts';

export const POST: APIRoute = async ({ cookies, request }) => {
  const user = getSession(cookies);
  if (!user) return new Response(JSON.stringify({ error: '認証が必要です' }), { status: 401 });

  const contract = await createContract(user.id, user.name);
  return new Response(JSON.stringify({ token: contract.token }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
