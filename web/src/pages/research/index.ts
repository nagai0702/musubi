import type { APIRoute } from 'astro';

export const prerender = false;

// /research/ → 一覧ページ（今は1つだけ）へリダイレクト
export const GET: APIRoute = async ({ redirect }) => {
  return redirect('/research/love-marriage-2026-04-20/', 302);
};
