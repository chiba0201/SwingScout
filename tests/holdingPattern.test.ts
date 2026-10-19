import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeDataset, provisionalPlanMessage } from '../src/lib/analysis';
import { computeHoldingWindow, findHoldingPattern } from '../src/lib/calendar';
import { DEFAULT_SCORING_CONFIG } from '../src/lib/scoring';
import { gapDownTolerancePct, secondTargetAtrMultiple } from '../src/lib/tradePlan';
import { validateDataset } from '../src/lib/validate';

// 10/6(火) 引けのデータ。10/12(月) はスポーツの日で休場
const dataset = validateDataset(JSON.parse(readFileSync('data/2026-10-06.json', 'utf8')));
const analyze = (patternId: string) =>
  analyzeDataset(dataset, { scoring: DEFAULT_SCORING_CONFIG, pattern: findHoldingPattern(patternId), topN: 6 });

describe('週の途中から入る保有パターン', () => {
  it('水曜In金曜out・木曜In金曜out は今週の残りで金曜に出る', () => {
    expect(computeHoldingWindow('2026-10-06', findHoldingPattern('wed-fri'))).toMatchObject({
      entryDate: '2026-10-07',
      exitDate: '2026-10-09',
      holdingDays: ['2026-10-07', '2026-10-08', '2026-10-09'],
    });
    expect(computeHoldingWindow('2026-10-06', findHoldingPattern('thu-fri'))).toMatchObject({
      entryDate: '2026-10-08',
      exitDate: '2026-10-09',
    });
  });
});

describe('利確の距離は保有日数に合わせる', () => {
  it('4営業日以上は ATR×3、短いほど縮める（下限 ATR×2）', () => {
    expect([5, 4, 3, 2, 1].map(secondTargetAtrMultiple)).toEqual([3, 3, 2.6, 2.1, 2]);
  });

  it('保有パターンを切り替えると、利確の価格と OUT の日を計算し直す', () => {
    const tueFri = analyze('tue-fri').ranked[0]!;
    const wedFri = analyze('wed-fri').ranked.find((c) => c.code === tueFri.code)!;
    const { close } = tueFri.price;
    const atr = tueFri.technical.atr14;
    expect(tueFri.takeProfit.rule).toMatch(/10\/16\(金\)大引けまで/);
    expect(wedFri.takeProfit.rule).toMatch(/10\/9\(金\)大引けまで/);
    // 1つ目は同じ、2つ目は 3日保有で ATR×2.6 に縮む
    expect(wedFri.takeProfit.targets[0]!.price).toBe(tueFri.takeProfit.targets[0]!.price);
    expect(wedFri.takeProfit.targets[1]!.price).toBeLessThan(tueFri.takeProfit.targets[1]!.price);
    expect(Math.abs(wedFri.takeProfit.targets[1]!.price - (close + atr * 2.6))).toBeLessThan(close * 0.01);
  });
});

describe('作戦の暫定・確定', () => {
  it('データ基準日が IN の前営業日より前なら暫定', () => {
    // 火曜In：IN 10/13 の前営業日は 10/9(金)（10/12 は休場）→ 10/6 引けでは暫定
    expect(analyze('tue-fri').plan).toEqual({ provisional: true, basisDate: '2026-10-06', confirmAfter: '2026-10-09' });
    // 水曜In：IN 10/7 の前営業日 10/6 の引けなので確定
    expect(analyze('wed-fri').plan.provisional).toBe(false);
    // 木曜In：IN 10/8 の前営業日 10/7 の引け後に作り直すと確定
    expect(analyze('thu-fri').plan).toMatchObject({ provisional: true, confirmAfter: '2026-10-07' });
  });

  it('暫定の説明', () => {
    expect(provisionalPlanMessage(analyze('tue-fri'))).toBe(
      '10/6(火) 引けの日足で作った暫定の作戦です。IN（10/13(火)）の前営業日 10/9(金) の引け後に日足を取り直して生成すると確定します。',
    );
    expect(provisionalPlanMessage(analyze('wed-fri'))).toBeNull();
  });
});

describe('GD時の入り方', () => {
  it('GDの許容幅は値幅（ATR%）の半分を0.5%刻みで、1〜3%', () => {
    expect([null, 1, 2.4, 4, 8].map((x) => gapDownTolerancePct(x))).toEqual([1.5, 1, 1, 2, 3]);
  });

  it('古いデータ（gapDownRule なし）でも、表示前に補い、見送り条件にも大きなGDを足す', () => {
    const old = {
      ...dataset,
      candidates: dataset.candidates.map(({ entryPlan: { gapDownRule: _g, ...entryPlan }, risks, ...c }) => ({
        ...c,
        entryPlan,
        risks: { ...risks, skipConditions: risks.skipConditions.filter((s) => !/GD/.test(s)) },
      })),
    };
    const ranked = analyzeDataset(old, { scoring: DEFAULT_SCORING_CONFIG, pattern: findHoldingPattern('tue-fri'), topN: 6 }).ranked;
    for (const c of ranked) {
      expect(c.entryPlan.gapDownRule).toMatch(/^寄りでは買わず、寄り後15〜30分の下げ止まりとVWAP回復を確認。/);
      expect(c.entryPlan.gapDownRule).toMatch(/日経先物が−1\.5%超の下落なら、リバウンド狙いに切り替えず原則見送り。$/);
      expect(c.risks.skipConditions.filter((s) => /GD/.test(s))).toHaveLength(1);
    }
  });

  it('形の前提になる水準を割って寄ったら見送り（見送り条件と同じ水準）', () => {
    const ranked = analyze('tue-fri').ranked;
    const pullback = ranked.find((c) => c.risks.skipConditions.some((s) => s.startsWith('25日線')));
    expect(pullback?.entryPlan.gapDownRule).toMatch(/25日線（[\d,.]+円）を割って寄り付いたら見送り/);
  });

  it('新しく作る作戦には gapDownRule が入る', async () => {
    const { runPipeline, DEFAULT_PIPELINE_OPTIONS } = await import('../scripts/lib/pipeline');
    const { createProviderSet } = await import('../scripts/providers');
    const log = console.log;
    console.log = () => {};
    try {
      const mock = await runPipeline(createProviderSet('mock'), { ...DEFAULT_PIPELINE_OPTIONS, asOf: '2026-10-05' });
      expect(mock.candidates.every((c) => c.entryPlan.gapDownRule && c.risks.skipConditions.some((s) => /GD/.test(s)))).toBe(true);
    } finally {
      console.log = log;
    }
  });
});
