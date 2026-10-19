/**
 * Today（当日の寄り前・場中判断）用のデータスキーマ。
 *
 * スイング用の Dataset（src/types/dataset.ts）とは時間軸が違うため別ファイル・別型にしている。
 * data/today-market.json がこの `TodayMarket` 型に従う。毎朝1ファイルを上書きする運用を想定。
 * スキーマを壊す変更をしたら `TODAY_SCHEMA_VERSION` を上げ、src/lib/validate.ts を更新する。
 */
import type { DatasetMeta, Importance, ISODate, MarketEventCategory, Quote } from './dataset';

export const TODAY_SCHEMA_VERSION = 1;

/** 想定している値。運用で増やせるよう任意の文字列も受け付ける */
export type TodaySession = '寄り前' | '前場' | '昼休み' | '後場' | '引け後' | (string & {});

/** ロジックが意味を解釈するのは この4つ（それ以外は「様子見」扱いの表示になる） */
export type TodayStance = '買い目線' | '押し目待ち' | '様子見' | 'リスクオフ' | (string & {});

export interface TodayMarket {
  /** schemaVersion は TODAY_SCHEMA_VERSION */
  meta: DatasetMeta;
  /** 対象日（今日） */
  asOf: ISODate;
  session: TodaySession;
  stance: TodayStance;
  expectedOpen: ExpectedOpen;
  positionSize: PositionSize;
  /** 一言サマリー */
  headline: string;
  /** NYダウ・NASDAQ・S&P500・SOX・VIX・日経先物・ドル円・米10年債など（表示順はこの配列の順） */
  externalQuotes: Quote[];
  scenarios: OpenScenario[];
  events: TodayEvent[];
  /** 国内材料・ニュースメモ（手入力・ChatGPT等で作った市況メモを想定） */
  domesticNotes: string[];
  watchlistRules: WatchlistRules;
  /**
   * 市況メモ（Markdown、任意）。画面で貼り付けたメモ（ブラウザ保存）が無いときに使われる。
   * ChatGPT 等で作ったメモを JSON に同梱して配布したい場合に使う。
   */
  memoMarkdown?: string;

  // ---- 以下は市況メモ（主に末尾の「SwingScout用まとめ」）から取れたときだけ入る -----------------

  /** 情報を確認した時刻（'HH:MM'、日本時間） */
  checkedAt?: string;
  /** 今週（次の保有期間）にかけての地合いの見通し。スイング側の地合い「今週」に入る */
  weekOutlook?: string;
  /** 実際の寄り付き（寄った後に Today 画面で入力、または前場以降のメモから）。あれば想定寄りより優先して判定に使う */
  actualOpen?: ActualOpen;
  /** 今日の売買方針（本線・待機などの銘柄と、入る条件・撤回条件・損切り） */
  plan?: TodayPlan;
  /** セクターごとの扱い（優先・選別・慎重） */
  sectorStances?: SectorStance[];
  /** 日経平均の節目（高い順） */
  levels?: PriceLevel[];
  /** 米国の関連株（分野ごとの騰落） */
  relatedStocks?: RelatedStock[];
  /** 前夜のPTS */
  pts?: PtsQuote[];
  /** 個別材料（決算・修正など） */
  catalysts?: StockCatalyst[];
  /** 値上がり・値下がり銘柄数、売買代金など市場の広がり（1文） */
  breadth?: string;
  /** メモの中で確認できなかった項目 */
  unconfirmed?: string[];
}

export interface ActualOpen {
  /** 日経平均の前日終値比（%） */
  gapPct: number;
  /** 日経平均の始値（金額で入れた・メモにあったとき） */
  price?: number;
  /** ％の計算に使った前日終値 */
  basePrice?: number;
  /** input：画面で入力 / memo：市況メモのまとめ（「寄り付き」） */
  source: 'input' | 'memo';
  /** 入力・反映した日時（ISO） */
  at: string;
}

/** main：本線 / confirm：強さを確認したら候補 / wait：待機 / avoid：今日は触らない */
export type PickRole = 'main' | 'confirm' | 'wait' | 'avoid';

export interface MemoPick {
  name: string;
  /** 証券コード（'6857'、'285A' など） */
  code?: string;
  role: PickRole;
}

export interface TodayPlan {
  picks: MemoPick[];
  /** 入る条件 */
  entry?: string;
  /** 撤回条件（反証） */
  invalidation?: string;
  /** 損切りの決め方 */
  stopLoss?: string;
}

/** priority：優先監視 / select：選別 / caution：慎重 */
export type SectorStanceKind = 'priority' | 'select' | 'caution';

export interface SectorStance {
  sector: string;
  stance: SectorStanceKind;
  note?: string;
}

export interface PriceLevel {
  price: number;
  label: string;
}

export interface RelatedStock {
  /** 分野（'AI半導体'、'光通信' など） */
  group: string;
  name: string;
  changePct: number;
}

export interface PtsQuote {
  name: string;
  code?: string;
  price?: number;
  /** 東証終値比（%） */
  changePct?: number;
}

export interface StockCatalyst {
  name: string;
  code?: string;
  text: string;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface ExpectedOpen {
  /** 'ややGU' | '横ばい' | 'GD' など。未確認なら '未確認' */
  label: string;
  /** 想定ギャップ（%）。日経先物の前日比などから。未確認なら 0（使わない） */
  gapPct: number;
  note?: string;
  /**
   * 想定寄りを判断していない（市況メモのまとめに「想定寄り」が無い＝ChatGPT が判断を保留した）。
   * このときは先物と現物の差を予測に使わず、シナリオの強調や寄り追いの判定もしない。
   */
  unconfirmed?: boolean;
}

export interface PositionSize {
  /** '通常の70%' など */
  label: string;
  reason?: string;
}

export interface OpenScenario {
  /** 'large-gap-up' | 'flat-small-gap' | 'gap-down'（この3つは想定寄りとの照合に使う） */
  id: string;
  label: string;
  condition: string;
  action: string;
  risk?: string;
}

export interface TodayEvent {
  /** 対象日（asOf）以外の日のイベント（翌日早朝の米指標など）。無ければ当日 */
  date?: ISODate;
  /** 'HH:MM'（日本時間） */
  time?: string;
  label: string;
  importance: Importance;
  category?: MarketEventCategory;
  note?: string;
}

export interface WatchlistRules {
  /** 想定ギャップ（%）がこれを超えたら寄り追いしない */
  gapUpAllowedPct: number;
  /** リスクスコアがこれを超えたら見送り */
  avoidIfRiskScoreOver: number;
}
