import { Link } from 'react-router';
import { CandidateTable } from '../components/CandidateTable';
import { SectorBars } from '../components/charts';
import { DASHBOARD_QUOTE_ORDER, QuoteGrid } from '../components/QuoteGrid';
import { TodaySummaryCard } from '../components/TodaySummary';
import { Panel, StanceBadge } from '../components/ui';
import { WeekBoard } from '../components/WeekBoard';
import { formatDateJa } from '../lib/calendar';
import { viRegime } from '../lib/market';
import { findQuote } from '../lib/scoring';
import { useAnalysis, useData } from '../state/DataContext';

export function DashboardPage() {
  const a = useAnalysis();
  const { todayAnalysis, todayLoad } = useData();
  const mc = a.dataset.marketContext;
  const vi = findQuote(mc, 'nikkeiVI');
  const regime = vi ? viRegime(vi.value) : null;

  return (
    <div className="space-y-4">
      <h1 className="sr-only">ダッシュボード</h1>

      {/* 今日の結論（要約のみ。詳細は Today 画面） */}
      <TodaySummaryCard analysis={todayAnalysis} load={todayLoad} />

      {/* 地合いサマリー */}
      <section className="panel overflow-hidden" aria-label="地合いサマリー">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="px-4 py-3.5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StanceBadge stance={mc.stance} />
              <span className="text-[12px] text-muted">
                基準日 <span className="num">{formatDateJa(a.dataset.asOf)}</span> 引け
              </span>
            </div>
            <p className="text-[16px] leading-snug font-bold text-ink">{mc.headline}</p>
            <dl className="mt-2.5 space-y-1.5 text-[13px] text-ink-2">
              <div className="flex gap-3">
                <dt className="w-8 shrink-0 font-semibold text-muted">今日</dt>
                <dd>{mc.summaryToday}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-8 shrink-0 font-semibold text-muted">今週</dt>
                <dd>{mc.summaryWeek}</dd>
              </div>
            </dl>
          </div>
          <aside className="border-t border-rule bg-panel-2/60 px-4 py-3.5 lg:border-t-0 lg:border-l">
            {regime && vi && (
              <>
                <div className="eyebrow">ポジションサイズの目安</div>
                <p className="mt-0.5 text-[15px] font-bold text-ink">{regime.guidance}</p>
                <p className="text-[12px] text-ink-2">
                  日経VI <span className="num">{vi.value.toFixed(2)}</span>（{regime.label}）
                </p>
              </>
            )}
            {mc.riskNotes.length > 0 && (
              <>
                <div className="eyebrow mt-3">地合いの注意</div>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-[12.5px] text-ink-2">
                  {mc.riskNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      </section>

      <QuoteGrid
        quotes={[...mc.indices, ...mc.volatility, ...mc.fx, ...mc.rates]}
        order={DASHBOARD_QUOTE_ORDER}
      />

      <WeekBoard analysis={a} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title={`今週の候補 上位${a.top.length}`}
          aside={
            <Link to="/candidates" className="font-semibold text-accent hover:underline">
              スコア内訳を見る →
            </Link>
          }
          bodyClassName="p-0"
        >
          <CandidateTable candidates={a.top} variant="compact" />
        </Panel>
        <Panel title="業種別騰落" aside="基準日">
          {mc.sectors.length > 0 ? (
            <SectorBars sectors={mc.sectors} />
          ) : (
            <p className="text-[12px] text-muted">業種データがありません。</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
