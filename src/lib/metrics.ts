/**
 * 候補データから派生指標を計算する。
 * スコアリング・警告判定・コメント生成・レポートはすべてここの値を参照し、同じ計算を重複させない。
 */
import type { Candidate, ISODate } from '../types/dataset';
import { businessDaysBetween, isWithinWindow, type HoldingWindow } from './calendar';

/** 決算日と保有期間の位置関係 */
export type EarningsTiming =
  | 'unknown'
  /** エントリー前に発表済み（またはエントリー当日の寄り前） */
  | 'before-entry'
  /** 保有期間中に発表（決算またぎ） */
  | 'in-window'
  /** エグジット当日に発表（引け後なら回避可） */
  | 'exit-day'
  /** エグジット後5営業日以内（決算前の先回り需要） */
  | 'after-window-near'
  | 'after-window';

export type MaAlignment = 'bullish' | 'bearish' | 'mixed';

export interface DerivedMetrics {
  /** 基準日出来高 / 20日平均 */
  volumeRatio20d: number | null;
  /** 5日平均 / 20日平均 */
  volumeRatio5d: number | null;
  /** 終値の5日線乖離（%） */
  maDeviation5: number | null;
  /** 終値の25日線乖離（%） */
  maDeviation25: number | null;
  /** 終値>5日線>25日線 なら bullish */
  maAlignment: MaAlignment;
  /** 終値が直近20日高値（基準日除く）を上回ったか */
  isNewHigh20d: boolean;
  /** 直近20日高値からの距離（%）。更新時は正 */
  distanceToHigh20dPct: number | null;
  isNewHigh52w: boolean | null;
  /** ATR / 終値（%） */
  atrPct: number | null;
  /** 信用倍率（買残 / 売残） */
  marginRatio: number | null;
  /** 買残の前週比（%） */
  buyChangePct: number | null;
  /** 売残の前週比（%） */
  sellChangePct: number | null;
  /** 買残が20日平均出来高の何日分か（取組の重さ） */
  marginDays: number | null;
  /** エントリー日から決算日までの営業日数 */
  daysToEarnings: number | null;
  earningsTiming: EarningsTiming;
}

const pct = (a: number, b: number) => (b === 0 ? null : (a / b - 1) * 100);
const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

export function classifyEarningsTiming(
  date: ISODate | null,
  timing: Candidate['earnings']['timing'],
  window: HoldingWindow,
): EarningsTiming {
  if (!date) return 'unknown';
  if (date === window.entryDate && timing === 'pre-market') return 'before-entry';
  if (date === window.exitDate) return 'exit-day';
  if (isWithinWindow(date, window)) return 'in-window';
  const fromExit = businessDaysBetween(window.exitDate, date);
  if (fromExit < 0) return 'before-entry';
  return fromExit <= 5 ? 'after-window-near' : 'after-window';
}

export function computeMetrics(c: Candidate, window: HoldingWindow): DerivedMetrics {
  const { price, volume, margin, technical, earnings } = c;
  const close = price.close;

  const above5 = close > technical.ma5;
  const above25 = close > technical.ma25;
  const maAlignment: MaAlignment =
    above5 && above25 && technical.ma5 > technical.ma25
      ? 'bullish'
      : !above5 && !above25 && technical.ma5 < technical.ma25
        ? 'bearish'
        : 'mixed';

  return {
    volumeRatio20d: ratio(volume.latest, volume.avg20d),
    volumeRatio5d: ratio(volume.avg5d, volume.avg20d),
    maDeviation5: pct(close, technical.ma5),
    maDeviation25: pct(close, technical.ma25),
    maAlignment,
    isNewHigh20d: close > price.high20d,
    distanceToHigh20dPct: pct(close, price.high20d),
    isNewHigh52w: price.high52w === undefined ? null : close >= price.high52w,
    atrPct: close === 0 ? null : (technical.atr14 / close) * 100,
    marginRatio: margin ? ratio(margin.buyBalance, margin.sellBalance) : null,
    buyChangePct: margin ? pct(margin.buyBalance, margin.buyBalancePrev) : null,
    sellChangePct: margin ? pct(margin.sellBalance, margin.sellBalancePrev) : null,
    marginDays: margin ? ratio(margin.buyBalance, volume.avg20d) : null,
    daysToEarnings: earnings.nextDate
      ? businessDaysBetween(window.entryDate, earnings.nextDate)
      : null,
    earningsTiming: classifyEarningsTiming(earnings.nextDate, earnings.timing, window),
  };
}
