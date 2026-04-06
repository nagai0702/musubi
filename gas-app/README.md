# 結び 勤怠 & 会議室予約アプリ

Google Apps Script + Sheets で動く社内Webアプリ。Slackの打刻ログを自動取り込み、3部屋(会議室/撮影部屋/洗面所)の予約と来客登録ができる。

## 機能
- **出勤ログ**: Slack `#attendance` チャンネルを5分ごとに自動取得（出勤/退勤/休憩開始/休憩終了/外出/戻り）
- **会議室予約**: 3部屋 × 15分単位 × 9–21時。重複チェックあり。本人のみ削除可
- **来客登録**: 日時/名前/会社/用件/担当を全員に共有
- **Slack OAuth**: Sign in with Slack でログイン

## セットアップ手順

### 1. スプレッドシート作成
新規スプレッドシートを作成し、URLからIDをコピー。

### 2. GASプロジェクト作成
1. https://script.google.com で新規プロジェクト
2. このフォルダ内の `.gs` / `.html` / `appsscript.json` を全てコピペ
3. ライブラリ追加: `OAuth2` (ID: `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF`)

### 3. Slack App作成
https://api.slack.com/apps → Create New App
- **OAuth & Permissions**:
  - Bot Token Scopes: `channels:history`, `groups:history`, `users:read`
  - User Token Scopes (Sign in with Slack): `openid`, `profile`, `email`
- **Redirect URL**: GASのWebアプリURL + `?action=callback`
  (ウェブアプリ初回デプロイ後に判明するので、デプロイ→URL取得→Slack側に登録→再保存)
- インストールして `Bot User OAuth Token (xoxb-...)` と `Client ID / Secret` を控える

### 4. スクリプトプロパティ設定
GASエディタ → プロジェクトの設定 → スクリプトプロパティに追加:

| キー | 値 |
|---|---|
| `SHEET_ID` | スプレッドシートID |
| `SLACK_CLIENT_ID` | Slack App の Client ID |
| `SLACK_CLIENT_SECRET` | Slack App の Client Secret |
| `SLACK_TEAM_ID` | ワークスペースID (任意) |
| `SLACK_BOT_TOKEN` | xoxb-... |
| `ATTENDANCE_CHANNEL_ID` | #attendance のチャンネルID (C0xxxxxxx) |

### 5. 初期化
GASエディタで以下を1回実行:
```
setupSheets()    // シート3つを作成
installTrigger() // Slack取り込み 5分トリガー
```

### 6. デプロイ
デプロイ → 新しいデプロイ → 種類: ウェブアプリ
- 次のユーザーとして実行: 自分
- アクセスできるユーザー: 全員

発行されたURLを Slack App の Redirect URL に登録し、メンバーに共有。

## Slack打刻ルール
`#attendance` チャンネルに以下の本文だけを投稿:

| 投稿 | 区分 |
|---|---|
| `出勤` | in |
| `退勤` | out |
| `休憩開始` | break_start |
| `休憩終了` | break_end |
| `外出` | away |
| `戻り` | back |

Bot を `#attendance` に招待しておくこと (`/invite @your-bot`)。

## ファイル構成
```
gas-app/
├ appsscript.json   マニフェスト
├ Code.gs           Webエントリ・API
├ Auth.gs           Slack OAuth
├ Sheets.gs         シートI/O
├ SlackPoll.gs      Slack取り込みトリガー
├ Index.html        UI骨格
├ Style.html        CSS
└ App.html          フロントJS
```
