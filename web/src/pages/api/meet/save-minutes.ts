import type { APIRoute } from 'astro';
import { createMeetingPage } from '@/lib/notion';
import { summarizeMeeting } from '@/lib/claude';
import { notifyMissedQueriesToSlack } from '@/lib/misrecognition-learner';

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

export const POST: APIRoute = async ({ request }) => {
  if (!verifyApiKey(request)) return cors({ error: 'Unauthorized' }, 401);

  try {
    const body = (await request.json()) as {
      title: string;
      date?: string;
      participants?: string[];
      transcript: string;
      summarize?: boolean;   // Phase 3: AI summarization
      summary?: string;
      keyPoints?: string[];
      actionItems?: string[];
    };

    if (!body.title?.trim()) return cors({ error: 'title is required' }, 400);
    if (!body.transcript?.trim()) return cors({ error: 'transcript is required' }, 400);

    const date = body.date || new Date().toISOString().slice(0, 10);

    let { summary, keyPoints, actionItems } = body;
    let aiTitle = body.title;

    // Phase 3: AI-powered summarization
    if (body.summarize) {
      try {
        const ai = await summarizeMeeting(body.transcript);
        aiTitle = ai.title || body.title;
        summary = ai.summary;
        keyPoints = ai.keyPoints;
        actionItems = ai.actionItems;
        // Append customer profile info to key points
        if (ai.customerProfile?.interests?.length) {
          keyPoints = [...(keyPoints || []), `【顧客の関心】${ai.customerProfile.interests.join('、')}`];
        }
        if (ai.customerProfile?.concerns?.length) {
          keyPoints = [...(keyPoints || []), `【顧客の懸念】${ai.customerProfile.concerns.join('、')}`];
        }
        if (ai.nextSteps?.length) {
          actionItems = [...(actionItems || []), ...ai.nextSteps.map(s => `[次のステップ] ${s}`)];
        }
      } catch (e: any) {
        console.error('AI summarization failed, saving raw transcript:', e.message);
        // Continue with raw save if AI fails
      }
    }

    const result = await createMeetingPage({
      title: aiTitle,
      date,
      participants: body.participants || [],
      transcript: body.transcript,
      summary,
      keyPoints,
      actionItems,
    });

    // 未ヒット質問をSlackに通知（学習用）
    notifyMissedQueriesToSlack(aiTitle).catch(() => {});

    return cors({ pageId: result.id, url: result.url });
  } catch (e: any) {
    return cors({ error: e.message }, 500);
  }
};
