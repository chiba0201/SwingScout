/**
 * 今週の作戦ボード：保有ウィンドウ（IN→OUT）とイベントを1週間の帯で見せる。
 * 「火曜In金曜out の間に何が起きるか」を一目で確認するための画面の主役。
 */
import { Link } from 'react-router';
import type { CalendarEvent, DatasetAnalysis } from '../lib/analysis';
import { formatDateJa, holidayName, isWithinWindow, toTime, weekdayJa } from '../lib/calendar';
import { EVENT_CATEGORY_LABELS, IMPORTANCE_LABELS } from '../lib/market';
import type { ISODate, MarketEventCategory } from '../types/dataset';
import { ProvisionalBadge, ProvisionalNote } from './PlanStatus';
import { cx } from './ui';

const CATEGORY_SHORT: Record<MarketEventCategory, string> = {
  sq: 'SQ',
  'us-macro': '米',
  'jp-macro': '日',
  'central-bank': '中銀',
  earnings: '決算',
  holiday: '休場',
  other: '他',
};

function EventItem({ e, showDate }: { e: CalendarEvent; showDate?: boolean }) {
  const mark = e.importance === 'high' ? '●' : e.importance === 'medium' ? '○' : '·';
  const label = (
    <span
      className={cx(
        e.importance === 'high' ? 'font-semibold text-ink' : e.importance === 'medium' ? 'text-ink' : 'text-ink-2',
      )}
    >
      {e.label}
    </span>
  );
  return (
    <li className="py-1 leading-snug" title={e.note}>
      <div className="flex items-center gap-1.5 text-[10.5px] text-muted">
        <span className={cx('w-2.5 text-center', e.importance === 'high' && 'text-caution')} aria-hidden>
          {mark}
        </span>
        <span className="sr-only">重要度{IMPORTANCE_LABELS[e.importance]}</span>
        {(showDate || e.time) && (
          <span className="num">
            {showDate && `${formatDateJa(e.date)} `}
            {e.time ?? ''}
          </span>
        )}
        <span className="rounded-[3px] border border-rule-strong px-1 leading-[1.4] text-ink-2" title={EVENT_CATEGORY_LABELS[e.category]}>
          {CATEGORY_SHORT[e.category]}
        </span>
      </div>
      <div className="pl-4 text-[12px]">
        {e.code ? (
          <Link to={`/candidates/${e.code}`} className="underline decoration-rule-strong underline-offset-2 hover:decoration-accent">
            {label}
          </Link>
        ) : (
          label
        )}
      </div>
    </li>
  );
}

type Role = 'asOf' | 'entry' | 'exit' | 'hold' | 'closed' | null;

function roleOf(date: ISODate, a: DatasetAnalysis): Role {
  if (holidayName(date)) return 'closed';
  if (date === a.window.entryDate) return 'entry';
  if (date === a.window.exitDate) return 'exit';
  if (isWithinWindow(date, a.window)) return 'hold';
  if (date === a.dataset.asOf) return 'asOf';
  return null;
}

const ROLE_CHIP: Record<Exclude<Role, null>, { text: string; className: string }> = {
  entry: { text: 'IN 寄り', className: 'bg-accent text-panel border-accent' },
  exit: { text: 'OUT 大引けまで', className: 'border-accent text-accent bg-panel' },
  hold: { text: '保有', className: 'border-transparent text-accent' },
  asOf: { text: '基準日', className: 'border-rule-strong text-ink-2 bg-panel-2' },
  closed: { text: '休場', className: 'border-rule-strong text-muted bg-panel-2' },
};

export function WeekBoard({ analysis: a }: { analysis: DatasetAnalysis }) {
  const w = a.window;
  const lastWeekday = w.weekDays[w.weekDays.length - 1]!;
  const after = a.events.filter((e) => toTime(e.date) > toTime(lastWeekday));

  return (
    <section className="panel overflow-hidden" aria-labelledby="board-title">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-2.5">
        <h2 id="board-title" className="text-[13px] font-bold">
          今週の作戦ボード
          <span className="ml-2 font-normal text-ink-2">{w.pattern.label}</span>
          <ProvisionalBadge a={a} />
        </h2>
        <p className="text-[12px] text-muted">
          <span className="num">{formatDateJa(w.entryDate)}</span> 寄り →{' '}
          <span className="num">{formatDateJa(w.exitDate)}</span> 大引け ・ {w.holdingDays.length}営業日
        </p>
      </header>
      <ProvisionalNote a={a} className="mx-4 mt-3" />

      <ol className="grid grid-cols-1 md:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,0.9fr)]">
        {w.weekDays.map((date) => {
          const role = roleOf(date, a);
          const inWindow = isWithinWindow(date, w) && role !== 'closed';
          const events = a.events.filter((e) => e.date === date && e.category !== 'holiday');
          return (
            <li
              key={date}
              className={cx(
                'relative flex border-b border-rule md:block md:border-r md:border-b-0',
                role === 'closed' && 'bg-panel-2',
              )}
            >
              {/* 保有の帯：PCは上辺の横帯、スマホは左辺の縦帯 */}
              <div
                className={cx(
                  'w-1 shrink-0 md:h-1.5 md:w-auto',
                  inWindow ? 'bg-accent' : 'bg-transparent md:bg-rule',
                  date === w.entryDate && 'md:ml-1 md:rounded-l-full',
                  date === w.exitDate && 'md:mr-1 md:rounded-r-full',
                )}
                aria-hidden
              />
              <div className="flex min-w-0 flex-1 gap-3 px-3 py-2.5 md:block">
                <div className="w-20 shrink-0 md:mb-2 md:flex md:w-auto md:items-baseline md:justify-between md:gap-2">
                  <div className="flex items-baseline gap-1">
                    <span className="num text-[15px] font-semibold text-ink">{formatDateJa(date, false)}</span>
                    <span className="text-[12px] text-ink-2">{weekdayJa(date)}</span>
                  </div>
                  {role && (
                    <span
                      className={cx(
                        'mt-1 inline-block rounded-sm border px-1.5 text-[10.5px] leading-[1.6] font-bold whitespace-nowrap md:mt-0',
                        ROLE_CHIP[role].className,
                      )}
                    >
                      {ROLE_CHIP[role].text}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {role === 'closed' && <p className="text-[12px] text-muted">{holidayName(date)}</p>}
                  {events.length > 0 ? (
                    <ul>
                      {events.map((e, i) => (
                        <EventItem key={`${e.label}-${i}`} e={e} />
                      ))}
                    </ul>
                  ) : (
                    role !== 'closed' && <p className="py-1 text-[12px] text-muted">登録イベントなし</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}

        <li className="flex border-rule bg-panel-2/60 md:block">
          <div className="w-1 shrink-0 md:h-1.5 md:w-auto" aria-hidden />
          <div className="flex min-w-0 flex-1 gap-3 px-3 py-2.5 md:block">
            <div className="w-20 shrink-0 md:mb-2">
              <span className="text-[12px] font-bold text-ink-2">OUT後</span>
              {w.closedDaysAfterExit > 2 && (
                <span className="mt-1 block text-[10.5px] font-bold text-caution md:mt-0 md:ml-1.5 md:inline">
                  {w.closedDaysAfterExit}日間休場
                </span>
              )}
            </div>
            <ul className="min-w-0 flex-1">
              {after.length > 0 ? (
                after.map((e, i) => <EventItem key={`${e.label}-${i}`} e={e} showDate />)
              ) : (
                <li className="py-1 text-[12px] text-muted">登録イベントなし</li>
              )}
            </ul>
          </div>
        </li>
      </ol>

      <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-rule px-4 py-2 text-[11px] text-muted">
        <span>
          <span className="text-caution">●</span> 重要度高　○ 中　· 低
        </span>
        <span>カテゴリ：米＝米国指標　日＝国内指標　中銀＝金融政策</span>
        <span>SQ・休場・候補銘柄の決算は自動で追加</span>
      </footer>
    </section>
  );
}
