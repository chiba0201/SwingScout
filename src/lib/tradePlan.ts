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

/** GU の許容幅（%）：値幅（ATR%）の大きい銘柄ほど広め（2〜4%、0.5刻み） */
export function gapUpTolerancePct(atrPct: number | null): number {
  return Math.min(4, Math.max(2, Math.round((atrPct ?? 3) * 0.8 * 2) / 2));
}

/** GD の許容幅（%）：これを超えるGDは原則見送り。値幅（ATR%）の大きい銘柄ほど広め（1〜3%、0.5刻み） */
export function gapDownTolerancePct(atrPct: number | null): number {
  return Math.min(3, Math.max(1, Math.round((atrPct ?? 3) * 0.5 * 2) / 2));
}

type PlanSource = Pick<Candidate, 'price' | 'technical' | 'volume' | 'earnings'>;

/**
 * GD（ギャップダウン）時の対応。
 *   - 寄りでは買わず、寄り後15〜30分の下げ止まりと VWAP 回復を確認する
 *   - 形の前提になる水準（高値ブレイクのブレイク水準、押し目の25日線）を割って寄ったら見送り（見送り条件と同じ）
 *   - それ以外は、エントリー下限（急騰後・自律反発は前日安値）を回復・維持できれば押し目候補
 *   - 許容幅を超えるGD・日経先物 −1.5%超の下落は、リバウンド狙いに切り替えず原則見送り
 */
export function gapDownRuleFor(c: PlanSource & { entryPlan?: Pick<EntryPlan, 'zoneLow'> }, m: DerivedMetrics): string {
  const { close, high20d, low } = c.price;
  const { ma25 } = c.technical;
  const setup = classifySetup(c, m);
  const gd = gapDownTolerancePct(m.atrPct);
  const gdPrice = roundToTick(close * (1 - gd / 100), 'down');
  const zoneLow = c.entryPlan?.zoneLow;

  let watch: string;
  if (setup === 'breakout') {
    watch = `ブレイク水準（${formatPrice(high20d)}円）を割って寄り付いたら見送り。上で寄れば、エントリー下限${zoneLow ? `（${formatPrice(zoneLow)}円）` : ''}を回復できたら押し目候補`;
  } else if (setup === 'pullback') {
    watch = `25日線（${formatLevel(ma25)}円）を割って寄り付いたら見送り。上を保てば押し目候補`;
  } else if ((setup === 'post-surge' || setup === 'rebound') && low !== undefined) {
    watch = `前日安値（${formatPrice(low)}円）を割らずに下げ止まれば押し目候補、割り込んだら見送り`;
  } else if (zoneLow !== undefined) {
    watch = `エントリー下限（${formatPrice(zoneLow)}円）を回復できれば押し目候補、できなければ見送り`;
  } else {
    watch = '前日終値近辺まで戻せれば押し目候補、戻せなければ見送り';
  }
  return `寄りでは買わず、寄り後15〜30分の下げ止まりとVWAP回復を確認。${watch}。前日終値比−${gd}%（${formatPrice(gdPrice)}円）超のGD、または日経先物が−1.5%超の下落なら、リバウンド狙いに切り替えず原則見送り。`;
}

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

/**
 * 2つ目の利確の距離（ATRの何倍か）。4営業日以上の保有で3倍。保有が短いほど値幅も出にくいので、
 * √日数に比例して縮める（3日で2.6倍、2日で2.1倍。1つ目の1.5倍より必ず遠い2倍を下限にする）。
 */
export function secondTargetAtrMultiple(holdingDays: number): number {
  return Math.round(Math.min(3, Math.max(2, 1.5 * Math.sqrt(Math.max(1, holdingDays)))) * 10) / 10;
}

/**
 * 利確の目安。保有期間の長さと OUT の日で決まるので、表示中の保有パターンで計算し直せるよう分けている
 * （analysis.ts が保有パターンを切り替えるたびに呼ぶ）。
 */
export function takeProfitFor(c: { price: { close: number }; technical: { atr14: number } }, window: HoldingWindow): TakeProfit {
  const { close } = c.price;
  const atr = c.technical.atr14;
  const multiple = secondTargetAtrMultiple(window.holdingDays.length);
  return {
    targets: [
      { price: roundToTick(close + atr * 1.5, 'up'), label: '半分利確' },
      { price: roundToTick(close + atr * multiple, 'up'), label: '残り利確' },
    ],
    rule: `届かなければ残りは5日線割れでトレール。${formatDateJa(window.exitDate)}大引けまでに全決済（持ち越さない）。`,
  };
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
  const atrPct = m.atrPct;

  const guPct = gapUpTolerancePct(atrPct);
  const gdPct = gapDownTolerancePct(atrPct);
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

  entryPlan.gapDownRule = gapDownRuleFor({ ...c, entryPlan }, m);

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
  const takeProfit = takeProfitFor(c, window);

  // ---- 見送り条件 ----
  const skip: string[] = [`寄りで前日終値比+${guPct * 2}%超のGU`, `寄りで前日終値比−${gdPct}%超のGD`];
  if (setup === 'breakout') skip.push(`ブレイク水準（${formatPrice(high20d)}円）を割って寄り付いた場合`);
  if (setup === 'pullback') skip.push(`25日線（${formatLevel(ma25)}円）を割って寄り付いた場合`);
  if (setup === 'post-surge') skip.push('前日高値を超えられず、前場で陰線になった場合');
  if (m.earningsTiming === 'in-window') skip.push('決算をまたぎたくない場合は見送り（または発表前日に手仕舞い）');
  const vi = findQuote(market, 'nikkeiVI');
  if (vi && vi.value >= 22) skip.push('日経VIが25を超えて上昇した場合（サイズを半分以下に）');
  skip.push('寄り前の日経先物が−1.5%超の下落');

  return { setup, entryPlan, stopLoss, takeProfit, skipConditions: skip };
}
