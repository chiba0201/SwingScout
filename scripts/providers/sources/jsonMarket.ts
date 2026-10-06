/**
 * 地合いデータを手書きJSONから読む MarketSource。
 *
 * 置き場所: raw-data/market.json（形式は src/types/dataset.ts の MarketContext）
 * 雛形は data/mock-candidates.json の marketContext をコピーすると早い。
 * 将来は指数・為替を価格ソースから自動取得し、コメントだけ手書きにする構成を想定。
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { MarketContext } from '../../../src/types/dataset';
import type { MarketSource } from '../types';

export class JsonMarketSource implements MarketSource {
  readonly id = 'json-market';
  constructor(private readonly path = resolve('raw-data/market.json')) {}

  async getMarketContext(): Promise<MarketContext> {
    try {
      return JSON.parse(await readFile(this.path, 'utf8')) as MarketContext;
    } catch {
      throw new Error(`${this.path} を読めません。MarketContext 形式のJSONを用意してください。`);
    }
  }
}
