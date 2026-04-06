import crypto from 'node:crypto';
import type { AstroCookies } from 'astro';

const SECRET = process.env.SESSION_SECRET || 'dev-secret';
const COOKIE = 'yui_session';

export type SessionUser = { id: string; name: string; email: string; };

function sign(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

export function setSession(cookies: AstroCookies, user: SessionUser) {
  const payload = Buffer.from(JSON.stringify(user)).toString('base64url');
  const sig = sign(payload);
  cookies.set(COOKIE, `${payload}.${sig}`, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30
  });
}

export function getSession(cookies: AstroCookies): SessionUser | null {
  const raw = cookies.get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig || sign(payload) !== sig) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()); }
  catch { return null; }
}

export function clearSession(cookies: AstroCookies) {
  cookies.delete(COOKIE, { path: '/' });
}
