/** 指数・ボラ・為替・金利の一覧。重要なものを1行目に並べる */
import { formatNumber } from '../lib/format';
import type { MarketContext, Quote } from '../types/dataset';
import { Change } from './ui';

/** 表示順。ここに無い id は末尾に追加される */
const PRIORITY = ['nikkei225', 'topix', 'growth250', 'nikkeiVI', 'usdjpy', 'us10y', 'sp500', 'nasdaq', 'sox', 'vix', 'eurjpy', 'jgb10y'];

export function QuoteGrid({ market }: { market: MarketContext }) {
  const all = [...market.indices, ...market.volatility, ...market.fx, ...market.rates];
  const rank = (q: Quote) => {
    const i = PRIORITY.indexOf(q.id);
    return i === -1 ? PRIORITY.length : i;
  };
  const quotes = [...all].sort((a, b) => rank(a) - rank(b));

  return (
    <section className="panel overflow-hidden" aria-label="指数・為替・金利">
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {quotes.map((q) => {
          const digits = q.decimals ?? 0;
          const pointsOnly = q.unit === '%' || q.polarity === 'neutral';
          return (
            <li key={q.id} className="-mr-px -mb-px border-r border-b border-rule px-3 py-2.5">
              <div className="text-[11px] text-muted">{q.label}</div>
              <div className="text-[18px] leading-tight font-semibold tracking-tight text-ink">
                {formatNumber(q.value, digits)}
                {q.unit && <span className="ml-0.5 text-[12px] font-normal text-muted">{q.unit}</span>}
              </div>
              <Change
                value={q.change}
                pct={pointsOnly ? undefined : q.changePct}
                digits={Math.max(digits, 1) > 2 ? 2 : Math.max(digits, 1)}
                polarity={q.polarity}
                className="text-[11.5px]"
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
