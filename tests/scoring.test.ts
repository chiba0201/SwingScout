import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeDataset, DEFAULT_ANALYSIS_OPTIONS } from '../src/lib/analysis';
import { computeHoldingWindow } from '../src/lib/calendar';
import { computeMetrics } from '../src/lib/metrics';
import { DEFAULT_SCORING_CONFIG, FACTORS, interpolate, scoreCandidate } from '../src/lib/scoring';
import { validateDataset } from '../src/lib/validate';
import type { Candidate } from '../src/types/dataset';

const dataset = validateDataset(JSON.parse(readFileSync('data/mock-candidates.json', 'utf8')));
const window = computeHoldingWindow(dataset.asOf);
const base = dataset.candidates[0]!;

const score = (c: Candidate) =>
  scoreCandidate({ candidate: c, metrics: computeMetrics(c, window), ctx: { market: dataset.marketContext, window } });

describe('scoring', () => {
  it('interpolate は端で頭打ちし、間を線形補間する', () => {
    const pts = [[0, 0], [10, 100]] as const;
    expect(interpolate(-5, pts)).toBe(0);
    expect(interpolate(5, pts)).toBe(50);
    expect(interpolate(50, pts)).toBe(100);
  });

  it('ファクターIDは重複しない', () => {
    const ids = FACTORS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('スコアはすべて 0〜100', () => {
    for (const c of dataset.candidates) {
      const s = score(c);
      for (const v of [s.total, s.supplyDemand, s.technical, s.event, s.risk]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('出来高が増えるほど需給スコアは上がる', () => {
    const low = score({ ...base, volume: { ...base.volume, latest: base.volume.avg20d * 0.8 } });
    const high = score({ ...base, volume: { ...base.volume, latest: base.volume.avg20d * 2.5 } });
    expect(high.supplyDemand).toBeGreaterThan(low.supplyDemand);
  });

  it('保有期間中に決算があるとリスクが上がり総合が下がる', () => {
    const safe = score({ ...base, earnings: { ...base.earnings, nextDate: '2026-11-30' } });
    const risky = score({ ...base, earnings: { ...base.earnings, nextDate: '2026-10-07' } });
    expect(risky.risk).toBeGreaterThan(safe.risk);
    expect(risky.total).toBeLessThan(safe.total);
  });

  it('リスク減点を0にすると決算またぎ銘柄の順位が上がる', () => {
    const rankOf = (riskPenalty: number) =>
      analyzeDataset(dataset, {
        ...DEFAULT_ANALYSIS_OPTIONS,
        scoring: { ...DEFAULT_SCORING_CONFIG, riskPenalty },
      }).ranked.findIndex((c) => c.code === 'S106');
    expect(rankOf(0)).toBeLessThan(rankOf(0.3));
  });
});

describe('analysis', () => {
  const a = analyzeDataset(dataset);

  it('上位6件を返し、順位は1から振り直される', () => {
    expect(a.top).toHaveLength(6);
    expect(a.ranked.map((c) => c.rank)).toEqual(a.ranked.map((_, i) => i + 1));
  });

  it('サンプルの上位には決算またぎ・急騰翌日・同一セクター偏りの警告が出る', () => {
    const ids = new Set(a.top.flatMap((c) => c.warnings.map((w) => w.id)));
    expect(ids).toContain('earnings-in-window');
    expect(ids).toContain('post-surge');
    expect(ids).toContain('sector-concentration');
  });

  it('SQ・休場・候補の決算がカレンダーに自動で入る', () => {
    const cats = a.events.map((e) => `${e.category}:${e.date}`);
    expect(cats).toContain('sq:2026-10-09');
    expect(cats).toContain('holiday:2026-10-12');
    expect(a.events.some((e) => e.source === 'candidate' && e.code === 'S106')).toBe(true);
  });
});
