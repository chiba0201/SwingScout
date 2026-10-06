/**
 * 警告タグの判定。スコアとは独立に「見落とすと痛い」条件をラベルで示す。
 * 閾値は WARNING_THRESHOLDS にまとめてあるので、運用しながら調整する。
 */
import type { Candidate } from '../types/dataset';
import { formatDateJa } from './calendar';
import type { DerivedMetrics } from './metrics';

export type WarningSeverity = 'high' | 'medium' | 'low';

export type WarningId =
  | 'earnings-in-window'
  | 'earnings-exit-day'
  | 'earnings-near'
  | 'post-surge'
  | 'overheated'
  | 'sector-concentration'
  | 'theme-concentration'
  | 'low-liquidity'
  | 'heavy-margin'
  | 'manual';

export interface WarningTag {
  id: WarningId;
  label: string;
  severity: WarningSeverity;
  detail: string;
}

export interface ConcentrationGroup {
  kind: 'sector' | 'theme';
  key: string;
  codes: string[];
}

export const WARNING_THRESHOLDS = {
  /** 前日比（%）がこれ以上なら「急騰翌日」 */
  surgeMediumPct: 5,
  surgeHighPct: 8,
  /** 25日線乖離（%）がこれ以上なら「乖離大」 */
  overheatedDeviation25: 12,
  /** 売買代金（億円）がこれ未満なら「低流動性」 */
  lowTurnoverOku: 2,
  /** 信用倍率・取組日数がこれ以上なら「買残重い」 */
  heavyMarginRatio: 8,
  heavyMarginDays: 10,
} as const;

const TIMING_LABEL = {
  'pre-market': '寄り前',
  intraday: '場中',
  'after-close': '引け後',
  unknown: '時刻未定',
} as const;

/** 上位N銘柄の中で、同一セクター・同一テーマが2件以上ある組を返す */
export function findConcentration(top: readonly Candidate[]): ConcentrationGroup[] {
  const groups: ConcentrationGroup[] = [];
  const collect = (kind: ConcentrationGroup['kind'], keyOf: (c: Candidate) => string) => {
    const map = new Map<string, string[]>();
    for (const c of top) map.set(keyOf(c), [...(map.get(keyOf(c)) ?? []), c.code]);
    for (const [key, codes] of map) if (codes.length >= 2) groups.push({ kind, key, codes });
  };
  collect('sector', (c) => c.sector);
  collect('theme', (c) => c.theme);
  // セクターと完全に同じ組み合わせのテーマ重複は二重表示しない
  return groups.filter(
    (g) =>
      g.kind === 'sector' ||
      !groups.some((s) => s.kind === 'sector' && s.codes.join() === g.codes.join()),
  );
}

export function deriveWarnings(
  c: Candidate,
  m: DerivedMetrics,
  concentration: readonly ConcentrationGroup[] = [],
): WarningTag[] {
  const t = WARNING_THRESHOLDS;
  const tags: WarningTag[] = [];
  const earningsWhen = c.earnings.nextDate
    ? `${formatDateJa(c.earnings.nextDate)} ${TIMING_LABEL[c.earnings.timing ?? 'unknown']}`
    : '';

  if (m.earningsTiming === 'in-window') {
    tags.push({ id: 'earnings-in-window', label: '決算またぎ', severity: 'high', detail: `${earningsWhen}に決算発表予定` });
  } else if (m.earningsTiming === 'exit-day') {
    tags.push({ id: 'earnings-exit-day', label: 'OUT日に決算', severity: 'medium', detail: `${earningsWhen}。発表前に手仕舞う前提` });
  } else if (m.earningsTiming === 'after-window-near') {
    tags.push({ id: 'earnings-near', label: '決算接近', severity: 'low', detail: `${earningsWhen}（保有期間の直後）` });
  }

  if (c.price.changePct >= t.surgeMediumPct) {
    tags.push({
      id: 'post-surge',
      label: '急騰翌日',
      severity: c.price.changePct >= t.surgeHighPct ? 'high' : 'medium',
      detail: `基準日に${c.price.changePct.toFixed(1)}%上昇。寄り天・利食い売りに注意`,
    });
  }

  if (m.maDeviation25 !== null && m.maDeviation25 >= t.overheatedDeviation25) {
    tags.push({ id: 'overheated', label: '乖離大', severity: 'medium', detail: `25日線から+${m.maDeviation25.toFixed(1)}%` });
  }

  if (c.volume.turnoverOku < t.lowTurnoverOku) {
    tags.push({ id: 'low-liquidity', label: '低流動性', severity: 'medium', detail: `売買代金${c.volume.turnoverOku.toFixed(1)}億円` });
  }

  if (
    (m.marginRatio !== null && m.marginRatio >= t.heavyMarginRatio) ||
    (m.marginDays !== null && m.marginDays >= t.heavyMarginDays)
  ) {
    tags.push({
      id: 'heavy-margin',
      label: '買残重い',
      severity: 'low',
      detail: `信用倍率${m.marginRatio?.toFixed(1) ?? '—'}倍 / 買残${m.marginDays?.toFixed(1) ?? '—'}日分`,
    });
  }

  for (const g of concentration) {
    if (!g.codes.includes(c.code)) continue;
    const others = g.codes.filter((code) => code !== c.code).join(', ');
    tags.push(
      g.kind === 'sector'
        ? { id: 'sector-concentration', label: '同一セクター偏り', severity: 'medium', detail: `${g.key} ×${g.codes.length}（${others} と同業種）` }
        : { id: 'theme-concentration', label: 'テーマ重複', severity: 'medium', detail: `${g.key} ×${g.codes.length}（${others} と連動しやすい）` },
    );
  }

  for (const flag of c.risks.flags) {
    tags.push({ id: 'manual', label: flag, severity: 'medium', detail: '手動で付与された警告' });
  }

  const order: Record<WarningSeverity, number> = { high: 0, medium: 1, low: 2 };
  return tags.sort((a, b) => order[a.severity] - order[b.severity]);
}
