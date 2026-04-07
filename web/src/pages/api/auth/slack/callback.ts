import type { APIRoute } from 'astro';
import { exchangeCode } from '@/lib/slack';
import { setSession } from '@/lib/session';

export const GET: APIRoute = async ({ url, cookies }) => {
  const code = url.searchParams.get('code');
  if (!code) return new Response('missing code', { status: 400 });
  try {
    const user = await exchangeCode(code);
    setSession(cookies, user);
    // Safari ITP 対策: 302 ではなく 200 HTML で Cookie をセットし、クライアント側でリダイレクト
    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ログイン成功</title>
<style>body{font-family:-apple-system,"Hiragino Sans",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f7fb;color:#1a202c}.box{text-align:center;padding:32px;background:#fff;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,.08)}</style>
</head><body><div class="box"><h2>✅ ログイン成功</h2><p>ページに移動中...</p>
<script>setTimeout(function(){location.replace('/');},200);</script>
<noscript><a href="/">ここをタップして進む</a></noscript>
</div></body></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e: any) {
    return new Response('login failed: ' + e.message, { status: 500 });
  }
};
