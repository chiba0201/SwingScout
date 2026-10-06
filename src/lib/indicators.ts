/**
 * 日足（OHLCV）からテクニカル指標とスナップショットを計算する。
 * 価格ソース（yfinance相当のCSVなど）を差し替えても、ここを通せば Candidate の
 * price / volume / technical が同じ定義で埋まる。
 */
import type {
  ISODate,
  PriceSnapshot,
  TechnicalSnapshot,
  VolumeSnapshot,
} from '../types/dataset';

export interface DailyBar {
  date: ISODate;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const round = (x: number, digits = 2) => Math.round(x * 10 ** digits) / 10 ** digits;

/** 末尾 period 本の単純移動平均 */
export function sma(values: readonly number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

/** RSI（Wilder の平滑化） */
export function rsi(closes: readonly number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    gain = (gain * (period - 1) + Math.max(diff, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

/** ATR（Wilder の平滑化） */
export function atr(bars: readonly DailyBar[], period = 14): number | null {
  if (bars.length <= period) return null;
  const trs = bars.slice(1).map((b, i) => {
    const prevClose = bars[i]!.close;
    return Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
  });
  let value = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) value = (value * (period - 1) + trs[i]!) / period;
  return value;
}

export interface MarketSnapshots {
  price: PriceSnapshot;
  volume: VolumeSnapshot;
  technical: TechnicalSnapshot;
}

/**
 * 日足から Candidate 用のスナップショットを作る。最後の足を基準日とみなす。
 * @param historyLength price.history に残す終値の本数（スパークライン用）
 */
export function buildSnapshots(bars: readonly DailyBar[], historyLength = 60): MarketSnapshots {
  if (bars.length < 27) throw new Error(`日足が不足しています（${bars.length}本、最低27本必要）`);
  const last = bars[bars.length - 1]!;
  const prev = bars[bars.length - 2]!;
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const prior20 = bars.slice(-21, -1);

  const price: PriceSnapshot = {
    close: last.close,
    prevClose: prev.close,
    change: round(last.close - prev.close, 1),
    changePct: round((last.close / prev.close - 1) * 100),
    open: last.open,
    high: last.high,
    low: last.low,
    high20d: Math.max(...prior20.map((b) => b.high)),
    low20d: Math.min(...prior20.map((b) => b.low)),
    high52w: bars.length >= 245 ? Math.max(...bars.slice(-245).map((b) => b.high)) : undefined,
    history: closes.slice(-historyLength),
  };

  const volume: VolumeSnapshot = {
    latest: last.volume,
    avg5d: Math.round(sma(volumes, 5)!),
    avg20d: Math.round(sma(volumes, 20)!),
    turnoverOku: round((last.close * last.volume) / 1e8, 1),
  };

  const ma75 = sma(closes, 75);
  const rsi14 = rsi(closes, 14);
  const technical: TechnicalSnapshot = {
    ma5: round(sma(closes, 5)!, 1),
    ma25: round(sma(closes, 25)!, 1),
    ma75: ma75 === null ? undefined : round(ma75, 1),
    rsi14: rsi14 === null ? undefined : round(rsi14, 1),
    atr14: round(atr(bars, 14)!, 1),
  };

  return { price, volume, technical };
}
