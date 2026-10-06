# SwingScout

日本株の短期スイング候補（例：**火曜In・金曜Out**）を、無料データ中心でスクリーニングし、
「今週の作戦」形式の Markdown / HTML レポートを作るためのローカル分析ツールです。

- フロントエンドは **静的ファイルのみ**（Vite + React + TypeScript + Tailwind CSS）。PHP や Node サーバーの常駐は不要
- データ取得・重い計算は **ローカルの CLI** で行い、`data/*.json` を生成 → フロントが `fetch` で読む
- 現在は **モックデータ（架空銘柄）** で動作し、外部通信・APIキーは一切使いません

> ⚠ 本ツールは分析補助を目的としたもので、投資助言・売買推奨ではありません。
> 同梱のサンプルデータは銘柄・価格・需給・日程・コメントがすべて架空です。

---

## セットアップ

Node.js 20 以上（開発は Node 24 で確認）。

```bash
npm install
npm run dev        # 開発サーバー（http://localhost:5173 。使用中なら自動で別ポート）
npm run build      # 型チェック → dist/ に静的ファイルを出力
npm run preview    # dist/ をローカルで確認（http://localhost:4173）
npm test           # ロジックのユニットテスト（vitest）
```

データ・レポート用の CLI:

```bash
npm run data:mock                          # サンプルデータを data/mock-candidates.json に再生成
npm run prices:yahoo                       # raw-data/watchlist.csv の銘柄の日足CSVを取得（任意・非公式）
npm run data:watchlist                     # raw-data/watchlist.csv + prices/*.csv から実データ扱いのJSONを生成
npm run data:universe                      # raw-data/universe.csv の代表銘柄から上位候補を選定
npm run data:build -- --provider local     # raw-data/ のローカルファイルから data/<基準日>.json を生成
npm run report                             # 既定データセットから reports/<基準日>-<パターン>.md / .html / -sns.txt を生成
npm run report -- --detail compact --top 5 # 簡潔版・上位5銘柄
npm run report -- --today                  # data/today-market.json の「今日の市況」を冒頭に入れる
npm run today:check                        # data/today-market.json を検証し、監視銘柄の判定結果を表示
```

`npm run dev` 中に `data/*.json` を更新すると、ブラウザは自動でリロードされます。

---

## 画面

| 画面 | パス | 内容 |
|---|---|---|
| ダッシュボード | `#/` | 最上部に**今日の結論**の要約カード（Today へのリンク）。地合いサマリー（スタンス・今日/今週・VIに応じたサイズ目安）、指数・VI・為替・金利、**今週の作戦ボード**（IN→OUTの保有帯とイベント）、上位6銘柄、業種別騰落 |
| Today | `#/today` | **今日の寄り前・場中の判断用（朝の1分で読む順）**：① 今日の結論（一言・スタンス・想定寄り・サイズ目安・日経VI）→ ② 外部指標 → ③ 今日の監視銘柄（寄り追いOK／押し目待ち／見送り。理由・注意点は2行表示、ボタンで全文）→ ④ 寄り付きシナリオ → ⑤ 今日の重要イベント／国内材料 → ⑥ 市況メモ詳細（既定で閉じる。要確認・抽出結果・参照元・原文・貼り付け欄） |
| 候補一覧 | `#/candidates` | 上位6／全件のランキング。総合・需給・テクニカル・イベント・リスク、警告タグ（決算またぎ・急騰翌日・同一セクター偏り等）。**スコア配分をスライダーで調整** → その場で再ランキング（ブラウザに保存） |
| 銘柄詳細 | `#/candidates/:code` | 需給／テクニカル／ファンダ・イベントのコメント、入り方・損切り・利確・見送り条件、価格ラダー、指標ごとのスコア内訳 |
| レポート | `#/report` | **詳細レポート**：「今週の作戦（火曜In金曜out）」形式の Markdown（コピー / `.md` / `.html`）。「含めるセクション」で**今日の市況**を ON にすると冒頭に Today と市況メモの要点が入る<br>**SNS投稿**：上位銘柄を1位〜6位で短く紹介し、運用メモと注意書きを話し言葉でまとめたプレーンテキスト（1投稿 / X向けスレッド分割、X換算文字数つき、`.txt`）。どちらも手直し可 |

ヘッダーで **データセット**（manifest に登録された日付）と **保有パターン**（火曜In金曜out / 月曜In金曜out / 火曜In木曜out）を切り替えられます。
ルーティングは `HashRouter`（URL が `#/...`）なので、静的サーバーでも直リンク・リロードが効きます。

---

## ディレクトリ構成

```
SwingScout/
├─ data/                       # フロントが読む静的JSON（dist/data/ にそのままコピーされる）
│  ├─ manifest.json            #   データセット一覧と既定ファイル
│  ├─ mock-candidates.json     #   サンプル（架空銘柄）
│  └─ today-market.json        #   Today（今日の市況）。毎朝上書きする1ファイル
├─ raw-data/                   # 実データ用の生ファイル置き場（git・デプロイ対象外）
├─ reports/                    # npm run report の出力
├─ scripts/                    # ローカルCLI（tsx で実行）
│  ├─ build-data.ts            #   データセット生成
│  ├─ generate-report.ts       #   レポート生成
│  ├─ lib/
│  │  ├─ pipeline.ts           #   取得→指標→計画→コメント→スコア→Dataset
│  │  ├─ manifest.ts
│  │  └─ csv.ts
│  └─ providers/               #   ★データ取得の差し替えポイント
│     ├─ types.ts              #     Source インターフェース
│     ├─ index.ts              #     --provider ごとの組み立て
│     ├─ mock/                 #     モック（架空銘柄・合成チャート）
│     └─ sources/              #     JPX・yfinance相当CSV・EDINET・TDnet など
├─ src/
│  ├─ types/dataset.ts         # ★データスキーマ（Dataset / Candidate / MarketContext）
│  ├─ types/today.ts           # ★Today のスキーマ（TodayMarket）
│  ├─ lib/                     # UI と CLI で共有する純粋ロジック
│  │  ├─ scoring.ts            #   ★スコアリング（ファクター定義）
│  │  ├─ reportGenerator.ts    #   ★レポート生成（詳細Markdown）
│  │  ├─ snsPostGenerator.ts   #   SNS投稿モード（プレーンテキスト・スレッド分割）
│  │  ├─ todayAnalysis.ts      #   Today：想定シナリオ・イベント・監視銘柄の判定
│  │  ├─ todayReportGenerator.ts # Today：「今日の市況」Markdown
│  │  ├─ marketMemo.ts         #   市況メモ（貼り付け Markdown）の抽出
│  │  ├─ analysis.ts           #   metrics → scoring → warnings → カレンダーの統合
│  │  ├─ metrics.ts            #   派生指標（出来高倍率・乖離・信用倍率・決算までの日数…）
│  │  ├─ warnings.ts           #   警告タグの判定と閾値
│  │  ├─ tradePlan.ts          #   入り方・損切り・利確・見送り条件のルール
│  │  ├─ commentary.ts         #   需給/テク/ファンダのコメント文生成
│  │  ├─ indicators.ts         #   日足 → SMA / RSI / ATR / スナップショット
│  │  ├─ calendar.ts           #   営業日・休場日・SQ・保有ウィンドウ
│  │  ├─ market.ts             #   VI水準とサイズ目安など
│  │  ├─ markdown.ts           #   Markdown→HTML（生HTMLはエスケープ）
│  │  ├─ dataLoader.ts / validate.ts
│  │  └─ format.ts
│  ├─ state/DataContext.tsx    # 読み込み・重み・保有パターンの状態
│  ├─ components/              # Layout, WeekBoard, CandidateTable, Today*, charts, ui …
│  └─ pages/                   # Dashboard / Today / Candidates / CandidateDetail / Report
├─ tests/                      # vitest
└─ deploy/sakura/htaccess.example
```

---

## データの流れ

```
 ┌───────────────── ローカルPC ─────────────────┐            ┌── さくら（静的配信）──┐
 │ providers (mock / raw-data のCSV・PDF …)       │            │                        │
 │        │                                       │            │  index.html, assets/   │
 │        ▼                                       │  アップ    │  data/manifest.json    │
 │ scripts/build-data.ts ─ pipeline ─▶ data/*.json ├──────────▶│  data/<基準日>.json    │
 │                                   manifest.json │  ロード   │        │               │
 │ npm run build ─▶ dist/（data/ も同梱）           │            │        ▼ fetch         │
 └────────────────────────────────────────────────┘            │  ブラウザで再スコア     │
                                                               │  → 画面・レポート生成   │
                                                               └────────────────────────┘
```

- JSON の `scores` / `rank` は **生成時点のスナップショット**。ブラウザは `src/lib/analysis.ts` で毎回再計算するので、スコアロジックや重みを変えると即座に反映されます。
- 派生値（出来高倍率・信用倍率・決算までの日数など）は JSON に持たず `src/lib/metrics.ts` で計算します。

---

## データ構造

型の正は [`src/types/dataset.ts`](src/types/dataset.ts)。構造を変えたら `SCHEMA_VERSION` を上げてください。

```jsonc
{
  "meta": { "schemaVersion": 1, "generatedAt": "...", "source": "mock", "isSample": true },
  "asOf": "2026-10-05",                       // データ基準日（引け）
  "marketContext": {
    "stance": "neutral", "headline": "...", "summaryToday": "...", "summaryWeek": "...",
    "indices": [{ "id": "nikkei225", "label": "日経平均", "value": 48320.55, "change": 562.3, "changePct": 1.18 }],
    "volatility": [{ "id": "nikkeiVI", ... , "polarity": "up-bad" }],
    "fx": [{ "id": "usdjpy", ..., "weekChangePct": 1.15 }],
    "rates": [...], "events": [{ "date": "...", "time": "03:00", "label": "米FOMC議事録", "category": "central-bank", "importance": "high" }],
    "sectors": [{ "sector": "電気機器", "changePct": 2.1 }], "riskNotes": ["..."]
  },
  "candidates": [{
    "rank": 1, "code": "S101", "name": "北辰エレクトロン", "sector": "電気機器", "theme": "半導体",
    "scores":   { "total": 68, "supplyDemand": 78.4, "technical": 91.3, "event": 63.3, "risk": 34.5 },
    "price":    { "close": 2480, "prevClose": 2403, "changePct": 3.2, "high20d": 2423, "low20d": 2285, "history": [...] },
    "volume":   { "latest": 4971400, "avg5d": ..., "avg20d": ..., "turnoverOku": 123.3 },
    "margin":   { "asOf": "2026-09-25", "buyBalance": 1200000, "sellBalance": 750000, "buyBalancePrev": ..., "sellBalancePrev": ... },
    "earnings": { "nextDate": "2026-10-30", "timing": "after-close", "progressRate": 54 },
    "technical":{ "ma5": 2377.2, "ma25": 2371.3, "rsi14": 62.6, "atr14": 57.6, "pattern": "高値ブレイク" },
    "sensitivity": { "usdJpy": 0.5, "beta": 1.5 },
    "catalysts": [{ "label": "受注残高が過去最高", "impact": "positive" }],
    "comments": { "supplyDemand": "...", "technical": "...", "fundamental": "..." },
    "entryPlan":  { "method": "...", "zoneLow": 2451, "zoneHigh": 2480, "gapUpRule": "..." },
    "stopLoss":   { "price": 2405, "rule": "..." },
    "takeProfit": { "targets": [{ "price": 2567, "label": "半分利確" }], "rule": "..." },
    "risks":      { "flags": [], "skipConditions": ["..."] }
  }]
}
```

`data/manifest.json` は静的サーバーでファイル一覧を取れないための目録です（CLI が自動更新）。

---

## スコアリング（`src/lib/scoring.ts`）

```
総合 = （需給×35 ＋ テクニカル×35 ＋ イベント×30）÷ 100 − リスク × 0.3     （0〜100）
```

- 各カテゴリは「ファクター（指標）」の加重平均。リスクだけは単発の大きなリスクが薄まらないよう **最大値と加重平均の半々**。
- データが無いファクターは `null` を返し、平均から除外されます。
- 順位は2パス：仮順位で「自分より上位にいる同セクター/同テーマ数」を数え、集中リスクを入れて再スコア。

| カテゴリ | ファクター |
|---|---|
| 需給 | 出来高増加（20日平均比）、出来高トレンド（5日/20日）、信用倍率、買残/売残変化、取組の重さ |
| テクニカル | 5日/25日移動平均、高値更新（20日/52週）、RSI |
| イベント | 決算日までの日数、業績モメンタム、材料、為替感応度 |
| リスク | 決算またぎ、急騰翌日、25日線乖離、セクター/テーマ集中、日経VI×β、流動性、値幅（ATR） |

**指標の追加**は `FACTORS` に1エントリ足すだけです。

```ts
{
  id: 'gapUpStreak',
  label: '連続GU',
  category: 'risk',
  weight: 1,
  description: '直近3日のギャップアップ回数',
  evaluate: ({ candidate, metrics, ctx }) => {
    // 必要なら metrics.ts に派生値を追加して使う。データが無ければ null
    return { score: 0, value: '0回' };
  },
},
```

警告タグの閾値は `src/lib/warnings.ts` の `WARNING_THRESHOLDS`、VI とサイズ目安は `src/lib/market.ts` にまとめています。

---

## レポート生成（`src/lib/reportGenerator.ts`）

`generateWeeklyReport(analysis, options)` が Markdown を返します。UI（レポート画面）と CLI（`npm run report`）は同じ関数を使います。

- セクション：ヘッダー（想定期間・基準日・サンプル表示）／地合い／今週のイベント／上位N銘柄／運用上の注意（相関リスク・GU時の入り方・SQ・決算・米指標・連休・ポジション管理）／一覧表／免責
- 各セクションは `renderMarket()` などの関数に分かれているので、文体の調整・追加はその関数だけ触れば済みます
- 銘柄ごとの文章（需給・テクニカル等のコメント、入り方・損切り・利確）はデータ生成時に `src/lib/commentary.ts` と `src/lib/tradePlan.ts` で作られ、手書きの `Annotation` があればそちらが優先されます

### SNS投稿モード（`src/lib/snsPostGenerator.ts`）

`generateSnsPost(analysis, options)` がプレーンテキストを返します（Markdown 記法は使わない）。

- 構成：見出し（サンプル時は架空である旨）→ 地合いとサイズ感 → 1位〜N位（セットアップ＋需給/材料の一言、入り方、任意で損切り・利確、警告）→ 運用メモ（相関・決算・急騰翌日・GU・米指標・SQ・連休を話し言葉で）→ 柔らかい注意書き → ハッシュタグ
- `layout: 'thread'` では各投稿を X の上限（重み付き280）に収まるよう分割し、`(1/12)` の通し番号を付けます。テキストエリアでは `-----` の行が投稿の区切りです
- 同じ言い回しが続かないよう、言い回しの候補を順に使い回します（`Variety`）。文体を手元の投稿に合わせるときは `ACTION` や各 `*Phrase` 関数・`operationSentences` を書き換えてください

---

## Today（今日の市況）

スイング（火曜In金曜Out）とは時間軸が違う、**当日の寄り前・場中の判断**のための機能です。
スイング用の `Dataset` には混ぜず、別ファイル・別型（`src/types/today.ts` の `TodayMarket`）にしています。

```
data/today-market.json ─┐
市況メモ（貼り付け）     ├─▶ src/lib/todayAnalysis.ts ─▶ Today 画面 / ダッシュボード要約 / レポート「今日の市況」
スイング分析の上位候補 ──┘        （判定）                    （todayReportGenerator.ts で Markdown 化）
```

### data/today-market.json の運用方針

- **毎朝1ファイルを上書き**する運用（過去分は残さない。残したい場合は日付付きでコピーして手元で保管）
- 寄り前（8時台）に作成 → `npm run today:check` で検証 → `data/today-market.json` だけをアップロード
- 作り方は手入力、または ChatGPT 等で作った内容を下記の形式に整える（アプリ自体は外部通信・AI API を使わない）
- `meta.isSample: true` の間は画面・レポートに「サンプルデータ」と表示される。実運用では `false` にする
- 読み込めない・壊れている場合も、ダッシュボード・候補一覧・レポートは通常どおり動き、Today 画面にエラー内容が出る
- 日付（`asOf`）がスイング側の基準日以前だと「更新されているか確認」の注意が出る

主な項目（詳細は `src/types/today.ts`）:

| 項目 | 内容 |
|---|---|
| `asOf` / `session` | 対象日と、寄り前・前場・昼休み・後場・引け後 |
| `stance` | 買い目線 / 押し目待ち / 様子見 / リスクオフ（監視銘柄の判定に使う） |
| `expectedOpen` | 想定寄り（ラベル・想定ギャップ%・メモ）。ギャップから「想定に近いシナリオ」を強調 |
| `positionSize` | サイズ目安（ラベル・理由） |
| `headline` | 一言サマリー |
| `externalQuotes` | NYダウ・NASDAQ・S&P500・SOX・VIX・日経先物・ドル円・米10年債など（配列の順に表示。`nikkeiVI` を入れると判定に使う。無ければスイング側の前日終値） |
| `scenarios` | 寄り付きシナリオ。`large-gap-up` / `flat-small-gap` / `gap-down` の id は想定寄りとの照合に使う |
| `events` / `domesticNotes` | 今日のイベント（時刻・重要度・メモ）と国内材料メモ。SQ日・休場・監視銘柄の決算は自動で追加 |
| `watchlistRules` | `gapUpAllowedPct`（想定GUがこれを超えたら寄り追いしない）、`avoidIfRiskScoreOver`（リスクスコアがこれ超で見送り） |
| `memoMarkdown`（任意） | 市況メモの Markdown。画面で貼り付けたメモが無いときに使われる |

### 今日の監視銘柄の判定（`todayAnalysis.ts` の `judgeWatchItem`）

スイングの上位候補それぞれについて、次の順で簡易判定します（閾値は `TODAY_THRESHOLDS` と `watchlistRules`）。

1. **見送り**：スタンスがリスクオフ／リスクスコアが基準超／本日決算
2. **押し目待ち**：急騰翌日／想定GUが許容超／GD想定／日経VIが22以上／スタンスが買い目線以外／押し目型のセットアップ
3. **寄り追いOK**：上記に当たらないもの

注意点には警告タグ、翌営業日の決算、銘柄ごとの「寄りで+◯%超なら追わない」（ATR から算出）が入ります。

### 市況メモ（ChatGPT 等の Markdown を貼り付け）

- Today 画面下部の「市況メモ詳細」（既定で閉じる。要確認の件数は閉じたままでも見出し行に出る）→「市況メモを貼り付け」にそのまま貼ると、**ブラウザ（localStorage）に自動保存**し、次を抽出して表示します（`src/lib/marketMemo.ts`、正規表現のみ）
  - 結論：冒頭の太字文（`**結論**：〜` のようなラベル付きならラベルの後ろ）、無ければ最初の本文
  - 見出しごとの要点：`##` / `###` / `####` ごとに、箇条書きの先頭3つ、または最初の2文
  - 表：Markdown テーブル　・参照元：Markdown リンクと裸の URL
  - 要確認：「未確認」「要確認」「確認が必要」「取得できない」「不明」などがあれば警告（該当行も表示）
- 抽出できなくても**原文はそのまま**「原文を表示」で確認できます（生HTMLはエスケープ、画像は読み込まない、リンクは http(s) のみ）
- 貼り付けメモは**そのブラウザだけ**に保存されます。他の端末やさくらの閲覧者にも見せたい場合は `today-market.json` の `memoMarkdown` に入れてください
- レポートの「今日の市況」には、抽出した要点（要確認・見出し要約・表・参照元）が入り、見出しも表も無いメモは原文冒頭を要約として載せます

## データ取得の拡張ポイント

`scripts/providers/types.ts` の Source を実装し、`scripts/providers/index.ts` で組み合わせます。パイプライン側の変更は不要です。

| 役割 | インターフェース | 実装状況 | 想定データ源 |
|---|---|---|---|
| 銘柄一覧 | `UniverseSource` | `WatchlistCsvSource` ✅ / `JpxListingCsvSource` ✅ | まずは `raw-data/watchlist.csv`、広げる場合はJPX「東証上場銘柄一覧」（xls → CSV 変換して `raw-data/jpx/listing.csv`） |
| 日足 | `PriceSource` | `CsvPriceSource` ✅ | yfinance 相当の CSV（`raw-data/prices/<code>.csv`、列 `Date,Open,High,Low,Close,Volume`） |
| 信用残 | `MarginSource` | `JpxMarginPdfSource` 🚧 スタブ | JPX「銘柄別信用取引週末残高」PDF（毎週火曜公表）→ pdfjs-dist 等で抽出 |
| 決算予定 | `EarningsSource` | `CsvEarningsSource` ✅ / `EdinetFundamentalsSource` 🚧 | 決算発表予定日 CSV（`raw-data/earnings.csv`）、進捗率は EDINET の XBRL 等 |
| 材料 | `DisclosureSource` | `TdnetDisclosureSource` 🚧 | TDnet 適時開示のタイトル分類（上方修正・自社株買い → positive 等） |
| 地合い | `MarketSource` | `JsonMarketSource` ✅ | 手書き `raw-data/market.json`（将来は指数・為替を自動取得、コメントだけ手書き） |
| 手書き補足 | `AnnotationSource` | `WatchlistCsvSource` ✅ | テーマ・為替感応度・定性メモ・警告・見送り条件（`raw-data/watchlist.csv`） |

### 最初の実データ化（代表銘柄ユニバース運用）

このツールの本筋は、**いろいろな代表銘柄の母集団からスイングに向いた上位候補を選定する**ことです。
JPX全銘柄一覧や信用残PDFを整える前に、まず `raw-data/universe.csv` に代表銘柄を並べて、その中から上位6銘柄を選ぶ運用で始められます。

1. ひな形をコピー:
   ```bash
   mkdir -p raw-data/prices
   cp examples/real-data/universe.csv raw-data/universe.csv
   cp examples/real-data/earnings.csv raw-data/earnings.csv
   cp examples/real-data/market.json raw-data/market.json
   ```
2. `raw-data/universe.csv` を選定母集団にしたい銘柄に編集します。
   - 必須: `code,name,sector`
   - 任意: `market,theme,usdJpy,beta,fundamentalNote,flags,skipConditions,pattern`
   - `skipConditions` や `flags` は `|` 区切りで複数指定できます。
3. 日足CSVを用意します。
   - 手元で作ったCSVを `raw-data/prices/<code>.csv` に置く
   - もしくは任意補助CLIで取得:
     ```bash
     npm run prices:yahoo -- --watchlist raw-data/universe.csv --years 2
     ```
     このCLIはYahoo Financeの非公式chartエンドポイントを使います。取得に失敗する場合や規約上避けたい場合は、手動でCSVを置いてください。
4. `raw-data/market.json` をその日の地合いに合わせて更新します。ひな形のままだと指数・為替が0のため、実運用前に必ず一次情報で埋めてください。
5. 実データ扱いのDatasetを生成:
   ```bash
   npm run data:universe -- --as-of 2026-10-06 --label "10/6(火) 代表銘柄スクリーニング"
   ```

生成に成功すると `data/2026-10-06.json` と `data/manifest.json` が更新され、ヘッダーのデータセット選択から実データを選べます。`meta.isSample` は `false` になるため、画面のSAMPLE表示は消えます。

### お気に入り銘柄だけを見る（ウォッチリスト運用）

注目している銘柄だけを別枠で見たい場合は、`raw-data/watchlist.csv` を使います。選定母集団を広げる `universe` とは別物です。

```bash
cp examples/real-data/watchlist.csv raw-data/watchlist.csv
npm run prices:yahoo -- --watchlist raw-data/watchlist.csv --years 2
npm run data:watchlist -- --as-of 2026-10-06 --label "10/6(火) お気に入り監視"
```

`--provider local` は上記のローカルファイル版を組み合わせた構成です（外部通信なし）。最低限 `listing.csv`・`prices/*.csv`・`market.json` を置けば動き、未実装の信用残・材料は空として続行します。

yfinance で日足CSVを作る例（Python・ローカル実行）:

```python
import yfinance as yf
yf.download("7203.T", period="2y", auto_adjust=False).droplevel(1, axis=1).to_csv("raw-data/prices/7203.csv")
```

新しい取得経路を足す手順:

1. `scripts/providers/sources/xxx.ts` に Source を実装（失敗時は空の Map を返して続行するのが基本）
2. `scripts/providers/index.ts` に `--provider` の組み合わせを追加
3. 足切り条件（売買代金・株価）は `scripts/lib/pipeline.ts` の `DEFAULT_PIPELINE_OPTIONS`
4. 新しいフィールドが必要なら `src/types/dataset.ts` → `metrics.ts` → `scoring.ts` の順に追加

---

## さくらのレンタルサーバーへの配置

`npm run build` で `dist/` に静的ファイル一式ができます。**PHP・Node の常駐は不要**です。

```
dist/
├─ index.html
├─ favicon.svg
├─ assets/          # JS / CSS / フォント（ファイル名にハッシュ付き）
└─ data/            # data/*.json のコピー（manifest.json と各データセット）
```

### 初回

1. `npm run build`
2. `dist/` の **中身** を公開ディレクトリへアップロード（例：`/home/<アカウント>/www/swingscout/`）
   - FTP / SFTP クライアント、または `rsync`：
     ```bash
     rsync -avz --delete dist/ <アカウント>@<アカウント>.sakura.ne.jp:~/www/swingscout/
     ```
3. `https://<ドメイン>/swingscout/` で表示
   - 出力は相対パス（`base: './'`）なので、ドメイン直下でもサブディレクトリでもそのまま動きます
   - URL は `#/candidates` 形式のため、`.htaccess` のリライト設定は不要です

### 日々のデータ更新

```bash
npm run data:build -- --provider local       # data/<基準日>.json と manifest.json を更新
rsync -avz data/ <アカウント>@<アカウント>.sakura.ne.jp:~/www/swingscout/data/
```

- アプリ本体を変えていなければ **`data/` だけのアップロードで反映**されます（フロントは `cache: 'no-cache'` で取得）
- Today は毎朝 `data/today-market.json` だけ差し替え：
  ```bash
  npm run today:check
  scp data/today-market.json <アカウント>@<アカウント>.sakura.ne.jp:~/www/swingscout/data/
  ```
- アプリを変更したときは `npm run build` して `dist/` ごとアップロード

### 推奨設定

- 個人用の分析ツールなので、さくらのコントロールパネルの「アクセス制限」や `.htaccess` の Basic 認証で公開範囲を絞ってください（`index.html` には `noindex` を設定済み）
- キャッシュ・MIME タイプの設定例：[`deploy/sakura/htaccess.example`](deploy/sakura/htaccess.example)
- `dist/index.html` をファイルとして直接開くと JSON を読めません。`npm run preview` かWebサーバー経由で開いてください

---

## デザインのルール

- 色はトークン（`src/index.css` の `:root`）で管理し、ダークモードは OS 設定に追従
- **グリーン／レッドは上昇・下落／ポジティブ・ネガティブ専用**。警告は山吹色（caution）、操作色・スコアは藍（accent）
  - 和式（上昇＝赤）にしたい場合は `--c-up` と `--c-down` を入れ替えるだけ
- 数値列は等幅（IBM Plex Mono を同梱。外部フォントの読み込みなし）

---

## 今後の TODO（例）

- [ ] JPX 信用残 PDF パーサー（`scripts/providers/sources/jpxMargin.ts`）
- [ ] TDnet 開示タイトルの分類ルール（`sources/tdnet.ts`）
- [ ] 指数・為替・VI を価格ソースから自動取得し、地合いコメントだけ手書きにする
- [ ] TOPIX500 構成銘柄の細かい呼値（`tradePlan.ts` の `tickSize`）
- [ ] 休場日カレンダーを JPX の公表データから更新（`calendar.ts`）
- [ ] 過去のレポートと実際の値動きを突き合わせる検証画面
- [ ] Today：指数・先物・為替を価格ソースから自動で埋め、スタンスと一言だけ手入力にする
- [ ] Today：場中（前場・後場）用の更新と、監視銘柄の VWAP・出来高の取り込み
