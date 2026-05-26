import type { APIRoute } from 'astro';

/**
 * 顧客の操作状況をインメモリで管理
 * POST: 顧客画面から操作状況を送信
 * GET: 営業画面から操作状況を取得
 */

type Activity = {
  page: string;       // form, sign, payment, complete
  detail: string;     // 具体的な操作内容
  updatedAt: number;  // timestamp
};

// インメモリストア（サーバー再起動でクリア）
const store = new Map<string, Activity>();

export const POST: APIRoute = async ({ request }) => {
  const { token, page, detail } = await request.json();
  if (!token || !page) {
    return new Response(JSON.stringify({ error: 'token and page required' }), { status: 400 });
  }
  store.set(token, { page, detail: detail || '', updatedAt: Date.now() });
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token');
  if (!token) return new Response(JSON.stringify({ error: 'token required' }), { status: 400 });

  const activity = store.get(token);
  if (!activity) {
    return new Response(JSON.stringify({ page: '', detail: '', online: false }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 15秒以内の更新があればオンライン
  const online = Date.now() - activity.updatedAt < 15000;
  return new Response(JSON.stringify({ ...activity, online }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
