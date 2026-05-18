import type { APIRoute } from 'astro';
import { addQrReferral } from '@/lib/sheets';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const name = String(body?.name || '').trim();
  const adNamae = String(body?.adNamae || '').trim();
  const longUrl = String(body?.longUrl || '').trim();
  const shortUrl = String(body?.shortUrl || '').trim();
  if (!name || !adNamae || !longUrl) {
    return new Response(JSON.stringify({ error: 'name, adNamae, longUrl are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    await addQrReferral({ name, adNamae, longUrl, shortUrl });
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'sheet append failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
