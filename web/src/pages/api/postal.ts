import type { APIRoute } from 'astro';

/** 郵便番号→住所検索プロキシ（CORS回避） */
export const GET: APIRoute = async ({ url }) => {
  const zip = url.searchParams.get('zip')?.replace(/[-ー－\s]/g, '') || '';
  if (!/^\d{7}$/.test(zip)) {
    return new Response(JSON.stringify({ error: '7桁の郵便番号を指定してください' }), { status: 400 });
  }
  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zip}`);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const r = data.results[0];
      return new Response(JSON.stringify({ address: r.address1 + r.address2 + r.address3 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: '住所が見つかりませんでした' }), { status: 404 });
  } catch {
    return new Response(JSON.stringify({ error: '検索に失敗しました' }), { status: 500 });
  }
};
