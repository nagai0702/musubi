import type { APIRoute } from 'astro';
import { getNotices } from '@/lib/slack';

export const GET: APIRoute = async () => {
  const notices = await getNotices(10);
  return new Response(JSON.stringify(notices), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
};
