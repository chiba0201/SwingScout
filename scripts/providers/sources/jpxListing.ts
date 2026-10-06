/**
 * JPX「東証上場銘柄一覧」（data_j.xls）を CSV に変換したものを読む。
 *
 * 入手: https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
 * 変換: Excel 等で CSV(UTF-8) 保存し raw-data/jpx/listing.csv に置く
 *       （将来は xlsx パッケージで .xls を直接読む実装に置き換えてもよい）
 * 期待する列: コード, 銘柄名, 市場・商品区分, 33業種区分
 */
import { resolve } from 'node:path';
import { readCsvRecords } from '../../lib/csv';
import type { UniverseEntry, UniverseSource } from '../types';

const TARGET_MARKETS = ['プライム（内国株式）', 'スタンダード（内国株式）', 'グロース（内国株式）'];

export class JpxListingCsvSource implements UniverseSource {
  readonly id = 'jpx-listing-csv';
  constructor(private readonly path = resolve('raw-data/jpx/listing.csv')) {}

  async getUniverse(): Promise<UniverseEntry[]> {
    const records = await readCsvRecords(this.path);
    if (!records) throw new Error(`${this.path} がありません。JPXの上場銘柄一覧をCSVで保存してください。`);
    return records
      .filter((r) => TARGET_MARKETS.includes(r['市場・商品区分'] ?? ''))
      .map((r) => ({
        code: r['コード'] ?? '',
        name: r['銘柄名'] ?? '',
        market: (r['市場・商品区分'] ?? '').replace('（内国株式）', ''),
        sector: r['33業種区分'] ?? '',
      }))
      .filter((e) => e.code && e.name);
  }
}
