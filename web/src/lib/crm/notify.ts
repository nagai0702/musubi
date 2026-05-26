/** CRM Slack 通知ディスパッチャ — ルール発火時に #crm-alert に Block Kit メッセージを投稿 */
import type { Member } from './members';
import type { TimelineEntry } from './timeline';
import type { Rule } from './rules';
import { renderTemplate } from './rules';
import { generateCached } from './suggestion';
import { postToCrmChannel } from '@/lib/slack';
import * as timeline from './timeline';

export type DispatchParams = {
  member: Member;
  event: TimelineEntry;
  rule: Rule;
  recent?: TimelineEntry[];
};

export async function dispatch(params: DispatchParams): Promise<void> {
  const { member, event, rule } = params;
  const recent = params.recent ?? (await timeline.recent(member.pageId, 20));
  let suggestion: { tone: string; message: string; rationale: string } | null = null;
  try {
    suggestion = await generateCached(member, event, recent);
  } catch (e: any) {
    suggestion = {
      tone: '未生成',
      message: '（AI提案の生成に失敗しました。タイムラインを参照してください）',
      rationale: String(e?.message || e).slice(0, 200),
    };
  }

  const baseUrl = (import.meta.env.PUBLIC_CRM_BASE_URL || '').replace(/\/$/, '');
  const memberUrl = `${baseUrl}/crm/member/${encodeURIComponent(member.memberId || member.pageId)}`;
  const headline = renderTemplate(rule.template || '{{name}}さんに動きがありました', {
    name: member.name,
    event: event.kind,
  });

  const blocks: any[] = [
    { type: 'header', text: { type: 'plain_text', text: headline, emoji: true } },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `ルール: *${rule.name}*` },
        { type: 'mrkdwn', text: `ステータス: ${member.status || '未設定'}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*声かけ提案（${suggestion.tone}）*\n${suggestion.message}\n\n_根拠: ${suggestion.rationale}_`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '過去ログを見る', emoji: true },
          url: memberUrl,
          style: 'primary',
        },
      ],
    },
  ];

  await postToCrmChannel({ text: headline, blocks });
}
