# AGENTS.md — SwingScout 開発メモ（Codex / Claude 向け）

日本株スイング候補のスクリーニングと「今週の作戦」レポート生成ツール。概要・データ構造・拡張方法は README.md を参照。

## コマンド

```bash
npm run dev          # 開発サーバー
npm run build        # 型チェック（app + node）→ dist/
npm test             # vitest（tests/*.test.ts）
npm run data:mock    # サンプルデータ再生成（ロジック変更後は実行して data/ を更新）
npm run report       # CLIでレポート生成
```

変更後は `npm run build && npm test` が通ることを確認する。

## 構成の原則

- `src/lib/` は **UI と CLI の共通ロジック**。DOM・`import.meta.env`・Node API に依存させない（例外：`dataLoader.ts` はブラウザ専用、`scripts/` は Node 専用）
- 画面（`src/pages`, `src/components`）に計算を書かない。`useAnalysis()` で受け取った結果を表示するだけにする
- スキーマは `src/types/dataset.ts` が正。派生値は JSON に入れず `src/lib/metrics.ts` で計算する
- 指標の追加は `src/lib/scoring.ts` の `FACTORS` に1エントリ。データ不足時は `null` を返す
- データ取得は `scripts/providers/` の Source を実装して差し込む。パイプライン（`scripts/lib/pipeline.ts`）は原則いじらない
- 日付は `'YYYY-MM-DD'` 文字列のまま `src/lib/calendar.ts` の関数で扱う（`new Date()` のローカルタイム計算を避ける）

## 守ること

- 外部通信なしで動く状態を保つ。APIキーや有料APIは使わない
- フロントは静的配信のみ（さくらのレンタルサーバー想定）。サーバー常駐・PHP を前提にしない。`base: './'` と HashRouter を維持
- 投資助言ではなく分析補助である旨の表示（フッター・レポート末尾の `DISCLAIMER`）を消さない
- `meta.isSample` が true のデータでは「サンプルデータ」表示を必ず出す
- 色：グリーン/レッド（`up` / `down` トークン）は上昇・下落・ポジティブ・ネガティブ専用。警告は `caution`、UI操作色は `accent`
- UI 文言は日本語。数値列は `.num`（等幅）

## よくある変更箇所

| やりたいこと | 場所 |
|---|---|
| スコアの重み・指標 | `src/lib/scoring.ts`（`DEFAULT_SCORING_CONFIG`, `FACTORS`） |
| 警告タグの閾値 | `src/lib/warnings.ts`（`WARNING_THRESHOLDS`） |
| 入り方・損切り・利確のルール | `src/lib/tradePlan.ts` |
| コメントの文体 | `src/lib/commentary.ts` |
| レポートの文体・セクション | `src/lib/reportGenerator.ts` |
| 休場日 | `src/lib/calendar.ts`（`JP_MARKET_HOLIDAYS`） |
| VI とサイズ目安 | `src/lib/market.ts` |
| 色・フォント | `src/index.css` |
