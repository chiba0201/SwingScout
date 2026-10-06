/**
 * データセット全体の分析パイプライン（UI と CLI の共通入口）。
 *
 *   Dataset → 派生指標(metrics) → スコア・順位(scoring) → 警告(warnings) → カレンダー統合
 *
 * UI はここで再スコアするため、重みを変えると順位がその場で変わる。
 * JSON 内の scores / rank は「生成時点のスナップショット」として扱う。
 */
import type {
  Candidate,
  Dataset,
  FactorScore,
  ISODate,
  MarketEvent,
  ScoreSummary,
} from '../types/dataset';
import {
  addDays,
  computeHoldingWindow,
  DEFAULT_HOLDING_PATTERN,
  holidayName,
  sqDate,
  toTime,
  type HoldingPattern,
  type HoldingWindow,
} from './calendar';
import { computeMetrics, type DerivedMetrics } from './metrics';
import { DEFAULT_SCORING_CONFIG, rankCandidates, type ScoringConfig } from './scoring';
import { deriveWarnings, findConcentration, type ConcentrationGroup, type WarningTag } from './warnings';

export interface AnalysisOptions {
  scoring: ScoringConfig;
  pattern: HoldingPattern;
  /** 「今週の候補」として扱う件数 */
  topN: number;
}

export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = {
  scoring: DEFAULT_SCORING_CONFIG,
  pattern: DEFAULT_HOLDING_PATTERN,
  topN: 6,
};

export interface AnalyzedCandidate extends Candidate {
  scores: ScoreSummary & { factors: FactorScore[] };
  metrics: DerivedMetrics;
  warnings: WarningTag[];
}

export interface CalendarEvent extends MarketEvent {
  /** market: JSON由来 / auto: SQ・休場の自動判定 / candidate: 候補銘柄の決算 */
  source: 'market' | 'auto' | 'candidate';
  code?: string;
}

export interface DatasetAnalysis {
  dataset: Dataset;
  window: HoldingWindow;
  options: AnalysisOptions;
  /** 全候補（スコア降順、rank 振り直し済み） */
  ranked: AnalyzedCandidate[];
  /** 上位 topN */
  top: AnalyzedCandidate[];
  /** 上位内のセクター/テーマ重複 */
  concentration: ConcentrationGroup[];
  /** 基準日〜OUT翌週までのイベント（日時順） */
  events: CalendarEvent[];
}

function buildEvents(dataset: Dataset, window: HoldingWindow, top: Candidate[]): CalendarEvent[] {
  const from = window.weekDays[0] ?? window.entryDate;
  const to = addDays(window.nextOpenAfterExit, 7);
  const inRange = (d: ISODate) => toTime(d) >= toTime(from) && toTime(d) <= toTime(to);

  const events: CalendarEvent[] = dataset.marketContext.events
    .filter((e) => inRange(e.date))
    .map((e) => ({ ...e, source: 'market' }));
  const has = (category: MarketEvent['category'], date: ISODate) =>
    events.some((e) => e.category === category && e.date === date);

  // SQ（JSONに無ければ自動追加）
  const months = new Set([from, to].map((d) => d.slice(0, 7)));
  for (const ym of months) {
    const [y, m] = ym.split('-').map(Number);
    const sq = sqDate(y ?? 0, m ?? 0);
    if (inRange(sq.date) && !has('sq', sq.date)) {
      events.push({
        date: sq.date,
        label: sq.major ? 'メジャーSQ' : 'ミニSQ',
        category: 'sq',
        importance: sq.major ? 'high' : 'medium',
        note: '寄り付きでSQ値算出。寄りの板が荒れやすい',
        source: 'auto',
      });
    }
  }

  // 平日の休場日
  for (let d = from; toTime(d) <= toTime(to); d = addDays(d, 1)) {
    const name = holidayName(d);
    if (name && !has('holiday', d)) {
      events.push({ date: d, label: `${name}（休場）`, category: 'holiday', importance: 'medium', source: 'auto' });
    }
  }

  // 上位候補の決算
  for (const c of top) {
    const date = c.earnings.nextDate;
    if (date && inRange(date)) {
      events.push({
        date,
        time: c.earnings.timing === 'after-close' ? '15:30〜' : undefined,
        label: `${c.code} ${c.name} 決算`,
        category: 'earnings',
        importance: 'high',
        source: 'candidate',
        code: c.code,
      });
    }
  }

  return events.sort(
    (a, b) => toTime(a.date) - toTime(b.date) || (a.time ?? '').localeCompare(b.time ?? ''),
  );
}

export function analyzeDataset(
  dataset: Dataset,
  options: AnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
): DatasetAnalysis {
  const window = computeHoldingWindow(dataset.asOf, options.pattern);
  const items = dataset.candidates.map((candidate) => ({
    candidate,
    metrics: computeMetrics(candidate, window),
  }));

  const scored = rankCandidates(items, { market: dataset.marketContext, window }, options.scoring);
  const topCandidates = scored.slice(0, options.topN).map((s) => s.candidate);
  const concentration = findConcentration(topCandidates);

  const ranked: AnalyzedCandidate[] = scored.map((s, idx) => {
    const inTop = idx < options.topN;
    return {
      ...s.candidate,
      rank: idx + 1,
      scores: { ...s.scores, factors: s.scores.factors ?? [] },
      metrics: s.metrics,
      warnings: deriveWarnings(s.candidate, s.metrics, inTop ? concentration : []),
    };
  });

  return {
    dataset,
    window,
    options,
    ranked,
    top: ranked.slice(0, options.topN),
    concentration,
    events: buildEvents(dataset, window, topCandidates),
  };
}
