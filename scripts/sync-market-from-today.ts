/**
 * data/today-market.json の外部指標・市況コメントから raw-data/market.json を更新する。
 *
 * Today を毎朝実市況に更新したあと、週次スイング側の marketContext も同じ値に寄せるための補助。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { MarketContext, MarketEvent, Quote } from '../src/types/dataset';
import type { TodayMarket } from '../src/types/today';

const indexIds = new Set(['nikkei225', 'topix', 'growth250', 'sp500', 'nasdaq', 'dow', 'sox']);
const volatilityIds = new Set(['nikkeiVI', 'vix']);
const fxIds = new Set(['usdjpy', 'eurjpy']);
const rateIds = new Set(['us10y', 'jp10y']);

const pick = (quotes: Quote[], ids: Set<string>) => quotes.filter((q) => ids.has(q.id));
const toMarketEvent = (today: TodayMarket): MarketEvent[] =>
  today.events.map((e) => ({
    date: today.asOf,
    time: e.time,
    label: e.label,
    category: e.category ?? 'other',
    importance: e.importance,
    note: e.note,
  }));

async function main() {
  const { values } = parseArgs({
    options: {
      today: { type: 'string', default: 'data/today-market.json' },
      out: { type: 'string', default: 'raw-data/market.json' },
      stance: { type: 'string' },
    },
  });

  const today = JSON.parse(await readFile(resolve(values.today), 'utf8')) as TodayMarket;
  const q = today.externalQuotes;
  const market: MarketContext = {
    stance:
      values.stance === 'bullish' || values.stance === 'bearish' || values.stance === 'neutral'
        ? values.stance
        : today.stance === '買い目線'
          ? 'bullish'
          : today.stance === 'リスクオフ'
            ? 'bearish'
            : 'neutral',
    headline: today.headline,
    summaryToday: today.expectedOpen.note ?? today.headline,
    summaryWeek: today.domesticNotes.slice(0, 2).join('。') || today.headline,
    indices: pick(q, indexIds),
    volatility: pick(q, volatilityIds),
    fx: pick(q, fxIds),
    rates: pick(q, rateIds),
    events: toMarketEvent(today),
    sectors: [],
    riskNotes: [
      today.positionSize.reason,
      ...today.domesticNotes.filter((x) => /注意|確認|警戒|持ち高|決算|SQ/.test(x)),
    ].filter((x): x is string => Boolean(x)),
  };

  const out = resolve(values.out);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(market, null, 2)}\n`);
  console.log(`[market:from-today] 書き出し: ${values.out}`);
}

main().catch((e: unknown) => {
  console.error(`[market:from-today] 失敗: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
