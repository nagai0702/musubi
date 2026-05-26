# 結び 契約書締結ツール

Astro (SSR) + Google Sheets + Gmail + Slack OAuth で動く、顧客との電子契約締結ツール。

## 機能
- 営業が契約トークンを発行し、顧客にURL送付
- 顧客が情報入力 → 料金確認 → 支払方法選択 → 電子署名 → 完了
- PDF自動生成・送付、Google Sheets に記録

## セットアップ
```bash
cd contract-app
npm install
cp .env.example .env
# .env を編集（Google OAuth / Slack OAuth / Sheet ID 等）
npm run dev   # http://localhost:4321
```

## ルート構成
| パス | 用途 |
|:----|:----|
| `/` | `/contract/new` へリダイレクト |
| `/contract/new` | 営業: 契約新規発行 |
| `/contract/[token]/form` | 顧客: 情報入力 |
| `/contract/[token]/pricing` | 営業: 料金設定 |
| `/contract/[token]/payment` | 顧客: 支払方法選択 |
| `/contract/[token]/sign` | 顧客: 電子署名 |
| `/contract/[token]/complete` | 完了画面 |
| `/contract/[token]/admin` | 営業: 管理画面 |

## デプロイ
- Vercel: GitHub 連携で自動デプロイ。Root Directory を `contract-app` に設定。
