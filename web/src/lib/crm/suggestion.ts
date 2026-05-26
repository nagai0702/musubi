/** Claude による「プランナー向け声かけ提案」生成。既存 lib/claude.ts のパターンを踏襲。 */
import type { Member } from './members';
import type { TimelineEntry } from './timeline';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

export type OutreachSuggestion = {
  tone: string; // 提案する温度感（例: 「共感ベース」「軽やか」）
  message: string; // 実際に送る候補文面（140〜200字）
  rationale: string; // なぜこう言うのか（プランナー向けの1〜2文）
};

export async function generateOutreachSuggestion(
  member: Member,
  latestEvent: TimelineEntry | null,
  recentTimeline: TimelineEntry[],
): Promise<OutreachSuggestion> {
  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const systemPrompt = `あなたは結婚相談所「株式会社結び」の熟練プランナーです。
担当会員に対して、今このタイミングで送るLINE声かけ文面と、その根拠をプランナー向けに提案してください。
以下のJSON形式で出力してください（必ずJSONのみ、説明文なし）：

{
  "tone": "提案するトーン（例: '共感寄り', '軽めに気遣い', '励まし' など 10字以内）",
  "message": "会員に送るLINE候補文（140〜200字、敬語、自然体、絵文字は最大1つ）",
  "rationale": "なぜこの声かけが良いかを1〜2文でプランナー向けに説明"
}

基本方針：
- 会員の性格・趣向性メモがあれば最優先で参考にする
- 直近イベント（交際終了・沈黙・申し込みなど）に即した声かけにする
- 過去タイムラインから話題の整合性を取る（例: 相手の職業や価値観に触れて良いかはメモと相談）
- 押し売り／プレッシャーになる文面は避ける
- 交際終了直後は寄り添いを優先。アクション提示は急がない`;

  const profile = buildProfileBlock(member, recentTimeline);
  const eventBlock = latestEvent
    ? `【直近イベント】\n発生日時: ${latestEvent.occurredAt}\n種別: ${latestEvent.kind}\n内容: ${latestEvent.content}`
    : '【直近イベント】\n（特になし）';

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${profile}\n\n${eventBlock}\n\n以上を踏まえた声かけ提案をJSONで返してください。`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Claude API failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as any;
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      tone: '汎用',
      message: text.trim().slice(0, 200),
      rationale: '構造化解析に失敗したため本文のみ返却',
    };
  }
  return JSON.parse(jsonMatch[0]) as OutreachSuggestion;
}

function buildProfileBlock(m: Member, tl: TimelineEntry[]): string {
  const lines = [
    `【会員プロフィール】`,
    `氏名: ${m.name}`,
    m.age ? `年齢: ${m.age}` : '',
    m.occupation ? `職業: ${m.occupation}` : '',
    m.status ? `ステータス: ${m.status}` : '',
    m.joinedAt ? `入会日: ${m.joinedAt}` : '',
    m.personalityNotes ? `性格・趣向性メモ:\n${m.personalityNotes}` : '性格・趣向性メモ: （未記入）',
  ].filter(Boolean);
  const hist = tl.slice(0, 15).map((e) => `- ${e.occurredAt?.slice(0, 10) || ''} [${e.kind}] ${e.content.slice(0, 80)}`).join('\n');
  lines.push(`【直近タイムライン（最新15件）】\n${hist || '（履歴なし）'}`);
  return lines.join('\n');
}

/* ---- メモリキャッシュ（memberId+latestEventId でキー化） ---- */
const cache = new Map<string, { value: OutreachSuggestion; cachedAt: number }>();
const CACHE_TTL = 30 * 60 * 1000;

export async function generateCached(
  member: Member,
  latestEvent: TimelineEntry | null,
  recentTimeline: TimelineEntry[],
): Promise<OutreachSuggestion> {
  const key = `${member.pageId}:${latestEvent?.pageId || 'none'}`;
  const c = cache.get(key);
  if (c && Date.now() - c.cachedAt < CACHE_TTL) return c.value;
  const value = await generateOutreachSuggestion(member, latestEvent, recentTimeline);
  cache.set(key, { value, cachedAt: Date.now() });
  return value;
}

export function invalidateSuggestionCache(memberPageId: string): void {
  for (const k of cache.keys()) if (k.startsWith(memberPageId + ':')) cache.delete(k);
}
