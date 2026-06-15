# Firestore Rules デプロイ手順

## 概要
Firestore のセキュリティルール（firestore.rules）を Firebase Console に反映させるための手順です。

## 実行日時
2026-06-15

## 手順

### 1. Firebase CLI をインストール
```bash
npm install -g firebase-tools
```

### 2. Firebase にログイン
```bash
firebase login
```
- ブラウザが開きます
- Google アカウント（u.t.o0911@gmail.com）で認証
- ターミナルに戻る

### 3. Firestore ルールをデプロイ
```bash
cd ~/flashcard-app
firebase deploy --only firestore:rules --project=ankimaster-395d5
```

### 4. デプロイ完了確認
以下のメッセージが表示されたら成功：
```
✔  cloud.firestore: rules file firestore.rules compiled successfully
✔  firestore: released rules firestore.rules to cloud.firestore
✔  Deploy complete!
```

## 必要なファイル
- `firestore.rules` - セキュリティルール定義
- `firebase.json` - Firebase 設定（プロジェクト ID を指定）

## トラブルシューティング

### エラー: "firebase.json not found"
**原因**: firebase.json が存在しない
**解決**: プロジェクトルートに firebase.json を作成

### エラー: "project not specified"
**原因**: プロジェクト ID が指定されていない
**解決**: 
- firebase.json に `"projects": { "default": "ankimaster-395d5" }` を追加
- または `--project=ankimaster-395d5` フラグを使用

### エラー: "firestore.indexes.json does not exist"
**原因**: firebase.json で存在しないファイルを参照
**解決**: firebase.json から `"indexes": "firestore.indexes.json"` 行を削除

## セキュリティルール内容
- メールアドレス `u.t.o0911@gmail.com` のユーザーのみがアクセス可能
- `users/{uid}` 配下のすべてのデータを読み書き可能
- 他のユーザーはアクセス不可

## デプロイ後の確認
1. Netlify アプリで自動保存機能が動作するか確認
2. Firebase Console → Firestore Database → ルール で反映を確認
   https://console.firebase.google.com/project/ankimaster-395d5/firestore/rules
