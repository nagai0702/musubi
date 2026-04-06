import type { APIRoute } from 'astro';
import { getLatestPerUser } from '@/lib/sheets';

export const GET: APIRoute = async () => {
  const latest = await getLatestPerUser();
  const present = Object.values(latest)
    .filter(r => r.type === 'in')
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return new Response(JSON.stringify(present), {
    headers: { 'Content-Type': 'application/json' }
  });
};
