import type { APIRoute } from 'astro';
import { getOAuthClient } from '@/lib/sheets';

export const GET: APIRoute = ({ redirect }) => {
  const oauth = getOAuthClient();
  const url = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/gmail.send',
    ]
  });
  console.log('[google-login] redirect_uri in env:', import.meta.env.GOOGLE_REDIRECT_URI);
  console.log('[google-login] auth url:', url.substring(0, 200));
  return redirect(url);
};
