/** hisyo_bot 専用ヘルパー — 既存の musubi-attendance bot と環境変数を分離 */
import crypto from 'node:crypto';

export const HISYO_BOT_TOKEN = () => import.meta.env.HISYO_BOT_TOKEN || '';
export const HISYO_SIGNING_SECRET = () => import.meta.env.HISYO_SIGNING_SECRET || '';

/** Slack署名検証（hisyo_bot 用） */
export function verifyHisyoSignature(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  const secret = HISYO_SIGNING_SECRET();
  if (!secret || !timestamp || !signature) return false;
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const base = `v0:${timestamp}:${rawBody}`;
  const hash = 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
  try {
    const a = Buffer.from(hash);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** hisyo_bot 用 Slack API 呼び出しラッパー */
export async function hisyoSlackAPI(method: string, body?: any): Promise<any> {
  const token = HISYO_BOT_TOKEN();
  const opts: RequestInit = { headers: { Authorization: 'Bearer ' + token } };
  if (body) {
    opts.method = 'POST';
    opts.headers = { ...opts.headers, 'Content-Type': 'application/json; charset=utf-8' } as any;
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`https://slack.com/api/${method}`, opts);
  return res.json();
}
