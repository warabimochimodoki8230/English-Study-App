# 総合英語 神問題

Cloudflare Workers Static Assets で配信する静的英語学習アプリです。

## 構成
- `public/`：Cloudflare に配信するファイルだけを格納
- `public/index.html`：画面
- `public/styles.css`：スタイル
- `public/app.js`：アプリ本体
- `public/data/`：問題データ(JSON)
- `wrangler.jsonc`：Cloudflare Workers の静的アセット設定

## Cloudflare
Git 連携でデプロイする場合のデプロイコマンドは `npx wrangler deploy` のままでOKです。
`wrangler.jsonc` が `public/` を静的アセットの配信元として指定します。

重要：リポジトリ直下にある `.git/` は GitHub/GitLab 側の管理情報なので、Cloudflare の静的アセット用ディレクトリには含めません。
