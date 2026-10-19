/** 指数・ボラ・為替・金利などの一覧（ダッシュボード・Today 共通） */
import { formatNumber, inferDecimals } from '../lib/format';
import type { Quote } from '../types/dataset';
import { Change, cx } from './ui';

/** ダッシュボードの表示順。重要なものを1行目に並べる。ここに無い id は末尾に追加される */
export const DASHBOARD_QUOTE_ORDER = [
  'nikkei225', 'topix', 'growth250', 'nikkeiVI', 'usdjpy', 'us10y',
  'sp500', 'nasdaq', 'sox', 'vix', 'eurjpy', 'jgb10y',
];

/** PC幅の列数。8件までは1行に収め、それより多ければ6列で折り返す（1件だけ次の行に残らないように） */
const LG_COLUMNS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
  7: 'lg:grid-cols-7',
  8: 'lg:grid-cols-8',
};

export function QuoteGrid({
  quotes,
  order,
  columns,
  label = '指数・為替・金利',
}: {
  quotes: Quote[];
  /** 指定すると id の順に並べ替える（未指定なら配列の順） */
  order?: string[];
  /** 未指定なら件数から決める */
  columns?: string;
  label?: string;
}) {
  const gridColumns = columns ?? `grid-cols-2 sm:grid-cols-4 ${LG_COLUMNS[quotes.length] ?? 'lg:grid-cols-6'}`;
  const rank = (q: Quote) => {
    const i = order?.indexOf(q.id) ?? -1;
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sorted = order ? [...quotes].sort((a, b) => rank(a) - rank(b)) : quotes;

  return (
    <section className="panel overflow-hidden" aria-label={label}>
      <ul className={cx('grid', gridColumns)}>
        {sorted.map((q) => {
          const digits = q.decimals ?? inferDecimals(q.value);
          // 金利・為替などは値幅で見せる。値幅が分からない（騰落率だけ）ときは騰落率
          const pointsOnly = (q.unit === '%' || q.polarity === 'neutral') && q.change !== 0;
          return (
            <li key={q.id} className="-mr-px -mb-px border-r border-b border-rule px-3 py-2.5">
              <div className="text-[11px] text-muted">{q.label}</div>
              <div className="text-[18px] leading-tight font-semibold tracking-tight text-ink">
                {formatNumber(q.value, digits)}
                {q.unit && <span className="ml-0.5 text-[12px] font-normal text-muted">{q.unit}</span>}
              </div>
              {q.changeUnknown ? (
                <span className="text-[11.5px] text-muted">前日比 —</span>
              ) : (
                <Change
                  value={q.change}
                  pct={pointsOnly ? undefined : q.changePct}
                  digits={Math.min(Math.max(digits, 1), 2)}
                  polarity={q.polarity}
                  className="text-[11.5px]"
                />
              )}
              {q.note && (
                <div className="mt-0.5 truncate text-[10.5px] text-muted" title={q.note}>
                  {q.note}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
