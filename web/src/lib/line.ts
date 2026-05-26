/** LINE Messaging API wrapper — Webhook署名検証・push/reply・プロフィール取得 */
import crypto from 'node:crypto';

const LINE_API = 'https://api.line.me/v2/bot';

/** Webhook署名検証 — 生のリクエストボディ文字列を渡すこと（JSON.parse後はNG） */
export function verifySignature(rawBody: string, signature: string | null | undefined): boolean {
  const secret = import.meta.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    const a = Buffer.from(hash);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** LINE userId 宛てにテキストを push */
export async function pushMessage(userId: string, text: string): Promise<void> {
  const token = import.meta.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');
  const res = await fetch(`${LINE_API}/message/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: userId, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    throw new Error(`LINE push failed: ${res.status} ${await res.text()}`);
  }
}

/** replyToken で返信（webhookイベント到着から1分以内） */
export async function replyMessage(replyToken: string, text: string): Promise<void> {
  const token = import.meta.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');
  await fetch(`${LINE_API}/message/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
}

export type LineProfile = { userId: string; displayName: string; pictureUrl?: string; statusMessage?: string };

export async function getProfile(userId: string): Promise<LineProfile | null> {
  const token = import.meta.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${LINE_API}/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as LineProfile;
  } catch {
    return null;
  }
}

/** webhookイベントの型（最小） — Messaging APIリファレンスの公式subset */
export type LineWebhookEvent = {
  type: 'message' | 'follow' | 'unfollow' | 'postback' | string;
  webhookEventId?: string;
  timestamp: number;
  source: { type: 'user' | 'group' | 'room'; userId?: string };
  replyToken?: string;
  message?: {
    type: 'text' | 'sticker' | 'image' | 'video' | string;
    id: string;
    text?: string;
  };
};
