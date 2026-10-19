/**
 * 今日の監視銘柄（スイング上位候補 × 今日の地合いで「今日の扱い」を表示）。
 * 朝に一覧で見渡せるよう、理由・注意点は既定で2行に収め、ボタンで全文表示に切り替える。
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { formatScore } from '../lib/format';
import { WATCH_ACTION_LABELS, type WatchAction, type WatchItem } from '../lib/todayAnalysis';
import { PickRoleBadge } from './TodayMemoBoards';
import { ChangePct, cx } from './ui';

const ACTION_CLASS: Record<WatchAction, string> = {
  'chase-ok': 'bg-accent text-panel border-accent',
  'wait-pullback': 'bg-accent-soft text-accent border-accent/50',
  skip: 'bg-caution-soft text-caution border-caution/50',
};

export function WatchActionBadge({ action }: { action: WatchAction }) {
  return (
    <span
      className={cx(
        'inline-block rounded-sm border px-1.5 py-px text-[11.5px] font-bold whitespace-nowrap',
        ACTION_CLASS[action],
      )}
    >
      {WATCH_ACTION_LABELS[action]}
    </span>
  );
}

function Cautions({ items, expanded }: { items: string[]; expanded: boolean }) {
  if (!expanded) {
    // 折りたたみ時は1段落にまとめて2行で切る（全文は title とボタンで確認できる）
    return (
      <p className="line-clamp-2 text-[12px] leading-snug text-ink-2" title={items.join('\n')}>
        {items.join(' ／ ')}
      </p>
    );
  }
  return (
    <ul className="space-y-0.5 text-[12px] text-ink-2">
      {items.map((c) => (
        <li key={c} className="flex gap-1">
          <span className="text-muted" aria-hidden>
            ・
          </span>
          {c}
        </li>
      ))}
    </ul>
  );
}

export function TodayWatchlist({
  items,
  openBasis = 'expected',
}: {
  items: WatchItem[];
  openBasis?: 'actual' | 'expected' | 'unknown';
}) {
  const [expanded, setExpanded] = useState(false);
  const clamp = expanded ? '' : 'line-clamp-2';

  return (
    <section className="panel overflow-hidden" aria-labelledby="today-watchlist">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id="today-watchlist" className="text-[13px] font-bold">
            今日の監視銘柄
          </h2>
          <span className="text-[11.5px] text-muted">
            スイング上位候補（＋市況メモの本線・確認後）× 今日の地合い・{openBasis === 'actual' ? '実際の寄り' : openBasis === 'unknown' ? '想定寄り（未確認）' : '想定寄り'}・日経VIで簡易判定
          </span>
        </div>
        <button
          type="button"
          aria-pressed={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="text-[12px] font-semibold text-accent hover:underline"
        >
          {expanded ? '理由・注意点を短く表示' : '理由・注意点をすべて表示'}
        </button>
      </header>

      {/* PC */}
      <div className="relative hidden overflow-x-auto md:block">
        <table className="data-table [&_td]:py-2">
          <thead>
            <tr>
              <th className="w-10 text-right">順位</th>
              <th>銘柄</th>
              <th>今日の扱い</th>
              <th>理由</th>
              <th>注意点</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ candidate: c, action, reason, cautions, memoRole, origin }) => (
              <tr key={c.code} className={cx('align-top', origin === 'memo' && 'bg-panel-2/60')}>
                <td className="num text-right text-[14px] font-semibold text-ink-2">
                  {c.rank}
                  {origin === 'memo' && <div className="text-[10px] font-normal text-muted">メモ</div>}
                </td>
                <td className="min-w-[11rem] whitespace-nowrap">
                  <Link to={`/candidates/${c.code}`} className="font-semibold hover:text-accent hover:underline">
                    <span className="num mr-1.5 text-[12px] font-medium text-ink-2">{c.code}</span>
                    {c.name}
                  </Link>
                  <div className="text-[11.5px] text-muted">
                    総合<span className="num">{formatScore(c.scores.total)}</span> ・ リスク
                    <span className="num">{formatScore(c.scores.risk)}</span> ・ 前日比 <ChangePct pct={c.price.changePct} />
                  </div>
                </td>
                <td>
                  <div className="flex flex-col items-start gap-1">
                    <WatchActionBadge action={action} />
                    {memoRole && (
                      <span className="flex items-center gap-1 text-[10.5px] text-muted">
                        メモ <PickRoleBadge role={memoRole} />
                      </span>
                    )}
                  </div>
                </td>
                <td className="max-w-[18rem] text-[12.5px]">
                  <p className={cx('leading-snug', clamp)} title={reason}>
                    {reason}
                  </p>
                </td>
                <td className="min-w-[16rem]">
                  <Cautions items={cautions} expanded={expanded} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* スマホ */}
      <ol className="divide-y divide-rule md:hidden">
        {items.map(({ candidate: c, action, reason, cautions, memoRole, origin }) => (
          <li key={c.code} className={cx('px-4 py-3', origin === 'memo' && 'bg-panel-2/60')}>
            <div className="flex items-start justify-between gap-2">
              <Link to={`/candidates/${c.code}`} className="font-semibold">
                <span className="num mr-1 text-[12px] text-ink-2">{c.rank}.</span>
                <span className="num mr-1.5 text-[12px] font-medium text-ink-2">{c.code}</span>
                {c.name}
              </Link>
              <span className="flex shrink-0 items-center gap-1">
                {memoRole && <PickRoleBadge role={memoRole} />}
                <WatchActionBadge action={action} />
              </span>
            </div>
            <p className={cx('mt-1 text-[12.5px] leading-snug', clamp)}>{reason}</p>
            <div className="mt-1">
              <Cautions items={cautions} expanded={expanded} />
            </div>
          </li>
        ))}
      </ol>

      <p className="border-t border-rule px-4 py-2 text-[11px] text-muted">
        判定：リスクオフ・リスクスコア基準超・本日決算 → 見送り ／ 急騰翌日・想定GUが許容超・GD想定・日経VI高め・スタンス・押し目型 → 押し目待ち ／
        それ以外 → 寄り追いOK。市況メモの「避ける」は見送り、「待機」「確認後」は寄り追いにしない（閾値は src/lib/todayAnalysis.ts と today-market.json の watchlistRules）
      </p>
    </section>
  );
}
