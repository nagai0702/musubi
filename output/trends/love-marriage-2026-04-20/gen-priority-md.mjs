#!/usr/bin/env node
// priority-keywords.json → priority-keywords.md (人間が読めるマークダウン)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IN = path.join(__dirname, "priority-keywords.json");
const OUT = path.join(__dirname, "priority-keywords.md");

const data = JSON.parse(fs.readFileSync(IN, "utf-8"));
const fmt = n => n.toLocaleString();

function table(rows, cols) {
  const h = "| " + cols.map(c => c.label).join(" | ") + " |";
  const sep = "|" + cols.map(() => ":---").join("|") + "|";
  const body = rows.map(r => "| " + cols.map(c => c.get(r)).join(" | ") + " |").join("\n");
  return [h, sep, body].join("\n");
}

let md = "";
md += "# 優先キーワード（875→Top100＋フォーマット別）\n\n";
md += "**スコアリング日**: 2026-04-20\n";
md += `**採点対象**: ${data.meta.total_scored}KW\n`;
md += `**スコア式**: \`(log10(vol)*0.6 + CV距離スコア + ペルソナボーナス) × 検索意図係数 − 競合ペナルティ\`\n\n`;
md += "- CV距離: 顕在=3.0 / 準顕在=2.0 / 潜在=1.0\n";
md += "- 検索意図: transactional×1.5 / commercial×1.3 / navigational×1.1 / informational×1.0\n";
md += "- ペルソナボーナス: 「男/男性/30代/アラサー/27〜39歳/年収」を含むKWに最大+1.0\n\n";

md += "## 総合Top 100\n\n";
md += table(data.top100, [
  { label: "順", get: (_, i) => i+1 },
  { label: "Score", get: r => r.score.toFixed(2) },
  { label: "KW", get: r => r.kw },
  { label: "月Vol", get: r => fmt(r.vol) },
  { label: "CV距離", get: r => r.cv_distance },
  { label: "意図", get: r => r.intent || "—" },
  { label: "第1手", get: r => r.primary_format },
  { label: "クラスター", get: r => r.cluster.replace(/（.*$/, "") }
].map((c, ci) => ci === 0 ? { label: c.label, get: (r, i) => String(i+1) } : c));

// Fix: table function doesn't pass index; let me rewrite
md = md.slice(0, md.indexOf("## 総合Top 100")) + "## 総合Top 100\n\n";
md += "| # | Score | KW | 月Vol | CV | 意図 | 第1手 | クラスター |\n";
md += "|---:|---:|:---|---:|:---|:---|:---|:---|\n";
data.top100.forEach((r, i) => {
  md += `| ${i+1} | ${r.score.toFixed(2)} | ${r.kw} | ${fmt(r.vol)} | ${r.cv_distance} | ${r.intent || "—"} | ${r.primary_format} | ${r.cluster.replace(/（.*$/, "")} |\n`;
});

md += "\n---\n\n## フォーマット別 Top 20\n\n";

const FORMAT_ORDER = [
  "SEO記事",
  "SEO比較記事",
  "SEO地域LP",
  "SEOロングテール記事",
  "YouTube共感動画",
  "YouTubeコラボ"
];

FORMAT_ORDER.forEach(fmtName => {
  const arr = data.by_format[fmtName];
  if (!arr || !arr.length) return;
  md += `### ${fmtName}（${arr.length > 20 ? "Top 20" : "全" + arr.length}件）\n\n`;
  md += "| # | Score | KW | 月Vol | クラスター | サブ | メモ |\n";
  md += "|---:|---:|:---|---:|:---|:---|:---|\n";
  arr.slice(0, 20).forEach((r, i) => {
    md += `| ${i+1} | ${r.score.toFixed(2)} | ${r.kw} | ${fmt(r.vol)} | ${r.cluster.replace(/（.*$/, "")} | ${r.subcluster} | ${(r.notes || "").replace(/\|/g,"\\|")} |\n`;
  });
  md += "\n";
});

md += "---\n\n## 戦略サマリ\n\n";
md += "### フォーマット配分（Top 100ベース）\n\n";
const top100Formats = {};
data.top100.forEach(r => {
  top100Formats[r.primary_format] = (top100Formats[r.primary_format] || 0) + 1;
});
md += "| フォーマット | Top100内件数 |\n|:---|---:|\n";
Object.entries(top100Formats).sort((a,b) => b[1] - a[1]).forEach(([f, n]) => {
  md += `| ${f} | ${n} |\n`;
});
md += "\n";

md += "### CV距離別の戦略\n\n";
md += "- **顕在層（Top100の大半）**: SEO記事＋比較記事で刈り取り。男性視点・30代視点の個別ページで競合空白に差し込む\n";
md += "- **準顕在層**: YouTube共感動画＋noteロング記事で検索経由流入。アラサー焦り・独身老後・結婚メリット論の3テーマが主軸\n";
md += "- **潜在層**: YouTubeコラボ（キャリア系・お金系・自己投資系）で母集団拡大とブランド想起\n\n";

md += "### すぐ着手すべき3本（最優先）\n\n";
md += "1. **「結婚相談所 30代 男性」徹底ガイド** — Top1スコア7.71／月2,400 Vol／男性視点はTier1空白\n";
md += "2. **「結婚相談所 男性 料金」全コスト公開** — 男性会員目線の料金シミュ。naresome/my-best が弱い領域\n";
md += "3. **YouTube: マッチングアプリ3年疲弊男性が相談所に切替えた実録** — 顕在〜準顕在のジャーニー動画。検索流入＋指名検索UP\n";

fs.writeFileSync(OUT, md);
console.log(`✓ Written: ${OUT} (${md.length} chars)`);
