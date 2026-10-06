/**
 * 日足CSV（yfinance 相当）を読む PriceSource。ネットワークには出ない。
 *
 * 置き場所: raw-data/prices/<code>.csv
 * 形式: yfinance の DataFrame.to_csv() と同じ列（Date, Open, High, Low, Close, Volume）
 *
 * 例（Python, ローカルで実行）:
 *   import yfinance as yf
 *   yf.download("7203.T", period="2y", auto_adjust=False).droplevel(1, axis=1).to_csv("raw-data/prices/7203.csv")
 */
import { resolve } from 'node:path';
import type { DailyBar } from '../../../src/lib/indicators';
import type { ISODate } from '../../../src/types/dataset';
import { readCsvRecords } from '../../lib/csv';
import type { PriceSource } from '../types';

export class CsvPriceSource implements PriceSource {
  readonly id = 'csv-prices';
  constructor(private readonly dir = resolve('raw-data/prices')) {}

  async getDailyBars(code: string, asOf: ISODate, lookbackDays: number): Promise<DailyBar[] | null> {
    const records = await readCsvRecords(resolve(this.dir, `${code}.csv`));
    if (!records) return null;
    const bars = records
      .map((r) => ({
        date: (r.Date ?? r.date ?? '').slice(0, 10),
        open: Number(r.Open ?? r.open),
        high: Number(r.High ?? r.high),
        low: Number(r.Low ?? r.low),
        close: Number(r.Close ?? r.close),
        volume: Number(r.Volume ?? r.volume),
      }))
      .filter((b) => b.date && b.date <= asOf && Number.isFinite(b.close) && b.volume > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    return bars.slice(-lookbackDays);
  }
}
