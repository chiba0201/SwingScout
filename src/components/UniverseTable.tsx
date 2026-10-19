/**
 * 候補一覧の「全銘柄」：銘柄リストのすべての銘柄と、その採点状況。★でお気に入りを付け外しする。
 * PC はテーブル、スマホは1銘柄1行のリストで表示する。
 */
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { formatPrice, formatScore } from '../lib/format';
import {
  filterUniverseRows,
  sortUniverseRows,
  UNIVERSE_STATUS_HINT,
  UNIVERSE_STATUS_LABEL,
  type UniverseListRow,
  type UniverseRowStatus,
  type UniverseSort,
} from '../lib/universeRows';
import { FavoriteToggle } from './FavoriteToggle';
import { ChangePct, cx, ScoreBar } from './ui';

const STATUS_CLASS: Record<UniverseRowStatus, string> = {
  top: 'bg-accent text-panel',
  scored: 'border border-rule-strong text-ink-2',
  filtered: 'border border-dashed border-rule-strong text-muted',
  'no-prices': 'bg-caution-soft text-caution',
  'not-generated': 'bg-panel-2 text-muted',
};

function StatusBadge({ status }: { status: UniverseRowStatus }) {
  return (
    <span
      className={cx('inline-block rounded-sm px-1.5 py-px text-[11px] font-semibold whitespace-nowrap', STATUS_CLASS[status])}
      title={UNIVERSE_STATUS_HINT[status]}
    >
      {UNIVERSE_STATUS_LABEL[status]}
    </span>
  );
}

function NameCell({ row, from }: { row: UniverseListRow; from: string }) {
  const label = (
    <>
      <span className="num mr-1.5 text-[12px] font-medium text-ink-2">{row.code}</span>
      {row.name}
    </>
  );
  return (
    <div className="min-w-0">
      {row.candidate ? (
        <Link
          to={`/candidates/${row.code}`}
          state={{ from }}
          className="font-semibold text-ink hover:text-accent hover:underline hover:underline-offset-2"
        >
          {label}
        </Link>
      ) : (
        <span className="font-semibold text-ink">{label}</span>
      )}
      <div className="truncate text-[11.5px] text-muted">
        {row.sector}
        {(row.candidate?.theme ?? row.theme) && (row.candidate?.theme ?? row.theme) !== row.sector && `・${row.candidate?.theme ?? row.theme}`}
      </div>
    </div>
  );
}

const SORTS: { id: UniverseSort; label: string }[] = [
  { id: 'rank', label: '順位順' },
  { id: 'code', label: 'コード順' },
];

export function UniverseTable({ rows }: { rows: UniverseListRow[] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const from = `${location.pathname}${location.search}`;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<UniverseSort>('rank');
  const shown = useMemo(() => filterUniverseRows(sortUniverseRows(rows, sort), query), [rows, sort, query]);

  return (
    <section className="panel overflow-hidden" aria-label="全銘柄の一覧">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-3 py-2">
        <input
          type="search"
          className="field w-full min-w-0 sm:w-64"
          placeholder="コード・銘柄名・業種で絞り込み"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="銘柄を絞り込む"
        />
        <div role="radiogroup" aria-label="並び順" className="inline-flex rounded border border-rule-strong bg-panel p-0.5">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={sort === s.id}
              onClick={() => setSort(s.id)}
              className={cx(
                'rounded-sm px-3 py-1 text-[12px] font-semibold',
                sort === s.id ? 'bg-accent text-panel' : 'text-ink-2 hover:text-ink',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px] text-muted" aria-live="polite">
          {query ? (
            <>
              <span className="num">{rows.length}</span>銘柄中 <span className="num">{shown.length}</span>件
            </>
          ) : (
            <>
              <span className="num">{rows.length}</span>銘柄
            </>
          )}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted">
          {rows.length === 0 ? '銘柄リストが空です。データ更新でCSVを入稿してください。' : '条件に合う銘柄がありません。'}
        </p>
      ) : (
        <>
          {/* PC: テーブル */}
          <div className="relative hidden overflow-x-auto md:block">
            {/* 数百行になるので、ほかの一覧より行を詰める */}
            <table className="data-table [&_td]:py-1.5">
              <thead>
                <tr>
                  <th className="w-10 text-center">
                    <span aria-hidden>★</span>
                    <span className="sr-only">お気に入り</span>
                  </th>
                  <th className="w-12 text-right">順位</th>
                  <th>銘柄</th>
                  <th className="text-right">終値 / 前日比</th>
                  <th>総合</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr
                    key={row.code}
                    className={cx(row.candidate && 'cursor-pointer hover:bg-panel-2')}
                    onClick={(e) => {
                      if (!row.candidate || (e.target as HTMLElement).closest('a, label, input, button')) return;
                      navigate(`/candidates/${row.code}`, { state: { from } });
                    }}
                  >
                    <td className="text-center">
                      <FavoriteToggle code={row.code} name={row.name} />
                    </td>
                    <td className="num text-right text-[14px] font-semibold text-ink-2">{row.candidate?.rank ?? '—'}</td>
                    <td className="max-w-[20rem]">
                      <NameCell row={row} from={from} />
                    </td>
                    <td className="text-right">
                      {row.candidate ? (
                        <>
                          <div className="num">{formatPrice(row.candidate.price.close)}</div>
                          <ChangePct pct={row.candidate.price.changePct} className="text-[11.5px]" />
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {row.candidate ? (
                        <div className="flex items-center gap-2">
                          <span className="num w-7 text-right text-[14px] font-semibold text-ink">
                            {formatScore(row.candidate.scores.total)}
                          </span>
                          <ScoreBar value={row.candidate.scores.total} className="w-14" />
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* スマホ: リスト */}
          <ul className="divide-y divide-rule md:hidden">
            {shown.map((row) => (
              <li key={row.code} className="flex items-center gap-2 py-2 pr-4 pl-2">
                <FavoriteToggle code={row.code} name={row.name} />
                <div className="min-w-0 flex-1">
                  <NameCell row={row} from={from} />
                </div>
                <div className="shrink-0 text-right">
                  {row.candidate ? (
                    <>
                      <div className="text-[12px] text-ink-2">
                        <span className="num font-semibold">{row.candidate.rank}</span>位
                        <span className="num ml-1.5 text-[15px] font-semibold text-ink">{formatScore(row.candidate.scores.total)}</span>
                      </div>
                      {row.status === 'top' && <StatusBadge status={row.status} />}
                    </>
                  ) : (
                    <StatusBadge status={row.status} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
