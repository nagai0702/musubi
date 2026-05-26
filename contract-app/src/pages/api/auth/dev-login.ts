import type { APIRoute } from 'astro';
import { setSession } from '../../../lib/session';

/** 開発環境専用: ダミーユーザーでログイン */
export const GET: APIRoute = async ({ cookies, redirect }) => {
  if (import.meta.env.PROD) {
    return new Response('Not available in production', { status: 403 });
  }
  setSession(cookies, {
    id: 'dev-user-001',
    name: '開発テスト営業',
    email: 'dev@musubi.test',
  });
  return redirect('/contract/new');
};
