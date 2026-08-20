# 総合英語 神問題

Cloudflare Pages / 静的ホスティング向けの HTML + CSS + JavaScript + JSON 構成です。

## 構成

- `index.html` : 画面本体
- `styles.css` : UI
- `app.js` : 出題・検索・進捗管理（localStorage）
- `data/vocab/` : 単語データ（レベル別・分割JSON）
- `data/idioms/` : 熟語データ
- `data/grammar/` : 文法データ

読み取り専用の静的サイトなので、Cloudflare Pages では追加のビルド設定なしで配信できます。

## データ追加ルール

1. 同じJSON形式でファイルを分割する
2. `app.js` の `files` にパスを追加する
3. 各問題に `type` と `id` を付ける
4. `question / choices / answer / explanation` を必須とする

データは一括で1ファイルにまとめず、レベル・分野・連番で分割して管理してください。
