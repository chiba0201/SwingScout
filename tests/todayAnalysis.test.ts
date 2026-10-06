import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeDataset } from '../src/lib/analysis';
import { analyzeToday, judgeWatchItem, likelyScenarioId, TODAY_THRESHOLDS } from '../src/lib/todayAnalysis';
import { validateDataset, validateTodayMarket } from '../src/lib/validate';
import type { TodayMarket } from '../src/types/today';

const swing = analyzeDataset(validateDataset(JSON.parse(readFileSync('data/mock-candidates.json', 'utf8'))));
const today = validateTodayMarket(JSON.parse(readFileSync('data/today-market.json', 'utf8')));
const byCode = (code: string) => swing.top.find((c) => c.code === code)!;

/** 寄り追いが許される地合い（買い目線・VI低め・小幅GU） */
const calm: TodayMarket = {
  ...today,
  stance: '買い目線',
  expectedOpen: { ...today.expectedOpen, gapPct: 0.2 },
  externalQuotes: [...today.externalQuotes, { id: 'nikkeiVI', label: '日経VI', value: 16, change: -1, changePct: -5.9 }],
};

describe('validateTodayMarket', () => {
  it('サンプルJSONは検証を通る', () => {
    expect(today.meta.isSample).toBe(true);
    expect(today.externalQuotes.map((q) => q.id)).toEqual(
      expect.arrayContaining(['dow', 'nasdaq', 'sp500', 'sox', 'vix', 'nikkeiFuture', 'usdjpy', 'us10y']),
    );
  });

  it('必須項目が欠けていれば分かりやすいエラー', () => {
    const { watchlistRules: _r, ...broken } = today;
    expect(() => validateTodayMarket(broken)).toThrow(/watchlistRules/);
    expect(() => validateTodayMarket({ ...today, meta: { ...today.meta, schemaVersion: 99 } })).toThrow(/schemaVersion/);
  });
});

describe('likelyScenarioId', () => {
  it('想定ギャップから近いシナリオを選ぶ', () => {
    expect(likelyScenarioId(TODAY_THRESHOLDS.largeGapUpPct)).toBe('large-gap-up');
    expect(likelyScenarioId(0.4)).toBe('flat-small-gap');
    expect(likelyScenarioId(TODAY_THRESHOLDS.gapDownPct)).toBe('gap-down');
  });
});

describe('judgeWatchItem', () => {
  it('リスクスコアが基準超なら見送り', () => {
    const w = judgeWatchItem(byCode('S106'), { today, vi: 22.8 });
    expect(w.action).toBe('skip');
    expect(w.reason).toMatch(/リスクスコア/);
  });

  it('リスクオフの日は全銘柄見送り', () => {
    const t = analyzeToday({ ...today, stance: 'リスクオフ' }, swing);
    expect(t.watchlist.every((w) => w.action === 'skip')).toBe(true);
  });

  it('本日決算の銘柄は見送り', () => {
    const c = byCode('S101');
    const w = judgeWatchItem({ ...c, earnings: { ...c.earnings, nextDate: today.asOf } }, { today: calm, vi: 16 });
    expect(w.action).toBe('skip');
  });

  it('急騰翌日は押し目待ちで、理由に急騰翌日が入る', () => {
    const w = judgeWatchItem(byCode('S104'), { today: calm, vi: 16 });
    expect(w.action).toBe('wait-pullback');
    expect(w.reason).toMatch(/急騰翌日/);
  });

  it('VIが高い・想定GUが許容超なら押し目待ち', () => {
    expect(judgeWatchItem(byCode('S111'), { today: calm, vi: 25 }).action).toBe('wait-pullback');
    const bigGap = { ...calm, expectedOpen: { ...calm.expectedOpen, gapPct: 1.2 } };
    expect(judgeWatchItem(byCode('S111'), { today: bigGap, vi: 16 }).reason).toMatch(/許容/);
  });

  it('落ち着いた地合いの上昇トレンド銘柄は寄り追いOK', () => {
    const w = judgeWatchItem(byCode('S111'), { today: calm, vi: 16 });
    expect(w.action).toBe('chase-ok');
    expect(w.cautions.some((c) => /追わない/.test(c))).toBe(true);
  });
});

describe('analyzeToday', () => {
  const t = analyzeToday(today, swing);

  it('サンプルは寄り追い禁止の地合いなので寄り追いOKは出ない', () => {
    expect(t.watchlist).toHaveLength(6);
    expect(t.watchlist.some((w) => w.action === 'chase-ok')).toBe(false);
  });

  it('日経VIは Today に無ければスイング側の前日終値を使う', () => {
    expect(t.vi).toMatchObject({ value: 22.84, source: 'swing', regime: { label: 'やや警戒' } });
    expect(analyzeToday(calm, swing).vi).toMatchObject({ value: 16, source: 'today', regime: { label: '落ち着き' } });
  });

  it('スイングの保有ウィンドウでの位置づけ', () => {
    expect(t.swingRole.role).toBe('entry');
    expect(analyzeToday({ ...today, asOf: '2026-10-07' }, swing).swingRole.label).toMatch(/保有2日目/);
    expect(analyzeToday({ ...today, asOf: '2026-10-09' }, swing).swingRole.role).toBe('exit');
  });

  it('SQ日と監視銘柄の決算日はイベントに自動で入る', () => {
    const sqDay = analyzeToday({ ...today, asOf: '2026-10-09' }, swing);
    expect(sqDay.events.some((e) => e.auto && e.label === 'ミニSQ')).toBe(true);
    const earningsDay = analyzeToday({ ...today, asOf: '2026-10-08' }, swing);
    expect(earningsDay.events.some((e) => e.auto && e.label.startsWith('S106'))).toBe(true);
  });

  it('Today の日付がスイング基準日以前なら注意を出す', () => {
    expect(t.notices).toHaveLength(0);
    expect(analyzeToday({ ...today, asOf: swing.dataset.asOf }, swing).notices[0]).toMatch(/基準日/);
  });
});
