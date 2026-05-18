import type { APIRoute } from 'astro';

export const prerender = false;

function getApiKey(): string {
  return (
    (import.meta.env.XGD_API_KEY as string | undefined) ||
    (process.env.XGD_API_KEY as string | undefined) ||
    ''
  );
}

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const longUrl = String(body?.url || '').trim();
  if (!longUrl || !/^https?:\/\//i.test(longUrl)) {
    return new Response(JSON.stringify({ error: 'url is required (must start with http(s)://)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const key = getApiKey();
  if (!key) {
    return new Response(
      JSON.stringify({ error: 'XGD_API_KEY env var is not configured on the server.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const api = 'https://xgd.io/V1/shorten?url=' + encodeURIComponent(longUrl) + '&key=' + encodeURIComponent(key);
    const res = await fetch(api);
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    // x.gd の正常応答: { status: 200, shorturl: 'https://x.gd/xxxx' }
    if (data?.status === 200 && data?.shorturl) {
      return new Response(JSON.stringify({ shortUrl: data.shorturl }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(
      JSON.stringify({ error: data?.message || ('x.gd error: ' + (text || res.status)) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message || 'shorten failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
