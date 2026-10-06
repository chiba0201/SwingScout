/**
 * 入り方・損切り・利確・見送り条件の「たたき台」をルールで作る。
 * CLI のパイプラインで、手書きの計画が無い銘柄に適用する（手書きがあればそちらを優先）。
 * ATR と移動平均を基準にしているので、指標を差し替える場合はここを調整する。
 */
import type {
  Candidate,
  EntryPlan,
  MarketContext,
  StopLoss,
  TakeProfit,
} from '../types/dataset';
import type { HoldingWindow } from './calendar';
import { formatDateJa } from './calendar';
import { formatLevel, formatPrice } from './format';
import type { DerivedMetrics } from './metrics';
import { findQuote } from './scoring';

export type SetupType = 'breakout' | 'pullback' | 'post-surge' | 'trend' | 'rebound';

export const SETUP_LABELS: Record<SetupType, string> = {
  breakout: '高値ブレイク',
  pullback: '押し目',
  'post-surge': '急騰後の押し待ち',
  trend: '上昇トレンド継続',
  rebound: '自律反発',
};

/** 呼値（TOPIX500構成銘柄以外の一般的な刻み）。TOPIX500は刻みが細かいため将来分岐する */
export function tickSize(price: number): number {
  if (price <= 3_000) return 1;
  if (price <= 5_000) return 5;
  if (price <= 30_000) return 10;
  if (price <= 50_000) return 50;
  if (price <= 300_000) return 100;
  return 500;
}

export function roundToTick(price: number, mode: 'nearest' | 'down' | 'up' = 'nearest'): number {
  const tick = tickSize(price);
  const fn = mode === 'down' ? Math.floor : mode === 'up' ? Math.ceil : Math.round;
  return fn(price / tick) * tick;
}

type PlanSource = Pick<Candidate, 'price' | 'technical' | 'volume' | 'earnings'>;

export function classifySetup(c: PlanSource, m: DerivedMetrics): SetupType {
  if (c.price.changePct >= 5) return 'post-surge';
  if (m.isNewHigh20d && (m.volumeRatio20d ?? 0) >= 1.3) return 'breakout';
  if ((m.maDeviation25 ?? -1) >= 0 && (m.maDeviation25 ?? 99) <= 3) return 'pullback';
  if (m.maAlignment === 'bullish') return 'trend';
  return 'rebound';
}

export interface TradePlan {
  setup: SetupType;
  entryPlan: EntryPlan;
  stopLoss: StopLoss;
  takeProfit: TakeProfit;
  skipConditions: string[];
}

export function buildTradePlan(
  c: PlanSource,
  m: DerivedMetrics,
  market: MarketContext,
  window: HoldingWindow,
): TradePlan {
  const { close, high20d } = c.price;
  const { atr14: atr, ma5, ma25 } = c.technical;
  const setup = classifySetup(c, m);
  const atrPct = m.atrPct ?? 3;

  // GU の許容幅：値幅の大きい銘柄ほど広め（2〜4%）
  const guPct = Math.min(4, Math.max(2, Math.round(atrPct * 0.8 * 2) / 2));
  const guPrice = roundToTick(close * (1 + guPct / 100));
  const gapUpRule = `前日終値比+${guPct}%（${formatPrice(guPrice)}円）超のGUは寄りで追わず、5分足でVWAPを回復してからの押しを待つ。+${guPct * 2}%超は見送り。`;

  // ---- 入り方 ----
  const zone = (low: number, high: number) => ({
    zoneLow: roundToTick(Math.min(low, high), 'down'),
    zoneHigh: roundToTick(Math.min(Math.max(low, high), close), 'up'),
  });
  let entryPlan: EntryPlan;
  let structuralStop: { price: number; rule: string } | null = null;
  switch (setup) {
    case 'breakout': {
      const z = zone(close - atr * 0.5, close);
      entryPlan = {
        method: `寄り後の押しを分割で拾う（${formatPrice(z.zoneLow)}〜${formatPrice(z.zoneHigh)}円）。ブレイク水準の20日高値${formatPrice(high20d)}円を割らないことが前提。`,
        ...z,
        gapUpRule,
      };
      structuralStop = { price: high20d - atr * 0.3, rule: `ブレイク水準（${formatPrice(high20d)}円）を明確に割り込んだら撤退` };
      break;
    }
    case 'pullback': {
      const z = zone(ma25, Math.max(ma5, ma25 + atr * 0.5));
      entryPlan = {
        method: `25日線〜5日線（${formatPrice(z.zoneLow)}〜${formatPrice(z.zoneHigh)}円）への押しを指値で待つ。下ヒゲを確認してから打診。`,
        ...z,
        gapUpRule,
      };
      structuralStop = { price: ma25 - atr * 0.3, rule: `25日線（${formatLevel(ma25)}円）を終値で割れたら撤退` };
      break;
    }
    case 'post-surge': {
      const z = zone(close - atr * 1.0, close - atr * 0.3);
      entryPlan = {
        method: `初日は寄りで追わない。利食い一巡後の押し（${formatPrice(z.zoneLow)}〜${formatPrice(z.zoneHigh)}円）を待ち、届かなければ見送り。`,
        ...z,
        gapUpRule,
      };
      break;
    }
    case 'trend': {
      const z = zone(ma5, close);
      entryPlan = {
        method: `前日終値近辺で打診し、5日線（${formatLevel(ma5)}円）タッチで買い増し（${formatPrice(z.zoneLow)}〜${formatPrice(z.zoneHigh)}円）。`,
        ...z,
        gapUpRule,
      };
      structuralStop = { price: Math.min(ma5, close) - atr * 0.8, rule: '5日線を割り込み、戻せなければ撤退' };
      break;
    }
    case 'rebound': {
      const z = zone(close - atr * 0.5, close);
      entryPlan = {
        method: `反発確認後の小さめサイズのみ（${formatPrice(z.zoneLow)}〜${formatPrice(z.zoneHigh)}円）。陰線引けなら翌日以降に持ち越さない。`,
        ...z,
        gapUpRule,
      };
      break;
    }
  }

  // ---- 損切り ----
  // ATRベースと構造ベースのうち近い方を採用し、エントリーゾーン下限より必ず下に置く。最大-8%
  const atrStop = close - atr * 1.5;
  let stopPrice = atrStop;
  let stopRule = `ATR×1.5（${formatLevel(atr * 1.5)}円）下で機械的に撤退`;
  if (structuralStop && structuralStop.price < close && structuralStop.price > atrStop) {
    stopPrice = structuralStop.price;
    stopRule = structuralStop.rule;
  }
  if (entryPlan.zoneLow !== undefined && stopPrice > entryPlan.zoneLow - atr * 0.3) {
    stopPrice = entryPlan.zoneLow - atr * 0.3;
    stopRule = `エントリーゾーン下限（${formatPrice(entryPlan.zoneLow)}円）を割り込んだら撤退`;
  }
  stopPrice = roundToTick(Math.max(stopPrice, close * 0.92), 'down');
  const stopLoss: StopLoss = { price: stopPrice, rule: stopRule };

  // ---- 利確 ----
  const t1 = roundToTick(close + atr * 1.5, 'up');
  const t2 = roundToTick(close + atr * 3, 'up');
  const takeProfit: TakeProfit = {
    targets: [
      { price: t1, label: '半分利確' },
      { price: t2, label: '残り利確' },
    ],
    rule: `届かなければ残りは5日線割れでトレール。${formatDateJa(window.exitDate)}大引けまでに全決済（持ち越さない）。`,
  };

  // ---- 見送り条件 ----
  const skip: string[] = [`寄りで前日終値比+${guPct * 2}%超のGU`];
  if (setup === 'breakout') skip.push(`ブレイク水準（${formatPrice(high20d)}円）を割って寄り付いた場合`);
  if (setup === 'pullback') skip.push(`25日線（${formatLevel(ma25)}円）を割って寄り付いた場合`);
  if (setup === 'post-surge') skip.push('前日高値を超えられず、前場で陰線になった場合');
  if (m.earningsTiming === 'in-window') skip.push('決算をまたぎたくない場合は見送り（または発表前日に手仕舞い）');
  const vi = findQuote(market, 'nikkeiVI');
  if (vi && vi.value >= 22) skip.push('日経VIが25を超えて上昇した場合（サイズを半分以下に）');
  skip.push('寄り前の日経先物が−1.5%超の下落');

  return { setup, entryPlan, stopLoss, takeProfit, skipConditions: skip };
}
