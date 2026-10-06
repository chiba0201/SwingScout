/**
 * SwingScout のデータスキーマ。
 *
 * - data/*.json はこの `Dataset` 型に従う（ローカルCLIが生成し、フロントが fetch で読む）
 * - スキーマを壊す変更をしたら `SCHEMA_VERSION` を上げ、src/lib/dataLoader.ts の検証を更新する
 * - 派生値（出来高倍率・信用倍率など）は JSON に持たず src/lib/metrics.ts で計算する
 */

export const SCHEMA_VERSION = 1;

/** 'YYYY-MM-DD'（日本の取引日） */
export type ISODate = string;

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

export interface Dataset {
  meta: DatasetMeta;
  /** データ基準日（通常は前営業日の引け） */
  asOf: ISODate;
  marketContext: MarketContext;
  /** スクリーニング通過銘柄（スコア順）。UI では上位N件を「今週の候補」として扱う */
  candidates: Candidate[];
}

export interface DatasetMeta {
  schemaVersion: number;
  /** 生成日時（ISO 8601） */
  generatedAt: string;
  /** 生成に使ったプロバイダ名（'mock' など） */
  source: string;
  /** true の場合、UIとレポートに「サンプルデータ」表示を出す */
  isSample: boolean;
  notes?: string[];
}

/** data/manifest.json：静的サーバーではディレクトリ一覧が取れないため、ファイル一覧を明示する */
export interface DataManifest {
  /** 既定で開くデータセットのファイル名（data/ からの相対） */
  default: string;
  datasets: DataManifestEntry[];
}

export interface DataManifestEntry {
  file: string;
  asOf: ISODate;
  label: string;
  isSample: boolean;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Market context
// ---------------------------------------------------------------------------

export type MarketStance = 'bullish' | 'neutral' | 'bearish';

/**
 * 値の上昇が良いか悪いか。色分けに使う。
 * - up-good: 指数など（上昇=グリーン）
 * - up-bad:  日経VIなど（上昇=レッド）
 * - neutral: 為替・金利など（方向だけ示し、色は付けない）
 */
export type QuotePolarity = 'up-good' | 'up-bad' | 'neutral';

export interface Quote {
  /** 'nikkei225' | 'topix' | 'nikkeiVI' | 'usdjpy' など。スコアリングから id で参照する */
  id: string;
  label: string;
  value: number;
  change: number;
  changePct: number;
  /** 週間騰落率（任意） */
  weekChangePct?: number;
  unit?: string;
  decimals?: number;
  polarity?: QuotePolarity;
}

export type MarketEventCategory =
  | 'sq'
  | 'us-macro'
  | 'jp-macro'
  | 'central-bank'
  | 'earnings'
  | 'holiday'
  | 'other';

export type Importance = 'high' | 'medium' | 'low';

export interface MarketEvent {
  date: ISODate;
  /** 日本時間 'HH:MM'（任意） */
  time?: string;
  label: string;
  category: MarketEventCategory;
  importance: Importance;
  note?: string;
}

export interface SectorMove {
  sector: string;
  /** 基準日の騰落率 */
  changePct: number;
  weekChangePct?: number;
}

export interface MarketContext {
  stance: MarketStance;
  /** 一言まとめ */
  headline: string;
  /** 今日（基準日）の地合い */
  summaryToday: string;
  /** 今週の見通し */
  summaryWeek: string;
  indices: Quote[];
  volatility: Quote[];
  fx: Quote[];
  rates: Quote[];
  events: MarketEvent[];
  sectors: SectorMove[];
  /** 地合い面の注意点 */
  riskNotes: string[];
}

// ---------------------------------------------------------------------------
// Candidate
// ---------------------------------------------------------------------------

export interface Candidate {
  rank: number;
  code: string;
  name: string;
  /** プライム / スタンダード / グロース */
  market?: string;
  /** 東証33業種 */
  sector: string;
  /** 相関リスク判定に使うテーマ（例: 半導体、防衛、インバウンド） */
  theme: string;
  scores: ScoreSummary;
  price: PriceSnapshot;
  volume: VolumeSnapshot;
  /** 信用残が取れない場合は null */
  margin: MarginSnapshot | null;
  earnings: EarningsInfo;
  technical: TechnicalSnapshot;
  sensitivity?: Sensitivity;
  catalysts?: Catalyst[];
  comments: CandidateComments;
  entryPlan: EntryPlan;
  stopLoss: StopLoss;
  takeProfit: TakeProfit;
  risks: CandidateRisks;
}

export type ScoreCategory = 'supplyDemand' | 'technical' | 'event' | 'risk';

export interface ScoreSummary {
  /** 総合（0-100） */
  total: number;
  /** 需給（0-100、高いほど良い） */
  supplyDemand: number;
  /** テクニカル（0-100、高いほど良い） */
  technical: number;
  /** イベント・材料（0-100、高いほど良い） */
  event: number;
  /** リスク（0-100、高いほど危険） */
  risk: number;
  /** 指標ごとの内訳。src/lib/scoring.ts が付与する */
  factors?: FactorScore[];
}

export interface FactorScore {
  id: string;
  label: string;
  category: ScoreCategory;
  /** 0-100。データ不足で評価できない場合は null */
  score: number | null;
  weight: number;
  /** 表示用の生値（例: '2.3倍'） */
  value?: string;
  note?: string;
}

export interface PriceSnapshot {
  close: number;
  prevClose: number;
  change: number;
  changePct: number;
  open?: number;
  high?: number;
  low?: number;
  /** 基準日を除く直近20営業日の高値 */
  high20d: number;
  /** 基準日を除く直近20営業日の安値 */
  low20d: number;
  /** 52週高値（基準日を含む） */
  high52w?: number;
  /** 直近の終値（古い→新しい）。スパークライン用 */
  history?: number[];
}

export interface VolumeSnapshot {
  /** 基準日の出来高（株） */
  latest: number;
  avg5d: number;
  avg20d: number;
  /** 基準日の売買代金（億円） */
  turnoverOku: number;
}

export interface MarginSnapshot {
  /** 信用残の基準日（週末残高の日付） */
  asOf: ISODate;
  /** 信用買残（株） */
  buyBalance: number;
  /** 信用売残（株） */
  sellBalance: number;
  buyBalancePrev: number;
  sellBalancePrev: number;
}

export type EarningsTimingOfDay = 'pre-market' | 'intraday' | 'after-close' | 'unknown';

export interface EarningsInfo {
  /** 次回決算発表予定日。不明なら null */
  nextDate: ISODate | null;
  timing?: EarningsTimingOfDay;
  /** 例: '2027年3月期 2Q' */
  period?: string;
  lastSurprise?: 'beat' | 'inline' | 'miss' | null;
  /** 通期会社計画に対する営業利益の進捗率（%） */
  progressRate?: number;
}

export interface TechnicalSnapshot {
  ma5: number;
  ma25: number;
  ma75?: number;
  rsi14?: number;
  atr14: number;
  /** 'ブレイクアウト' | '押し目' など、パターン判定の結果（任意） */
  pattern?: string;
}

export interface Sensitivity {
  /** 円安で追い風なら正、円高で追い風なら負（-1〜1） */
  usdJpy?: number;
  /** 日経平均に対するβ */
  beta?: number;
}

export interface Catalyst {
  date?: ISODate;
  label: string;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface CandidateComments {
  supplyDemand: string;
  technical: string;
  /** ファンダ / イベント */
  fundamental: string;
}

export interface EntryPlan {
  method: string;
  zoneLow?: number;
  zoneHigh?: number;
  /** ギャップアップ時の対応 */
  gapUpRule?: string;
}

export interface StopLoss {
  price: number;
  rule: string;
}

export interface TakeProfitTarget {
  price: number;
  label: string;
}

export interface TakeProfit {
  targets: TakeProfitTarget[];
  rule: string;
}

export interface CandidateRisks {
  /** 手動で付ける警告ラベル（自動判定の警告タグに追加表示される） */
  flags: string[];
  /** 見送り条件 */
  skipConditions: string[];
  notes?: string[];
}
