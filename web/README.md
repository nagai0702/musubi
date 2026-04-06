# 結び 勤怠 & 会議室予約 (Web版)

Astro (SSR) + Google Sheets API + Slack OAuth で動くウェブアプリ。

## 機能
- 出勤/退勤の打刻 (Webボタン or Slack `#attendance` チャンネル投稿)
- 会議室3部屋 (会議室/撮影部屋/洗面所) を15分単位で予約 (9-21時)
- 来客登録を全員に共有
- Slack OAuth ログイン

## セットアップ

```bash
cd web
npm install
cp .env.example .env
# .env を編集して Sheet ID / サービスアカウント / Slack OAuth を設定
npm run dev   # http://localhost:4321
```

### 1. Google Sheets 準備
1. 新しいスプレッドシート作成
2. 3シート作成: `Attendance`, `Bookings`, `Visitors`
3. 各シートのA1から下記ヘッダーを入力

| シート | ヘッダー |
|---|---|
| Attendance | timestamp / user_id / user_name / type / source |
| Bookings | id / date / room / start / end / title / user_id / user_name / created_at |
| Visitors | id / date / time / name / company / purpose / host / created_at |

### 2. サービスアカウント
1. GCP コンソールでサービスアカウントを作成
2. JSONキーをDL → `client_email` と `private_key` を `.env` に貼る
3. スプレッドシートの共有設定にサービスアカウントのメールを **編集権限** で追加

### 3. Slack App
- https://api.slack.com/apps → Create New App
- OAuth Scopes (User): `openid`, `profile`, `email`
- Bot Scopes: `channels:history`, `users:read`
- Redirect URL: `https://your-domain/api/auth/slack/callback`
- Client ID/Secret と Bot Token を `.env` に設定

## デプロイ
- **Vercel**: `vercel --prod`（`@astrojs/node` の代わりに `@astrojs/vercel/serverless` に差し替え）
- **VPS**: `npm run build && node dist/server/entry.mjs`
- **Cloudflare**: アダプタを `@astrojs/cloudflare` に変更

## Slack 出勤チャンネル
`#attendance` チャンネルに本文だけで投稿:
- `出勤`
- `退勤`

ボットを招待 (`/invite @your-bot`) しておけば、5分ごとにポーリングして自動記録 (cron は外部から `pollAttendance()` を呼ぶか、Vercel Cron で起動)。
