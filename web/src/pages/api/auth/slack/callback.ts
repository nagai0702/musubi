import type { APIRoute } from 'astro';
import { exchangeCode } from '@/lib/slack';
import { setSession } from '@/lib/session';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const code = url.searchParams.get('code');
  if (!code) return new Response('missing code', { status: 400 });
  try {
    const user = await exchangeCode(code);
    setSession(cookies, user);
    return redirect('/');
  } catch (e: any) {
    return new Response('login failed: ' + e.message, { status: 500 });
  }
};
