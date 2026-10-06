/**
 * 決算予定日のCSVを読む EarningsSource。
 *
 * 置き場所: raw-data/earnings.csv
 * 列: code, date(YYYY-MM-DD), timing(pre-market|intraday|after-close|unknown), period
 * 入手元の例: JPX「決算発表予定日」一覧、各社IR。
 * 進捗率・サプライズは EDINET 等から別ソースで補う（sources/edinet.ts）。
 */
import { resolve } from 'node:path';
import type { EarningsInfo, EarningsTimingOfDay } from '../../../src/types/dataset';
import { readCsvRecords } from '../../lib/csv';
import type { EarningsSource } from '../types';

const TIMINGS: EarningsTimingOfDay[] = ['pre-market', 'intraday', 'after-close', 'unknown'];

export class CsvEarningsSource implements EarningsSource {
  readonly id = 'csv-earnings';
  constructor(private readonly path = resolve('raw-data/earnings.csv')) {}

  async getEarnings(codes: string[]): Promise<Map<string, EarningsInfo>> {
    const records = (await readCsvRecords(this.path)) ?? [];
    const byCode = new Map(records.map((r) => [r.code ?? '', r]));
    return new Map(
      codes.map((code) => {
        const r = byCode.get(code);
        const timing = TIMINGS.find((t) => t === r?.timing) ?? 'unknown';
        return [code, r?.date ? { nextDate: r.date, timing, period: r.period || undefined } : { nextDate: null, timing: 'unknown' }];
      }),
    );
  }
}
