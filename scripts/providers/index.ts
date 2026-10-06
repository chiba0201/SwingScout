/**
 * プロバイダの組み立て。--provider で選ぶ。
 * 新しいデータ源を足すときは sources/ に実装を置き、ここで組み合わせを追加する。
 */
import { createMockProviders } from './mock';
import { resolve } from 'node:path';
import { CsvEarningsSource } from './sources/csvEarnings';
import { CsvMarginSource } from './sources/csvMargin';
import { CsvPriceSource } from './sources/csvPrices';
import { JpxListingCsvSource } from './sources/jpxListing';
import { JsonMarketSource } from './sources/jsonMarket';
import { TdnetDisclosureSource } from './sources/tdnet';
import { WatchlistCsvSource } from './sources/watchlistCsv';
import type { ProviderSet } from './types';

export const PROVIDER_IDS = ['mock', 'local', 'watchlist', 'universe'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function createProviderSet(id: ProviderId, patternId?: string): ProviderSet {
  switch (id) {
    case 'mock':
      return createMockProviders(patternId);
    case 'local':
      // raw-data/ に置いたローカルファイルだけで組み立てる構成（外部通信なし）
      return {
        id: 'local',
        isSample: false,
        universe: new JpxListingCsvSource(),
        prices: new CsvPriceSource(),
        margin: new CsvMarginSource(),
        earnings: new CsvEarningsSource(),
        disclosures: new TdnetDisclosureSource(),
        market: new JsonMarketSource(),
      };
    case 'watchlist': {
      const watchlist = new WatchlistCsvSource();
      return {
        id: 'watchlist',
        isSample: false,
        universe: watchlist,
        prices: new CsvPriceSource(),
        margin: new CsvMarginSource(),
        earnings: new CsvEarningsSource(),
        disclosures: new TdnetDisclosureSource(),
        market: new JsonMarketSource(),
        annotations: watchlist,
      };
    }
    case 'universe': {
      // 代表銘柄ユニバース（raw-data/universe.csv）からスイング候補を選定する構成
      const universe = new WatchlistCsvSource(resolve('raw-data/universe.csv'));
      return {
        id: 'universe',
        isSample: false,
        universe,
        prices: new CsvPriceSource(),
        margin: new CsvMarginSource(),
        earnings: new CsvEarningsSource(),
        disclosures: new TdnetDisclosureSource(),
        market: new JsonMarketSource(),
        annotations: universe,
      };
    }
  }
}
