#!/usr/bin/env node
// KWスコアリングと優先度付け
// 入力: keyword-data.json
// 出力: priority-keywords.json (+簡易コンソール確認)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IN = path.join(__dirname, "keyword-data.json");
const OUT = path.join(__dirname, "priority-keywords.json");

const data = JSON.parse(fs.readFileSync(IN, "utf-8"));

const CV_SCORE = { "顕在": 3.0, "準顕在": 2.0, "潜在": 1.0 };
const INTENT_BONUS = {
  transactional: 1.5,
  commercial: 1.3,
  navigational: 1.1,
  informational: 1.0,
  "": 1.0
};

// KW文字列からペルソナ適合ボーナスを推定
function personaBonus(kw) {
  let b = 0;
  if (/男|男性/.test(kw)) b += 0.4;
  if (/30代|アラサー|20代|27|28|29|30|31|32|33|34|35|36|37|38|39/.test(kw)) b += 0.3;
  if (/年収|400万|500万|600万|700万/.test(kw)) b += 0.3;
  if (/結婚相談所|婚活 真剣|結婚したい/.test(kw)) b += 0.2;
  return Math.min(b, 1.0);
}

// notes/競合強度ペナルティ
function competitionPenalty(notes, vol) {
  if (!notes) return 0;
  let p = 0;
  if (/Tier1|競合強|激戦|my-best|ビッグワード/.test(notes)) p += 0.5;
  if (/薄め|空白|競合弱|狙い目/.test(notes)) p -= 0.5;  // ボーナス化
  return p;
}

// 推奨フォーマット判定
function recommendFormat(kw, vol, cv, intent, notes) {
  // Brand terms & head terms: SEO指名系
  if (cv === "顕在" && (intent === "navigational" || /オーネット|ツヴァイ|IBJ|サンマリエ|エン婚活|naco-do|スマリッジ|パートナーエージェント|ゼクシィ|Pairs|Omiai|with/.test(kw))) {
    return { primary: "SEO比較記事", secondary: "YouTube比較動画" };
  }
  // High-vol commercial: SEO主戦場
  if (cv === "顕在" && intent === "commercial" && vol >= 1000) {
    return { primary: "SEO記事", secondary: "YouTube解説" };
  }
  // Local KW: SEO地域ページ
  if (/東京|大阪|名古屋|横浜|福岡|札幌|仙台|広島|京都|千葉|埼玉|神戸/.test(kw) && /結婚相談所|婚活/.test(kw)) {
    return { primary: "SEO地域LP", secondary: "GBP強化" };
  }
  // Worry/complaint KW (潜在/準顕在): YouTube+note共感
  if (cv === "準顕在" || /疲れた|辛い|諦め|後悔|焦り|寂しい|不安|怖い/.test(kw)) {
    return { primary: "YouTube共感動画", secondary: "note実体験記事" };
  }
  // Persona adjacent clusters: コラボ
  if (cv === "潜在" && /年収|転職|副業|NISA|iDeCo|筋トレ|脱毛|AGA|ファッション|清潔感|コミュ障|友達/.test(kw)) {
    return { primary: "YouTubeコラボ", secondary: "X投稿" };
  }
  // Default potential
  return { primary: "SEOロングテール記事", secondary: "X投稿" };
}

// スコアリング
const scored = [];
data.clusters.forEach(c => {
  c.subclusters.forEach(s => {
    s.keywords.forEach(k => {
      const vol = k.vol || 100;
      const volScore = Math.log10(vol + 1) * 0.6;  // 0-3.6
      const cvScore = CV_SCORE[c.cv_distance] || 1.0;
      const intentMult = INTENT_BONUS[k.intent] || 1.0;
      const persona = personaBonus(k.kw);
      const penalty = competitionPenalty(k.notes, vol);
      const raw = (volScore + cvScore + persona) * intentMult - penalty;

      const format = recommendFormat(k.kw, vol, c.cv_distance, k.intent, k.notes);

      scored.push({
        kw: k.kw,
        vol,
        cluster: c.name,
        cluster_id: c.id,
        subcluster: s.name,
        subcluster_id: s.id,
        cv_distance: c.cv_distance,
        intent: k.intent || "",
        notes: k.notes || "",
        score: Math.round(raw * 100) / 100,
        primary_format: format.primary,
        secondary_format: format.secondary
      });
    });
  });
});

scored.sort((a, b) => b.score - a.score);

// フォーマット別TopN抽出
const byFormat = {};
scored.forEach(s => {
  if (!byFormat[s.primary_format]) byFormat[s.primary_format] = [];
  byFormat[s.primary_format].push(s);
});

// トップ100全体
const top100 = scored.slice(0, 100);

// フォーマット別トップ
const topByFormat = {};
Object.keys(byFormat).forEach(f => {
  topByFormat[f] = byFormat[f].slice(0, 20);
});

const output = {
  meta: {
    created: "2026-04-20",
    total_scored: scored.length,
    method: "score = (log10(vol)*0.6 + cv_score + persona_bonus) * intent_multiplier - competition_penalty",
    cv_weight: { 顕在: 3.0, 準顕在: 2.0, 潜在: 1.0 },
    intent_multiplier: INTENT_BONUS
  },
  top100: top100,
  by_format: topByFormat,
  all_scored: scored
};

fs.writeFileSync(OUT, JSON.stringify(output, null, 2));

// Console summary
const fmt = n => n.toLocaleString();
console.log(`✓ Scored ${scored.length} KWs`);
console.log(`✓ Top 100 score range: ${top100[0].score} → ${top100[99].score}`);
console.log(`\nTop 15 overall:`);
top100.slice(0, 15).forEach((k, i) => {
  console.log(`  ${String(i+1).padStart(2)}. [${k.score}] ${k.kw} (${fmt(k.vol)}/月 · ${k.cv_distance} · ${k.primary_format})`);
});
console.log(`\nFormat distribution:`);
Object.entries(byFormat).sort((a,b) => b[1].length - a[1].length).forEach(([f, arr]) => {
  console.log(`  ${f}: ${arr.length}`);
});
console.log(`\n✓ Written: ${OUT}`);
