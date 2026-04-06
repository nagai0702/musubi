import type { APIRoute } from 'astro';
import { getBookings, createBooking, deleteBooking } from '@/lib/sheets';
import { getSession } from '@/lib/session';

export const GET: APIRoute = async ({ url }) => {
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(await getBookings(date)), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = getSession(cookies);
  if (!user) return new Response('unauthorized', { status: 401 });
  const body = await request.json();
  try {
    const b = await createBooking({
      date: body.date, room: body.room, start: body.start, end: body.end,
      title: body.title, userId: user.id, userName: user.name
    });
    return new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
};

export const DELETE: APIRoute = async ({ url, cookies }) => {
  const user = getSession(cookies);
  if (!user) return new Response('unauthorized', { status: 401 });
  const id = url.searchParams.get('id');
  if (!id) return new Response('missing id', { status: 400 });
  try {
    await deleteBooking(id, user.id);
    return new Response('ok');
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};
