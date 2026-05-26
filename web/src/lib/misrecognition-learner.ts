/**
 * 誤変換学習システム
 * - FAQ検索で未ヒットだった質問を記録
 * - Slackに投稿して人間に修正を依頼
 * - 修正結果を辞書ファイルに保存 → 次回から自動補正
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DICT_PATH = join(process.cwd(), 'data', 'learned-corrections.json');

type CorrectionEntry = {
  wrong: string;      // 誤変換テキスト
  correct: string;    // 正しいテキスト
  addedAt: string;    // 追加日時
  source: 'slack' | 'auto';
};

type MissedQuery = {
  query: string;
  timestamp: string;
  meetingTitle?: string;
};

/* ===== 学習済み辞書の読み込み ===== */

let learnedCorrections: CorrectionEntry[] = [];
let loaded = false;

function ensureDataDir() {
  const dir = join(process.cwd(), 'data');
  if (!existsSync(dir)) {
    const { mkdirSync } = require('node:fs');
    mkdirSync(dir, { recursive: true });
  }
}

export function loadLearnedCorrections(): CorrectionEntry[] {
  if (loaded) return learnedCorrections;
  try {
    if (existsSync(DICT_PATH)) {
      learnedCorrections = JSON.parse(readFileSync(DICT_PATH, 'utf-8'));
    }
  } catch {
    learnedCorrections = [];
  }
  loaded = true;
  return learnedCorrections;
}

export function applyLearnedCorrections(text: string): string {
  const corrections = loadLearnedCorrections();
  let result = text;
  for (const entry of corrections) {
    if (result.includes(entry.wrong)) {
      result = result.replaceAll(entry.wrong, entry.correct);
    }
  }
  return result;
}

/* ===== 修正の追加 ===== */

export function addCorrection(wrong: string, correct: string, source: 'slack' | 'auto' = 'slack'): void {
  const corrections = loadLearnedCorrections();

  // 重複チェック
  if (corrections.some(c => c.wrong === wrong && c.correct === correct)) return;

  corrections.push({
    wrong,
    correct,
    addedAt: new Date().toISOString(),
    source,
  });

  ensureDataDir();
  writeFileSync(DICT_PATH, JSON.stringify(corrections, null, 2), 'utf-8');
  learnedCorrections = corrections;
}

/* ===== 未ヒット質問の記録 ===== */

const missedQueries: MissedQuery[] = [];

export function recordMissedQuery(query: string): void {
  // 同じクエリは重複しない
  if (missedQueries.some(m => m.query === query)) return;
  missedQueries.push({
    query,
    timestamp: new Date().toISOString(),
  });
}

export function getMissedQueries(): MissedQuery[] {
  return [...missedQueries];
}

export function clearMissedQueries(): void {
  missedQueries.length = 0;
}

/* ===== Slack通知 ===== */

export async function notifyMissedQueriesToSlack(meetingTitle: string): Promise<void> {
  const token = import.meta.env.SLACK_BOT_TOKEN;
  const channel = import.meta.env.SLACK_MEET_LEARNING_CHANNEL || import.meta.env.SLACK_ATTENDANCE_CHANNEL_ID;
  if (!token || !channel) return;

  const missed = getMissedQueries();
  if (!missed.length) return;

  const lines = missed.map((m, i) => `${i + 1}. 「${m.query}」`).join('\n');

  const text = `📝 *商談アシスタント学習リクエスト*\n` +
    `会議: ${meetingTitle}\n\n` +
    `以下の質問がFAQにヒットしませんでした:\n${lines}\n\n` +
    `💡 *修正方法:* このスレッドに以下の形式で返信してください:\n` +
    `\`誤変換テキスト → 正しいテキスト\`\n` +
    `例: \`9回 → 休会\` \`制婚 → 成婚\``;

  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel, text }),
    });
  } catch (e: any) {
    console.error('[Learning] Slack notification failed:', e.message);
  }

  clearMissedQueries();
}

/* ===== Slack返信の処理 ===== */

export function parseSlackCorrection(text: string): { wrong: string; correct: string }[] {
  const results: { wrong: string; correct: string }[] = [];

  // 「A → B」形式を解析
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/[「]?(.+?)[」]?\s*[→➡>＞]\s*[「]?(.+?)[」]?\s*$/);
    if (match) {
      const wrong = match[1].trim();
      const correct = match[2].trim();
      if (wrong && correct && wrong !== correct) {
        results.push({ wrong, correct });
      }
    }
  }

  return results;
}
