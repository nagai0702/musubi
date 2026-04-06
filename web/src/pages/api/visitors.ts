import type { APIRoute } from 'astro';
import { getVisitors, addVisitor } from '@/lib/sheets';
import { getSession } from '@/lib/session';

export const GET: APIRoute = async ({ url }) => {
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(await getVisitors(date)), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = getSession(cookies);
  if (!user) return new Response('unauthorized', { status: 401 });
  const body = await request.json();
  const v = await addVisitor({
    date: body.date, time: body.time, name: body.name,
    company: body.company || '', purpose: body.purpose || '', host: user.name
  });
  return new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } });
};
