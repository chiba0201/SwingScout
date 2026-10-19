/** TodayMarket の外部指標・コメントからスイング側 MarketContext を作る。 */
import type { MarketContext, MarketEvent, Quote } from '../types/dataset';
import type { TodayMarket } from '../types/today';

const indexIds = new Set(['nikkei225', 'topix', 'growth250', 'sp500', 'nasdaq', 'dow', 'sox']);
const volatilityIds = new Set(['nikkeiVI', 'vix']);
const fxIds = new Set(['usdjpy', 'eurjpy']);
const rateIds = new Set(['us10y', 'jp10y']);

const pick = (quotes: Quote[], ids: Set<string>) => quotes.filter((q) => ids.has(q.id));

const toMarketEvent = (today: TodayMarket): MarketEvent[] =>
  today.events.map((e) => ({
    // 翌日早朝の米指標など、当日以外のイベントはその日付で
    date: e.date ?? today.asOf,
    time: e.time,
    label: e.label,
    category: e.category ?? 'other',
    importance: e.importance,
    note: e.note,
  }));

export function marketContextFromToday(today: TodayMarket, stance?: MarketContext['stance']): MarketContext {
  const q = today.externalQuotes;
  return {
    stance:
      stance ??
      (today.stance === '買い目線'
        ? 'bullish'
        : today.stance === 'リスクオフ'
          ? 'bearish'
          : 'neutral'),
    headline: today.headline,
    summaryToday: today.headline,
    // 今週の見通しはメモのまとめの「今週」だけ。無ければ空（今日の結論で埋めると、画面で同じ文が並ぶため）
    summaryWeek: today.weekOutlook ?? '',
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
    source: {
      kind: 'today',
      asOf: today.asOf,
      session: today.session,
      ...(today.checkedAt ? { checkedAt: today.checkedAt } : {}),
      reflectedAt: today.meta.generatedAt,
    },
  };
}
