/**
 * モックプロバイダ。外部通信なしで全ソースを埋める。
 * 実データ化するときは、このファイルを見本に各 Source を実装して providers/index.ts で差し替える。
 */
import {
  addBusinessDays,
  addDays,
  computeHoldingWindow,
  findHoldingPattern,
  nextBusinessDay,
  toTime,
  weekday,
} from '../../../src/lib/calendar';
import type { EarningsInfo, ISODate, MarginSnapshot } from '../../../src/types/dataset';
import type { Annotation, ProviderSet } from '../types';
import { buildMockMarketContext } from './market';
import { generateBars } from './synth';
import { MOCK_UNIVERSE } from './universe';

const byCode = new Map(MOCK_UNIVERSE.map((s) => [s.code, s]));

/** 基準日時点で公表済みの最新の信用残基準日（週末=金曜、翌週火曜公表） */
function latestMarginDate(asOf: ISODate): ISODate {
  let friday = asOf;
  while (weekday(friday) !== 5) friday = addDays(friday, -1);
  const published = nextBusinessDay(nextBusinessDay(friday));
  return toTime(published) <= toTime(asOf) ? friday : addDays(friday, -7);
}

export function createMockProviders(patternId?: string): ProviderSet {
  const pattern = findHoldingPattern(patternId);

  return {
    id: 'mock',
    isSample: true,
    universe: {
      id: 'mock-universe',
      getUniverse: async () =>
        MOCK_UNIVERSE.map(({ code, name, market, sector, theme }) => ({ code, name, market, sector, theme })),
    },
    prices: {
      id: 'mock-prices',
      getDailyBars: async (code, asOf, lookbackDays) => {
        const stock = byCode.get(code);
        return stock ? generateBars(stock, asOf, lookbackDays) : null;
      },
    },
    margin: {
      id: 'mock-margin',
      getMarginBalances: async (codes, asOf) => {
        const marginAsOf = latestMarginDate(asOf);
        const map = new Map<string, MarginSnapshot>();
        for (const code of codes) {
          const m = byCode.get(code)?.margin;
          if (!m) continue;
          const [buyBalance, sellBalance, buyBalancePrev, sellBalancePrev] = m;
          map.set(code, { asOf: marginAsOf, buyBalance, sellBalance, buyBalancePrev, sellBalancePrev });
        }
        return map;
      },
    },
    earnings: {
      id: 'mock-earnings',
      getEarnings: async (codes, asOf) => {
        const entry = computeHoldingWindow(asOf, pattern).entryDate;
        const map = new Map<string, EarningsInfo>();
        for (const code of codes) {
          const e = byCode.get(code)?.earnings;
          map.set(
            code,
            e
              ? {
                  nextDate: addBusinessDays(entry, e.offset),
                  timing: e.timing,
                  period: e.period,
                  lastSurprise: e.lastSurprise ?? null,
                  progressRate: e.progressRate,
                }
              : { nextDate: null, timing: 'unknown' },
          );
        }
        return map;
      },
    },
    disclosures: {
      id: 'mock-disclosures',
      getCatalysts: async (codes, from) => {
        const map = new Map(
          codes.map((code) => [
            code,
            (byCode.get(code)?.catalysts ?? []).map((c) => ({ ...c, date: from })),
          ]),
        );
        return map;
      },
    },
    market: {
      id: 'mock-market',
      getMarketContext: async (asOf) => buildMockMarketContext(asOf, pattern),
    },
    annotations: {
      id: 'mock-annotations',
      getAnnotations: async (codes) => {
        const map = new Map<string, Annotation>();
        for (const code of codes) {
          const s = byCode.get(code);
          if (!s) continue;
          map.set(code, {
            theme: s.theme,
            sensitivity: s.sensitivity,
            fundamentalNote: s.fundamentalNote,
            flags: s.flags,
          });
        }
        return map;
      },
    },
  };
}
