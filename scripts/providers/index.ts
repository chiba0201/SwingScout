/**
 * プロバイダの組み立て。--provider で選ぶ。
 * 新しいデータ源を足すときは sources/ に実装を置き、ここで組み合わせを追加する。
 */
import { createMockProviders } from './mock';
import { CsvEarningsSource } from './sources/csvEarnings';
import { CsvPriceSource } from './sources/csvPrices';
import { JpxListingCsvSource } from './sources/jpxListing';
import { JpxMarginPdfSource } from './sources/jpxMargin';
import { JsonMarketSource } from './sources/jsonMarket';
import { TdnetDisclosureSource } from './sources/tdnet';
import { WatchlistCsvSource } from './sources/watchlistCsv';
import type { ProviderSet } from './types';

export const PROVIDER_IDS = ['mock', 'local', 'watchlist'] as const;
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
        margin: new JpxMarginPdfSource(),
        earnings: new CsvEarningsSource(),
        disclosures: new TdnetDisclosureSource(),
        market: new JsonMarketSource(),
      };
    case 'watchlist': {
      // JPX全銘柄一覧を用意する前に、raw-data/watchlist.csv の監視銘柄だけで始める構成
      const watchlist = new WatchlistCsvSource();
      return {
        id: 'watchlist',
        isSample: false,
        universe: watchlist,
        prices: new CsvPriceSource(),
        margin: new JpxMarginPdfSource(),
        earnings: new CsvEarningsSource(),
        disclosures: new TdnetDisclosureSource(),
        market: new JsonMarketSource(),
        annotations: watchlist,
      };
    }
  }
}
