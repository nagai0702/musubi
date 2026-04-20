# web/src/research-content/

Astro のサーバールート `/research/[...path].ts` から Basic 認証経由で配信される
社内限定のリサーチ資産の置き場。

## 構成
- `love-marriage-2026-04-20/` — 恋愛・婚活バズコンテンツリサーチ（875KW + 3ヶ月カレンダー）

## 配信URL
デプロイ後、以下の URL でアクセス可能:
```
https://<vercel-domain>/research/love-marriage-2026-04-20/
```

ブラウザが Basic 認証ポップアップを表示 → `RESEARCH_USER` / `RESEARCH_PASSWORD` の
環境変数に設定した資格情報を入力 → ダッシュボード表示。

## 環境変数（Vercel + ローカル両方）
- `RESEARCH_USER` — Basic 認証のユーザー名
- `RESEARCH_PASSWORD` — Basic 認証のパスワード

## 更新方法
1. `output/trends/love-marriage-2026-04-20/` を編集
2. `cp -r output/trends/love-marriage-2026-04-20 web/src/research-content/`（上書き）
3. `git commit` & `git push` → Vercel が自動デプロイ

## ルートの仕様
- ルート: `/research/` → 最新リサーチへ 302 リダイレクト
- 認証: HTTP Basic 認証（`www-authenticate` ヘッダーで要求）
- バンドル: Vite の `import.meta.glob(..., { query: '?raw' })` で全ファイルを
  サーバーレス関数に埋込（実行時に `fs` 参照せずに配信）
- 対応拡張子: `.html`, `.md`, `.json`, `.js`, `.mjs`, `.css`, `.txt`, `.svg`
