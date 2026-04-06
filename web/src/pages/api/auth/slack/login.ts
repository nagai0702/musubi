import type { APIRoute } from 'astro';
import { getAuthUrl } from '@/lib/slack';

export const GET: APIRoute = ({ redirect }) => {
  const state = crypto.randomUUID();
  return redirect(getAuthUrl(state));
};
