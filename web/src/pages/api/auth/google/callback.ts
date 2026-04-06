import type { APIRoute } from 'astro';
import { getOAuthClient } from '@/lib/sheets';

export const GET: APIRoute = async ({ url }) => {
  const code = url.searchParams.get('code');
  if (!code) return new Response('missing code', { status: 400 });
  try {
    const oauth = getOAuthClient();
    const { tokens } = await oauth.getToken(code);
    const refresh = tokens.refresh_token;
    const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:30px">
      <h2>✅ Google認証成功</h2>
      <p>以下を <code>web/.env</code> の <code>GOOGLE_REFRESH_TOKEN</code> に貼り付けてサーバー再起動してください:</p>
      <pre style="background:#f4f4f4;padding:16px;border-radius:6px;word-break:break-all;white-space:pre-wrap">${refresh || '(取得失敗)'}</pre>
      </body></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e: any) {
    return new Response('failed: ' + e.message, { status: 500 });
  }
};
