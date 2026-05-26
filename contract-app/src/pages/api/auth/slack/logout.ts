import type { APIRoute } from 'astro';
import { clearSession } from '@/lib/session';

export const POST: APIRoute = ({ cookies, redirect }) => {
  clearSession(cookies);
  return redirect('/');
};
