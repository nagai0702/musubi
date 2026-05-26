import type { APIRoute } from 'astro';
import { addCorrection, parseSlackCorrection, loadLearnedCorrections } from '@/lib/misrecognition-learner';

function cors(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    },
  });
}

export const OPTIONS: APIRoute = () => cors({}, 204);

/**
 * POST /api/meet/learn — 誤変換修正を登録
 *   Body: { text: "9回 → 休会" }  (Slack形式)
 *   or:   { wrong: "9回", correct: "休会" }  (直接指定)
 *
 * GET /api/meet/learn — 学習済み辞書を取得
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as any;

    if (body.wrong && body.correct) {
      // 直接指定
      addCorrection(body.wrong, body.correct);
      return cors({ ok: true, added: [{ wrong: body.wrong, correct: body.correct }] });
    }

    if (body.text) {
      // Slack形式 (「A → B」)
      const corrections = parseSlackCorrection(body.text);
      for (const c of corrections) {
        addCorrection(c.wrong, c.correct);
      }
      return cors({ ok: true, added: corrections });
    }

    return cors({ error: 'wrong/correct or text is required' }, 400);
  } catch (e: any) {
    return cors({ error: e.message }, 500);
  }
};

export const GET: APIRoute = async () => {
  const corrections = loadLearnedCorrections();
  return cors({ corrections, count: corrections.length });
};
