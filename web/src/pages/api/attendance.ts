import type { APIRoute } from 'astro';
import { getAttendance, addAttendance } from '@/lib/sheets';
import { getSession } from '@/lib/session';

export const GET: APIRoute = async ({ url }) => {
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(await getAttendance(date)), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = getSession(cookies);
  if (!user) return new Response('unauthorized', { status: 401 });
  const { type } = await request.json();
  if (type !== 'in' && type !== 'out') return new Response('invalid type', { status: 400 });
  await addAttendance(user.id, user.name, type, 'web');
  return new Response('ok');
};
