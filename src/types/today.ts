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
}

export interface ExpectedOpen {
  /** 'ややGU' | '横ばい' | 'GD' など */
  label: string;
  /** 想定ギャップ（%）。日経先物の前日比などから */
  gapPct: number;
  note?: string;
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
