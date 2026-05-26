/** Claude API integration for meeting summarization */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

export type MeetingSummary = {
  title: string;
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  customerProfile: {
    concerns: string[];
    interests: string[];
    objections: string[];
  };
  nextSteps: string[];
};

export async function summarizeMeeting(transcript: string): Promise<MeetingSummary> {
  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const systemPrompt = `あなたは結婚相談所「株式会社結び」の商談議事録アシスタントです。
Google Meetの商談の文字起こしを分析し、構造化された議事録を作成してください。

以下のJSON形式で出力してください（必ずJSON形式のみ、説明文なし）：
{
  "title": "会議タイトル（顧客名や主題を含む簡潔なタイトル）",
  "summary": "3〜5文の要約",
  "keyPoints": ["重要な議論ポイント1", "ポイント2", ...],
  "actionItems": ["次にやるべきこと1", "やるべきこと2", ...],
  "customerProfile": {
    "concerns": ["顧客の懸念・不安点"],
    "interests": ["顧客が関心を示した内容"],
    "objections": ["顧客からの反論・異論"]
  },
  "nextSteps": ["フォローアップ1", "フォローアップ2", ...]
}

分析のポイント：
- 営業担当者と顧客を会話パターンから識別する
- 料金・プラン・サービス内容に関する議論を特に注目する
- 営業担当者が顧客に約束した内容を漏れなくアクションアイテムに含める
- 結婚相談所特有の用語（お見合い、仲人、成婚料等）を正しく扱う`;

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `以下の商談の文字起こしを分析し、議事録をJSON形式で作成してください：\n\n${transcript}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as any;
  const text = data.content?.[0]?.text || '';

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse Claude response as JSON');

  return JSON.parse(jsonMatch[0]) as MeetingSummary;
}
