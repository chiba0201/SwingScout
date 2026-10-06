import { describe, expect, it } from 'vitest';
import { validateDataset } from '../src/lib/validate';
import { parseCsv } from '../scripts/lib/csv';
import { DEFAULT_PIPELINE_OPTIONS, runPipeline } from '../scripts/lib/pipeline';
import { createProviderSet } from '../scripts/providers';

describe('pipeline (mock)', () => {
  it('モックプロバイダから検証を通るデータセットを作る', async () => {
    const log = console.log;
    console.log = () => {};
    try {
      const dataset = await runPipeline(createProviderSet('mock'), { ...DEFAULT_PIPELINE_OPTIONS, asOf: '2026-10-05' });
      expect(() => validateDataset(dataset)).not.toThrow();
      expect(dataset.meta.isSample).toBe(true);
      expect(dataset.candidates).toHaveLength(12);
      for (const c of dataset.candidates) {
        expect(c.comments.supplyDemand).not.toBe('');
        expect(c.stopLoss.price).toBeLessThan(c.price.close);
        expect(c.takeProfit.targets[0]!.price).toBeGreaterThan(c.price.close);
        // 損切りはエントリーゾーンの下限より下
        if (c.entryPlan.zoneLow !== undefined) expect(c.stopLoss.price).toBeLessThan(c.entryPlan.zoneLow);
      }
    } finally {
      console.log = log;
    }
  });

  it('同じ基準日なら同じ結果（generatedAt 以外）', async () => {
    const log = console.log;
    console.log = () => {};
    try {
      const opts = { ...DEFAULT_PIPELINE_OPTIONS, asOf: '2026-10-05' };
      const a = await runPipeline(createProviderSet('mock'), opts);
      const b = await runPipeline(createProviderSet('mock'), opts);
      expect(a.candidates).toEqual(b.candidates);
    } finally {
      console.log = log;
    }
  });
});

describe('csv', () => {
  it('クォート・カンマ・改行を扱える', () => {
    expect(parseCsv('a,b\n"x,1","y""2"\r\n')).toEqual([
      ['a', 'b'],
      ['x,1', 'y"2'],
    ]);
  });
});
