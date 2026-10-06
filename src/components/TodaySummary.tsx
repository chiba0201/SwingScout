/**
 * 今日の結論。Today 画面ではフル表示、ダッシュボードでは1段の要約カード。
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { formatDateJa } from '../lib/calendar';
import { formatPct } from '../lib/format';
import type { TodayAnalysis } from '../lib/todayAnalysis';
import type { TodayLoadState } from '../state/DataContext';
import type { TodayStance } from '../types/today';
import { cx, directionClass } from './ui';

const STANCE_CLASS: Record<string, string> = {
  買い目線: 'border-up/40 bg-up-soft text-up',
  リスクオフ: 'border-down/40 bg-down-soft text-down',
};

export function TodayStanceBadge({ stance, size = 'md' }: { stance: TodayStance; size?: 'md' | 'lg' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-sm border font-bold whitespace-nowrap',
        size === 'lg' ? 'px-2.5 py-0.5 text-[16px]' : 'px-2 py-0.5 text-[12px]',
        STANCE_CLASS[stance] ?? 'border-rule-strong bg-panel-2 text-ink-2',
      )}
    >
      {stance}
    </span>
  );
}

function updatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
}

function Gap({ pct }: { pct: number }) {
  return <span className={cx('num font-semibold', directionClass(pct))}>{formatPct(pct)}</span>;
}

/** 結論の4項目（スタンス・想定寄り・サイズ・VI）の1マス。補足は2行で切り、全文は title で見られる */
function KeyFact({ label, children, sub }: { label: string; children: ReactNode; sub?: string }) {
  return (
    <div className="-mr-px -mb-px min-w-0 border-r border-b border-rule px-4 py-2.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-[17px] leading-tight font-bold text-ink">{children}</dd>
      {sub && (
        <dd className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-ink-2" title={sub}>
          {sub}
        </dd>
      )}
    </div>
  );
}

export function TodaySummary({ analysis: t }: { analysis: TodayAnalysis }) {
  const d = t.today;
  return (
    <section className="panel overflow-hidden border-t-[3px] border-t-accent" aria-labelledby="today-conclusion">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 pt-2.5">
        <h2 id="today-conclusion" className="text-[13px] font-bold">
          今日の結論
        </h2>
        <span className="text-[12px] text-ink-2">
          <span className="num">{formatDateJa(d.asOf)}</span> ・ 更新 <span className="num">{updatedAt(d.meta.generatedAt)}</span>
        </span>
        <span className="rounded-sm border border-rule-strong px-1.5 text-[11px] leading-[1.6] font-semibold text-ink-2">
          {d.session}
        </span>
        <span className="rounded-sm border border-accent/40 bg-accent-soft px-1.5 text-[11px] leading-[1.6] font-semibold text-accent">
          スイング：{t.swingRole.label}
        </span>
      </header>

      {/* 一言サマリー：最初に目に入る位置 */}
      <p className="px-4 pt-2 pb-3 text-[18px] leading-snug font-bold text-ink sm:text-[20px]">{d.headline}</p>

      <dl className="grid grid-cols-2 overflow-hidden border-t border-rule lg:grid-cols-4">
        <KeyFact label="スタンス">
          <TodayStanceBadge stance={d.stance} size="lg" />
        </KeyFact>
        <KeyFact label="想定寄り" sub={d.expectedOpen.note}>
          {d.expectedOpen.label} <Gap pct={d.expectedOpen.gapPct} />
        </KeyFact>
        <KeyFact label="ポジションサイズ目安" sub={d.positionSize.reason}>
          {d.positionSize.label}
        </KeyFact>
        <KeyFact
          label="日経VI"
          sub={t.vi ? `${t.vi.regime.label}・${t.vi.source === 'today' ? '当日' : '前日終値（スイングデータ）'}` : undefined}
        >
          {t.vi ? <span className="num">{t.vi.value.toFixed(2)}</span> : '—'}
        </KeyFact>
      </dl>

      {t.notices.length > 0 && (
        <ul className="space-y-1 border-t border-rule px-4 py-2 text-[12px] text-caution">
          {t.notices.map((n) => (
            <li key={n}>※ {n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** ダッシュボード上部の要約カード（Today データが無くてもダッシュボード自体は表示する） */
export function TodaySummaryCard({ analysis: t, load }: { analysis: TodayAnalysis | null; load: TodayLoadState }) {
  const shell = 'panel relative overflow-hidden border-l-[3px] border-l-accent';
  if (!t) {
    return (
      <section className={cx(shell, 'flex flex-wrap items-center justify-between gap-2 px-4 py-2.5')} aria-label="今日の結論">
        <p className="text-[12.5px] text-ink-2">
          <span className="mr-2 font-bold text-ink">今日の結論</span>
          {load.status === 'loading' ? '読み込んでいます…' : '今日の市況データ（data/today-market.json）を読み込めませんでした。'}
        </p>
        <Link to="/today" className="text-[12px] font-semibold text-accent hover:underline">
          Todayを見る →
        </Link>
      </section>
    );
  }
  const d = t.today;
  return (
    <section className={shell} aria-label="今日の結論">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold">今日の結論</span>
          <span className="text-[12px] text-muted">
            <span className="num">{formatDateJa(d.asOf)}</span> {d.session}
          </span>
          {d.meta.isSample && (
            <span className="rounded-sm border border-caution/50 bg-caution-soft px-1 text-[10px] font-bold text-caution">SAMPLE</span>
          )}
        </div>
        <TodayStanceBadge stance={d.stance} />
        <span className="text-[12.5px]">
          <span className="text-muted">想定寄り </span>
          <span className="font-semibold">{d.expectedOpen.label}</span> <Gap pct={d.expectedOpen.gapPct} />
        </span>
        <span className="text-[12.5px]">
          <span className="text-muted">サイズ </span>
          <span className="font-semibold">{d.positionSize.label}</span>
        </span>
        <Link to="/today" className="ml-auto text-[12px] font-semibold whitespace-nowrap text-accent hover:underline">
          Todayを見る →
        </Link>
      </div>
      <p className="border-t border-rule px-4 py-2 text-[13.5px] font-semibold text-ink">{d.headline}</p>
    </section>
  );
}
