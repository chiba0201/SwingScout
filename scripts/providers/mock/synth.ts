/**
 * モック用の日足を決定論的に合成する（同じ seed なら毎回同じチャート）。
 * シナリオごとに直近60本の形を作り、最後に基準日終値が指定値になるようスケールする。
 */
import { addDays, isBusinessDay } from '../../../src/lib/calendar';
import type { DailyBar } from '../../../src/lib/indicators';
import { roundToTick } from '../../../src/lib/tradePlan';
import type { ISODate } from '../../../src/types/dataset';
import type { MockStock, Scenario } from './universe';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianFrom(rand: () => number) {
  return () => {
    const u = Math.max(rand(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
}

/** asOf（営業日なら含む）から遡って count 営業日分の日付を古い順で返す */
export function businessDaysEndingAt(asOf: ISODate, count: number): ISODate[] {
  const days: ISODate[] = [];
  for (let d = asOf; days.length < count; d = addDays(d, -1)) {
    if (isBusinessDay(d)) days.push(d);
  }
  return days.reverse();
}

/** 直近60本の日次リターンと出来高倍率をシナリオ別に決める */
function tailStep(
  scenario: Scenario,
  k: number, // 末尾からの位置（0 = 基準日）
  z: number,
  sigma: number,
  logDev: number, // 60本前の水準からの対数乖離（平均回帰用）
): { r: number; vol: number } {
  const revert = -0.15 * logDev;
  switch (scenario) {
    case 'breakout':
      return { r: revert + sigma * 0.7 * z, vol: k <= 2 ? [2.6, 1.7, 1.3][k]! : 0.95 };
    case 'pullback':
      if (k === 0) return { r: 0.006, vol: 1.05 };
      if (k <= 5) return { r: -0.006 + sigma * 0.3 * z, vol: 0.75 };
      return { r: 0.005 + sigma * 0.5 * z, vol: 1.1 };
    case 'trend':
      return { r: k === 0 ? 0.012 : 0.0035 + sigma * 0.7 * z, vol: k < 10 ? 1.25 : 1 };
    case 'surge':
      return { r: k === 0 ? 0.11 : revert + sigma * 0.6 * z, vol: k === 0 ? 5.2 : 1 };
    case 'sideways':
      return { r: k === 0 ? 0.002 : revert + sigma * z, vol: 0.85 };
    case 'rebound':
      return { r: k === 0 ? 0.025 : -0.003 + sigma * 0.8 * z, vol: k === 0 ? 1.4 : 1 };
    case 'grind':
      return { r: k === 0 ? 0.004 : 0.0015 + sigma * 0.6 * z, vol: 0.95 };
  }
}

export function generateBars(stock: MockStock, asOf: ISODate, count = 260): DailyBar[] {
  const rand = mulberry32(stock.seed);
  const gauss = gaussianFrom(rand);
  const sigma = stock.noisePct / 100;
  const dates = businessDaysEndingAt(asOf, count);
  const tailStart = count - 60;

  const closes = [100];
  const volMult = [1];
  const returns = [0];
  for (let i = 1; i < count; i++) {
    const prev = closes[i - 1]!;
    if (i < tailStart) {
      const r = 0.0003 + sigma * gauss();
      closes.push(prev * (1 + r));
      returns.push(r);
      volMult.push(1);
    } else {
      const anchor = closes[tailStart - 1]!;
      const step = tailStep(stock.scenario, count - 1 - i, gauss(), sigma, Math.log(prev / anchor));
      closes.push(prev * (1 + step.r));
      returns.push(step.r);
      volMult.push(step.vol);
    }
  }

  // ブレイクアウトは「直近レンジ高値を終値で明確に上抜く」形を保証する
  if (stock.scenario === 'breakout') {
    const rangeHigh = Math.max(...closes.slice(count - 24, count - 3));
    closes[count - 3] = rangeHigh * 0.993;
    closes[count - 2] = rangeHigh * 1.004;
    closes[count - 1] = rangeHigh * 1.036;
    for (let i = count - 3; i < count; i++) returns[i] = closes[i]! / closes[i - 1]! - 1;
  }

  const scale = stock.close / closes[count - 1]!;
  return dates.map((date, i) => {
    const close = closes[i]! * scale;
    const prevClose = (closes[i - 1] ?? closes[i]!) * scale;
    const open = i === 0 ? close : prevClose * (1 + returns[i]! * 0.4 + sigma * 0.2 * gauss());
    const high = Math.max(open, close) * (1 + Math.abs(gauss()) * sigma * 0.4);
    const low = Math.min(open, close) * (1 - Math.abs(gauss()) * sigma * 0.4);
    const volume = stock.baseVolume * Math.exp(0.25 * gauss()) * volMult[i]!;
    return {
      date,
      open: roundToTick(open),
      high: roundToTick(high, 'up'),
      low: roundToTick(low, 'down'),
      close: i === count - 1 ? stock.close : roundToTick(close),
      volume: Math.round(volume / 100) * 100,
    };
  });
}
