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
npm run data:build -- --provider local     # raw-data/ のローカルファイルから data/<基準日>.json を生成
npm run report                             # 既定データセットから reports/<基準日>-<パターン>.md / .html を生成
npm run report -- --detail compact --top 5 # 簡潔版・上位5銘柄
```

`npm run dev` 中に `data/*.json` を更新すると、ブラウザは自動でリロードされます。

---

## 画面

| 画面 | パス | 内容 |
|---|---|---|
| ダッシュボード | `#/` | 地合いサマリー（スタンス・今日/今週・VIに応じたサイズ目安）、指数・VI・為替・金利、**今週の作戦ボード**（IN→OUTの保有帯とイベント）、上位6銘柄、業種別騰落 |
| 候補一覧 | `#/candidates` | 上位6／全件のランキング。総合・需給・テクニカル・イベント・リスク、警告タグ（決算またぎ・急騰翌日・同一セクター偏り等）。**スコア配分をスライダーで調整** → その場で再ランキング（ブラウザに保存） |
| 銘柄詳細 | `#/candidates/:code` | 需給／テクニカル／ファンダ・イベントのコメント、入り方・損切り・利確・見送り条件、価格ラダー、指標ごとのスコア内訳 |
| レポート | `#/report` | 「今週の作戦（火曜In金曜out）」形式の Markdown を生成。テキストエリアで手直し → コピー / `.md` / `.html` 保存、プレビュー |

ヘッダーで **データセット**（manifest に登録された日付）と **保有パターン**（火曜In金曜out / 月曜In金曜out / 火曜In木曜out）を切り替えられます。
ルーティングは `HashRouter`（URL が `#/...`）なので、静的サーバーでも直リンク・リロードが効きます。

---

## ディレクトリ構成

```
SwingScout/
├─ data/                       # フロントが読む静的JSON（dist/data/ にそのままコピーされる）
│  ├─ manifest.json            #   データセット一覧と既定ファイル
│  └─ mock-candidates.json     #   サンプル（架空銘柄）
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
│  ├─ lib/                     # UI と CLI で共有する純粋ロジック
│  │  ├─ scoring.ts            #   ★スコアリング（ファクター定義）
│  │  ├─ reportGenerator.ts    #   ★レポート生成
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
│  ├─ components/              # Layout, WeekBoard, CandidateTable, charts, ui …
│  └─ pages/                   # Dashboard / Candidates / CandidateDetail / Report
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

---

## データ取得の拡張ポイント

`scripts/providers/types.ts` の Source を実装し、`scripts/providers/index.ts` で組み合わせます。パイプライン側の変更は不要です。

| 役割 | インターフェース | 実装状況 | 想定データ源 |
|---|---|---|---|
| 銘柄一覧 | `UniverseSource` | `JpxListingCsvSource` ✅ | JPX「東証上場銘柄一覧」（xls → CSV 変換して `raw-data/jpx/listing.csv`） |
| 日足 | `PriceSource` | `CsvPriceSource` ✅ | yfinance 相当の CSV（`raw-data/prices/<code>.csv`、列 `Date,Open,High,Low,Close,Volume`） |
| 信用残 | `MarginSource` | `JpxMarginPdfSource` 🚧 スタブ | JPX「銘柄別信用取引週末残高」PDF（毎週火曜公表）→ pdfjs-dist 等で抽出 |
| 決算予定 | `EarningsSource` | `CsvEarningsSource` ✅ / `EdinetFundamentalsSource` 🚧 | 決算発表予定日 CSV（`raw-data/earnings.csv`）、進捗率は EDINET の XBRL 等 |
| 材料 | `DisclosureSource` | `TdnetDisclosureSource` 🚧 | TDnet 適時開示のタイトル分類（上方修正・自社株買い → positive 等） |
| 地合い | `MarketSource` | `JsonMarketSource` ✅ | 手書き `raw-data/market.json`（将来は指数・為替を自動取得、コメントだけ手書き） |
| 手書き補足 | `AnnotationSource` | （モックのみ） | テーマ・為替感応度・定性メモ・計画の上書き（スプレッドシート/CSV 等） |

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
