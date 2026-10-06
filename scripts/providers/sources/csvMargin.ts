/**
 * 銘柄別信用残をCSVから読む。
 *
 * 置き場所: raw-data/margin.csv
 * 列: code, asOf, buyBalance, sellBalance, buyBalancePrev, sellBalancePrev
 */
import { resolve } from 'node:path';
import type { MarginSnapshot } from '../../../src/types/dataset';
import { readCsvRecords } from '../../lib/csv';
import { JpxMarginPdfSource } from './jpxMargin';
import type { MarginSource } from '../types';

const numberValue = (value: string | undefined) => {
  const parsed = Number((value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export class CsvMarginSource implements MarginSource {
  readonly id = 'csv-margin';
  constructor(
    private readonly path = resolve('raw-data/margin.csv'),
    private readonly fallback: MarginSource = new JpxMarginPdfSource(),
  ) {}

  async getMarginBalances(codes: string[], asOf: string): Promise<Map<string, MarginSnapshot>> {
    const records = await readCsvRecords(this.path);
    if (!records) return this.fallback.getMarginBalances(codes, asOf);

    const wanted = new Set(codes);
    const out = new Map<string, MarginSnapshot>();
    for (const r of records) {
      const code = r.code ?? r['コード'] ?? '';
      if (!wanted.has(code)) continue;
      const buyBalance = numberValue(r.buyBalance ?? r['買残']);
      const sellBalance = numberValue(r.sellBalance ?? r['売残']);
      const buyBalancePrev = numberValue(r.buyBalancePrev ?? r['前週買残']);
      const sellBalancePrev = numberValue(r.sellBalancePrev ?? r['前週売残']);
      if (
        buyBalance === null ||
        sellBalance === null ||
        buyBalancePrev === null ||
        sellBalancePrev === null
      ) {
        console.warn(`[csv-margin] ${code}: 信用残の数値が不完全なためスキップします`);
        continue;
      }
      out.set(code, {
        asOf: r.asOf ?? r['基準日'] ?? asOf,
        buyBalance,
        sellBalance,
        buyBalancePrev,
        sellBalancePrev,
      });
    }
    return out;
  }
}
