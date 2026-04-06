import type { APIRoute } from 'astro';
import { getOAuthClient } from '@/lib/sheets';

export const GET: APIRoute = ({ redirect }) => {
  const oauth = getOAuthClient();
  const url = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return redirect(url);
};
