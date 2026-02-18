# タスク管理スキル（Issue Triage）

ユーザーのテキスト入力からGitHub Issueを自動作成する。

## 引数
$ARGUMENTS - ユーザーが入力したタスクの内容テキスト

## 実行手順

1. **入力テキストの解析**
   - $ARGUMENTS からタスクの内容・目的を抽出
   - 優先度を判定（緊急度と重要度から）
   - カテゴリを判定

2. **ラベルの自動付与**
   - タイプラベル:
     - `type:task` - 通常のタスク
     - `type:idea` - アイデア・検討事項
     - `type:content` - コンテンツ制作関連
     - `type:bug` - 不具合・修正
   - 優先度ラベル:
     - `priority:high` - 今日〜明日中に対応
     - `priority:medium` - 今週中に対応
     - `priority:low` - 来週以降でOK
   - ドメインラベル:
     - `domain:strategy` - 事業戦略
     - `domain:finance` - 経理・財務
     - `domain:marketing` - マーケティング・広告
     - `domain:operations` - 業務運営
     - `domain:member` - 会員対応

3. **既存Issueとの重複チェック**
   - GitHub上の既存Issueを検索
   - 類似タスクがある場合はユーザーに報告

4. **GitHub Issueを作成**
   - タイトル：簡潔で具体的に
   - 本文：タスクの詳細、背景、完了条件を記載
   - ラベルを付与

5. **作成結果をユーザーに報告**
   - Issue番号とURLを表示
   - 付与したラベルを表示
   - 類似Issueがあった場合はその情報も表示

## 出力フォーマット

```
Issue を作成しました:
- タイトル: [Issue タイトル]
- URL: [Issue URL]
- ラベル: [付与されたラベル一覧]
- 優先度: [高/中/低]

[重複Issueがある場合]
類似のIssueが見つかりました:
- #XX [類似Issueのタイトル]
```

## 注意事項
- GitHubリポジトリが設定されていない場合は、ローカルの03_projects/にタスクファイルとして保存する
- ユーザーの入力が曖昧な場合は、確認を求めてからIssueを作成する
