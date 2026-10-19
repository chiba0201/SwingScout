/**
 * データ取得の差し替えポイント。
 *
 * 1つの「Source」は1種類のデータだけを担当する。実データ化するときは
 * 該当する Source を実装して ProviderSet に差し込むだけでよい（パイプライン側は変更不要）。
 *
 *   universe     … JPX 上場銘柄一覧
 *   prices       … 日足 OHLCV（yfinance 相当）
 *   margin       … 銘柄別信用残（JPX 信用残PDF）
 *   earnings     … 決算予定日・進捗率（決算カレンダー / EDINET）
 *   disclosures  … 適時開示などの材料（TDnet）
 *   market       … 指数・VI・為替・イベントなどの地合い
 *   annotations  … 手書きの補足（テーマ・感応度・定性コメント・計画の上書き）
 */
import type { DailyBar } from '../../src/lib/indicators';
import type {
  CandidateComments,
  Catalyst,
  EarningsInfo,
  EntryPlan,
  ISODate,
  MarginSnapshot,
  MarketContext,
  Sensitivity,
  StopLoss,
  TakeProfit,
} from '../../src/types/dataset';

export interface UniverseEntry {
  code: string;
  name: string;
  market?: string;
  /** 東証33業種 */
  sector: string;
  theme?: string;
  /** お気に入り（銘柄リストの favorite 列）。足切りの対象外になる */
  favorite?: boolean;
}

export interface UniverseSource {
  readonly id: string;
  getUniverse(asOf: ISODate): Promise<UniverseEntry[]>;
}

export interface PriceSource {
  readonly id: string;
  /** asOf 以前の日足を古い順で返す。取得できない銘柄は null */
  getDailyBars(code: string, asOf: ISODate, lookbackDays: number): Promise<DailyBar[] | null>;
}

export interface MarginSource {
  readonly id: string;
  getMarginBalances(codes: string[], asOf: ISODate): Promise<Map<string, MarginSnapshot>>;
}

export interface EarningsSource {
  readonly id: string;
  getEarnings(codes: string[], asOf: ISODate): Promise<Map<string, EarningsInfo>>;
}

export interface DisclosureSource {
  readonly id: string;
  getCatalysts(codes: string[], from: ISODate, to: ISODate): Promise<Map<string, Catalyst[]>>;
}

export interface MarketSource {
  readonly id: string;
  getMarketContext(asOf: ISODate): Promise<MarketContext>;
}

/** 手書きの補足。指定した項目だけがルール生成の結果を上書きする */
export interface Annotation {
  theme?: string;
  sensitivity?: Sensitivity;
  /** ファンダ/イベントコメントの冒頭に入れる定性メモ */
  fundamentalNote?: string;
  comments?: Partial<CandidateComments>;
  pattern?: string;
  entryPlan?: EntryPlan;
  stopLoss?: StopLoss;
  takeProfit?: TakeProfit;
  skipConditions?: string[];
  flags?: string[];
}

export interface AnnotationSource {
  readonly id: string;
  getAnnotations(codes: string[]): Promise<Map<string, Annotation>>;
}

export interface ProviderSet {
  id: string;
  /** 生成したデータセットを「サンプル」として扱うか */
  isSample: boolean;
  universe: UniverseSource;
  prices: PriceSource;
  margin: MarginSource;
  earnings: EarningsSource;
  disclosures: DisclosureSource;
  market: MarketSource;
  annotations?: AnnotationSource;
}
