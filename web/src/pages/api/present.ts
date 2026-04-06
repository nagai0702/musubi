import type { APIRoute } from 'astro';
import { getLatestPerUser } from '@/lib/sheets';
import { getSlackUser } from '@/lib/slack';

export const GET: APIRoute = async () => {
  const latest = await getLatestPerUser();
  const present = Object.values(latest)
    .filter(r => r.type === 'in')
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const enriched = await Promise.all(present.map(async r => {
    const slack = await getSlackUser(r.userId);
    return { ...r, image: slack.image, userName: slack.name || r.userName };
  }));
  return new Response(JSON.stringify(enriched), {
    headers: { 'Content-Type': 'application/json' }
  });
};
