/** 地合い関連の判定・ラベル（ダッシュボードとレポートで共通） */
import type { Importance, ISODate, MarketContext, MarketEventCategory, MarketStance } from '../types/dataset';
import type { TodayMarket } from '../types/today';
import { formatDateJa, toTime } from './calendar';

/**
 * 地合いが「いつ時点」のものか。Today の市況メモから作った地合いはメモの日付・セッション、
 * それ以外（手書きの market.json など）は候補の基準日（前日の引け）。
 */
export function marketContextWhen(mc: MarketContext, datasetAsOf: ISODate): string {
  const s = mc.source;
  if (s?.kind === 'today') return `${formatDateJa(s.asOf)} ${s.session}の市況${s.checkedAt ? `（${s.checkedAt}確認）` : ''}`;
  return `基準日 ${formatDateJa(datasetAsOf)} 引け`;
}

/** 候補データを作った後に Today が更新されたか（されていれば、再生成で地合いが新しくなる） */
export function marketContextOutdated(mc: MarketContext, today: TodayMarket | null): boolean {
  const s = mc.source;
  if (s?.kind !== 'today' || !today) return false;
  if (toTime(today.asOf) !== toTime(s.asOf)) return toTime(today.asOf) > toTime(s.asOf);
  return today.meta.generatedAt > s.reflectedAt;
}

export const STANCE_LABELS: Record<MarketStance, string> = {
  bullish: '強気',
  neutral: '中立',
  bearish: '弱気',
};

export const IMPORTANCE_LABELS: Record<Importance, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export const EVENT_CATEGORY_LABELS: Record<MarketEventCategory, string> = {
  sq: 'SQ',
  'us-macro': '米指標',
  'jp-macro': '国内指標',
  'central-bank': '金融政策',
  earnings: '決算',
  holiday: '休場',
  other: 'その他',
};

export interface ViRegime {
  level: 'calm' | 'normal' | 'caution' | 'alert' | 'panic';
  label: string;
  /** 通常時に対するポジションサイズの目安 */
  sizeFactor: number;
  guidance: string;
}

/** 日経VIの水準 → ポジションサイズの目安。閾値は運用に合わせて調整する */
export function viRegime(vi: number): ViRegime {
  if (vi < 18) return { level: 'calm', label: '落ち着き', sizeFactor: 1, guidance: '通常サイズ' };
  if (vi < 22) return { level: 'normal', label: '平常', sizeFactor: 1, guidance: '通常サイズ' };
  if (vi < 26) return { level: 'caution', label: 'やや警戒', sizeFactor: 0.7, guidance: '1銘柄あたり通常の7割程度' };
  if (vi < 30) return { level: 'alert', label: '警戒', sizeFactor: 0.5, guidance: '通常の半分。銘柄数も絞る' };
  return { level: 'panic', label: '高警戒', sizeFactor: 0.25, guidance: '新規は最小サイズか見送り' };
}
