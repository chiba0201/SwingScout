# AGENTS.md — SwingScout 開発メモ（Codex / Claude 向け）

日本株スイング候補のスクリーニングと「今週の作戦」レポート生成ツール。概要・データ構造・拡張方法は README.md を参照。

## コマンド

```bash
npm run dev          # 開発サーバー
npm run build        # 型チェック（app + node）→ dist/
npm test             # vitest（tests/*.test.ts）
npm run data:mock    # サンプルデータ再生成（ロジック変更後は実行して data/ を更新）
npm run report       # CLIでレポート生成（--today で今日の市況を含める）
npm run today:check  # data/today-market.json の検証
```

変更後は `npm run build && npm test` が通ることを確認する。

## 構成の原則

- `src/lib/` は **UI と CLI の共通ロジック**。DOM・`import.meta.env`・Node API に依存させない（例外：`dataLoader.ts` と `localApi.ts` はブラウザ専用、`scripts/` は Node 専用）
- 画面（`src/pages`, `src/components`）に計算を書かない。`useAnalysis()` で受け取った結果を表示するだけにする
- スキーマは `src/types/dataset.ts`（スイング）と `src/types/today.ts`（Today）が正。両者は混ぜない。派生値は JSON に入れず `src/lib/metrics.ts` で計算する
- Today の判定は `src/lib/todayAnalysis.ts`、Markdown は `src/lib/todayReportGenerator.ts`、市況メモの抽出は `src/lib/marketMemo.ts`。画面に判定を書かない
- 貼り付けた市況メモなど外部由来の Markdown は `renderMarkdown()` を通す（生HTMLエスケープ・画像を読み込まない・安全なリンクのみ）
- 指標の追加は `src/lib/scoring.ts` の `FACTORS` に1エントリ。データ不足時は `null` を返す
- データ取得は `scripts/providers/` の Source を実装して差し込む。パイプライン（`scripts/lib/pipeline.ts`）は原則いじらない
- 日付は `'YYYY-MM-DD'` 文字列のまま `src/lib/calendar.ts` の関数で扱う（`new Date()` のローカルタイム計算を避ける）

## 守ること

- 外部通信なしで動く状態を保つ。APIキーや有料APIは使わない
- フロントは静的配信のみ（さくらのレンタルサーバー想定）。サーバー常駐・PHP を前提にしない。`base: './'` と HashRouter を維持
- 投資助言ではなく分析補助である旨の表示（フッター・レポート末尾の `DISCLAIMER`、SNS投稿の注意書き）を消さない
- `meta.isSample` が true のデータでは「サンプルデータ」表示を必ず出す
- 色：グリーン/レッド（`up` / `down` トークン）は上昇・下落・ポジティブ・ネガティブ専用。警告は `caution`、UI操作色は `accent`
- UI 文言は日本語。数値列は `.num`（等幅）

## よくある変更箇所

| やりたいこと | 場所 |
|---|---|
| スコアの重み・指標 | `src/lib/scoring.ts`（`DEFAULT_SCORING_CONFIG`, `FACTORS`） |
| 警告タグの閾値 | `src/lib/warnings.ts`（`WARNING_THRESHOLDS`） |
| 入り方（通常時・GU時・GD時）・損切り・利確のルール | `src/lib/tradePlan.ts`（GD時は `gapDownRuleFor`、利確は `takeProfitFor`。どちらも古いデータ・保有パターン切り替えのため `analysis.ts` が表示前に呼ぶ） |
| コメントの文体 | `src/lib/commentary.ts` |
| レポートの文体・セクション | `src/lib/reportGenerator.ts` |
| SNS投稿の文体・分割 | `src/lib/snsPostGenerator.ts` |
| Today の判定（寄り追い/押し目待ち/見送り） | `src/lib/todayAnalysis.ts`（`TODAY_THRESHOLDS`, `judgeWatchItem`） |
| 市況メモの抽出・要確認の語 | `src/lib/marketMemo.ts`（`REVIEW_PATTERN`）、本文 → Today は `src/lib/todayBuilder.ts` |
| 市況メモ末尾の「SwingScout用まとめ」の書式・外部指標の名前 | `src/lib/memoBrief.ts`（`QUOTE_SPECS`）。ChatGPT への指示文 `examples/chatgpt-prompt-addon.md` と対で直す |
| 休場日 | `src/lib/calendar.ts`（`JP_MARKET_HOLIDAYS`） |
| VI とサイズ目安 | `src/lib/market.ts` |
| 日々の運用ステップの判定（済み/未完了） | `src/lib/workflow.ts`（表示は `components/WorkflowSteps.tsx`） |
| ローカル補助API（Yahoo日足）との通信・起動確認 | `src/lib/localApi.ts`, `src/state/useLocalApi.ts` |
| 銘柄リスト（CSV）・お気に入り（`favorite` 列）の読み書き | `src/lib/universeCsv.ts`（状態は `src/state/DataContext.tsx` の `universeCsv` / `toggleFavorite`） |
| 全銘柄タブの状態（今週の候補／条件外／日足なし…）・並び・絞り込み | `src/lib/universeRows.ts`（表示は `components/UniverseTable.tsx`） |
| 日足のブラウザ保存（IndexedDB）・取得期間・小分け | `src/state/priceStore.ts`、`src/pages/DataUpdatePage.tsx`（`PRICE_YEARS`, `FETCH_CHUNK`） |
| 色・フォント | `src/index.css` |
