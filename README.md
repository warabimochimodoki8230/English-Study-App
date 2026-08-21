# 総合英語 神問題 v9

静的ファイルだけで動作する英語学習アプリです。

## 構成
- `public/` : 配信する静的ファイル本体
- `public/data/vocab/` : 単語データ
- `public/data/idioms/` : 熟語データ
- `public/data/grammar/` : 総文法・文法クイズ
- `scripts/` : データ検証・データベース再構築

## 今回の拡張
- 単語データ: 約4,600見出し語
- 熟語データ: 約670件
- 文法クイズ: 約1,000問
- 進捗はブラウザのlocalStorageに保存
- 問題データは読み取り専用の静的JSON
- データ検証スクリプト付き

## 品質検証

```bash
node scripts/validate-data.mjs
node scripts/quality-check.mjs
```

構造エラー・品質警告がない状態を配信用データの基準としています。

## 静的配信
`public/` の中身をWebルートとして配信してください。アプリ本体は静的ファイルのみで動作し、サーバーAPI・DB・ビルド処理は必要ありません。

## データ方針
市販の参考書の本文や問題文をそのまま転載するのではなく、入試・検定で重要な語彙・語法・文法を学習用データとして整理しています。


## v14 additions
- Learning analytics panel with actual mistakes and risk candidates
- Reading passage target time + pauseable count-up stopwatch
- 800 additional grammar questions
- 48 additional reading passages / 240 questions
