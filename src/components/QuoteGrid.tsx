/** 指数・ボラ・為替・金利などの一覧（ダッシュボード・Today 共通） */
import { formatNumber, inferDecimals } from '../lib/format';
import type { Quote } from '../types/dataset';
import { Change, cx } from './ui';

/** ダッシュボードの表示順。重要なものを1行目に並べる。ここに無い id は末尾に追加される */
export const DASHBOARD_QUOTE_ORDER = [
  'nikkei225', 'topix', 'growth250', 'nikkeiVI', 'usdjpy', 'us10y',
  'sp500', 'nasdaq', 'sox', 'vix', 'eurjpy', 'jgb10y',
];

export function QuoteGrid({
  quotes,
  order,
  columns = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
  label = '指数・為替・金利',
}: {
  quotes: Quote[];
  /** 指定すると id の順に並べ替える（未指定なら配列の順） */
  order?: string[];
  columns?: string;
  label?: string;
}) {
  const rank = (q: Quote) => {
    const i = order?.indexOf(q.id) ?? -1;
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sorted = order ? [...quotes].sort((a, b) => rank(a) - rank(b)) : quotes;

  return (
    <section className="panel overflow-hidden" aria-label={label}>
      <ul className={cx('grid', columns)}>
        {sorted.map((q) => {
          const digits = q.decimals ?? inferDecimals(q.value);
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
                digits={Math.min(Math.max(digits, 1), 2)}
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
