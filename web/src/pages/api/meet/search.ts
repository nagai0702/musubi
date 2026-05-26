import type { APIRoute } from 'astro';
import { searchNotion, getPageContent } from '@/lib/notion';
import { searchFAQ } from '@/lib/faq-store';
import { recordMissedQuery } from '@/lib/misrecognition-learner';

function verifyApiKey(request: Request): boolean {
  const key = import.meta.env.MEET_API_KEY;
  if (!key) return true;
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${key}`;
}

function cors(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

export const OPTIONS: APIRoute = () => cors({}, 204);

/* ===== キーワード抽出 & クエリ生成 ===== */

const KEYWORD_MAP: Record<string, string[]> = {
  '料金プラン': ['料金', '費用', '値段', '金額', 'いくら', '価格', '入会金', '月会費', '成婚料', 'お見合い料', '支払', '分割', 'クレジット'],
  'サービス':   ['サービス', 'プラン', '内容', 'コース', '特徴', '違い', 'サポート', 'カウンセラー', 'カウンセリング'],
  '入会':       ['流れ', '手順', 'ステップ', 'どうやって', '方法', '入会', '手続き', '書類', '必要', '独身証明'],
  'FAQ':        ['質問', '退会', '返金', 'キャンセル', '年齢', '制限', 'オンライン', '断る', '大丈夫'],
  '実績':       ['実績', '成婚率', '口コミ', '評判', '何組', '期間', '声', '成功'],
};

function extractSearchQueries(rawQuery: string): string[] {
  const q = rawQuery.trim();
  const queries = new Set<string>();

  // 1. まずカテゴリマッチ — クエリに含まれるキーワードからカテゴリを特定
  for (const [category, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some(kw => q.includes(kw))) {
      queries.add(category);
    }
  }

  // 2. 元のクエリも追加（ただしフィラーを除去）
  const cleaned = q
    .replace(/えーと|あの[ー～]?|ちょっと|すみません|テストテスト。?\s*/g, '')
    .replace(/は(いくら|どう|何)/, (_, m) => m)
    .replace(/ですか[？?]?|ますか[？?]?|でしょうか[？?]?/g, '')
    .trim();
  if (cleaned.length >= 2) {
    queries.add(cleaned);
  }

  // 3. フォールバック
  if (queries.size === 0) queries.add(q);

  return [...queries];
}

/* ===== コンテンツを要点に変換 ===== */

function formatAsKeyPoints(content: string, maxPoints = 8): string[] {
  const lines = content.split('\n').filter(l => l.trim());
  const points: string[] = [];

  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // セクション見出し
    if (trimmed.startsWith('# ') || trimmed.startsWith('## ')) {
      currentSection = trimmed.replace(/^#+\s*/, '');
      continue;
    }

    // 箇条書き項目 → そのまま要点として使う
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ')) {
      const text = trimmed.replace(/^[•\-]\s*/, '');
      // 情報量が少ないものはスキップ
      if (text.length < 5 || text.startsWith('※') || text === '---') continue;
      points.push(text);
    }

    if (points.length >= maxPoints) break;
  }

  return points;
}

/* ===== メインハンドラ ===== */

export const POST: APIRoute = async ({ request }) => {
  if (!verifyApiKey(request)) return cors({ error: 'Unauthorized' }, 401);

  try {
    const { query, fast } = (await request.json()) as { query: string; fast?: boolean };
    if (!query?.trim()) return cors({ error: 'query is required' }, 400);

    // FAQ検索（メモリ内なので高速）
    let faqResults: any[] = [];
    try {
      const faqs = await searchFAQ(query, 3);
      faqResults = faqs
        .filter(f => f.score > 0)
        .map(f => ({
          type: 'faq',
          question: f.question,
          answer: f.answer,
          category: f.category,
          score: f.score,
        }));
    } catch (e: any) {
      console.error('FAQ search error:', e.message);
    }

    // FAQヒットなし → 未ヒット質問を記録（学習用）
    if (!faqResults.length && query.length >= 5) {
      recordMissedQuery(query);
    }

    // fast=true → FAQのみ返す（Notion API呼ばない）
    if (fast) {
      return cors({ results: [], faqResults, searchQueries: [] });
    }

    // 手動検索 → Notion APIも実行
    const searchQueries = extractSearchQueries(query);
    const seenIds = new Set<string>();
    const allPages: any[] = [];
    for (const sq of searchQueries) {
      const pages = await searchNotion(sq);
      for (const page of pages) {
        if (!seenIds.has(page.id)) { seenIds.add(page.id); allPages.push(page); }
      }
    }

    const results = await Promise.all(
      allPages.slice(0, 3).map(async (page) => {
        try {
          const content = await getPageContent(page.id);
          const keyPoints = formatAsKeyPoints(content);
          return { ...page, keyPoints, snippet: keyPoints.join(' / ').slice(0, 200) };
        } catch { return { ...page, keyPoints: [], snippet: '' }; }
      })
    );

    return cors({ results, faqResults, searchQueries });
  } catch (e: any) {
    return cors({ error: e.message }, 500);
  }
};
