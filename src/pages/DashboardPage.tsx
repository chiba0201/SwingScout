import { Link } from 'react-router';
import { CandidateTable } from '../components/CandidateTable';
import { SectorBars } from '../components/charts';
import { DASHBOARD_QUOTE_ORDER, QuoteGrid } from '../components/QuoteGrid';
import { TodaySummaryCard } from '../components/TodaySummary';
import { Panel, StanceBadge } from '../components/ui';
import { WeekBoard } from '../components/WeekBoard';
import { WorkflowStrip } from '../components/WorkflowSteps';
import { marketContextOutdated, marketContextWhen, viRegime } from '../lib/market';
import { formatDateJa } from '../lib/calendar';
import { findQuote } from '../lib/scoring';
import type { TodayMarket } from '../types/today';
import { useAnalysis, useData } from '../state/DataContext';
import { useWorkflow } from '../state/useWorkflow';

/**
 * 今週の地合い。Today の市況メモから作った地合いは、一言・スタンスが「今日の結論」と同じなので出さず、
 * まとめの「今週」（今週の見通し）と地合いの注意・VIのサイズ目安だけを出す。
 * 手書きの market.json やサンプルの地合いは、一言・スタンスもここで出す（Today とは別の内容のため）。
 */
function WeekMarket({ analysis: a, today }: { analysis: ReturnType<typeof useAnalysis>; today: TodayMarket | null }) {
  const mc = a.dataset.marketContext;
  const vi = findQuote(mc, 'nikkeiVI');
  const regime = vi ? viRegime(vi.value) : null;
  const fromToday = mc.source?.kind === 'today';
  const w = a.window;
  return (
    <Panel
      title="今週の地合い"
      aside={
        <span className="flex flex-wrap items-center justify-end gap-x-2">
          <span>
            保有 <span className="num">{formatDateJa(w.entryDate)}</span>〜<span className="num">{formatDateJa(w.exitDate)}</span> ・{' '}
            {marketContextWhen(mc, a.dataset.asOf)}
          </span>
          {marketContextOutdated(mc, today) && (
            <Link to="/data-update" className="text-caution hover:underline">
              Todayは{today?.session}に更新済み（候補を生成し直すと反映）
            </Link>
          )}
        </span>
      }
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="px-4 py-3.5">
          {!fromToday && (
            <div className="mb-2 flex flex-wrap items-start gap-2">
              <StanceBadge stance={mc.stance} />
              <p className="min-w-0 flex-1 text-[15px] leading-snug font-bold text-ink">{mc.headline}</p>
            </div>
          )}
          {mc.summaryWeek ? (
            <p className="text-[14px] leading-relaxed text-ink">{mc.summaryWeek}</p>
          ) : (
            <p className="text-[12.5px] text-muted">
              今週の見通しはありません。市況メモのまとめに「今週：」の行があると、ここに出ます。
            </p>
          )}
        </div>
        <aside className="border-t border-rule bg-panel-2/60 px-4 py-3.5 lg:border-t-0 lg:border-l">
          {regime && vi && (
            <div className="mb-3">
              <div className="eyebrow">ポジションサイズの目安</div>
              <p className="mt-0.5 text-[15px] font-bold text-ink">{regime.guidance}</p>
              <p className="text-[12px] text-ink-2">
                日経VI <span className="num">{vi.value.toFixed(2)}</span>（{regime.label}）
              </p>
            </div>
          )}
          <div className="eyebrow">地合いの注意</div>
          {mc.riskNotes.length > 0 ? (
            <ul className="mt-1 list-disc space-y-1 pl-4 text-[12.5px] text-ink-2">
              {mc.riskNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12.5px] text-muted">特になし</p>
          )}
        </aside>
      </div>
    </Panel>
  );
}

export function DashboardPage() {
  const a = useAnalysis();
  const { todayAnalysis, todayLoad } = useData();
  const workflow = useWorkflow();
  const mc = a.dataset.marketContext;

  return (
    <div className="space-y-4">
      <h1 className="sr-only">ダッシュボード</h1>

      {/* 今日の運用ステップ（1行。詳しい手順はデータ更新画面）。
          ①市況〜③候補生成が済んだら出さない（④確認・⑤レポートは「いつでも」なので残すと TODO に見える）。
          済みの判定は日付で決まるので、次にやることができたら（翌朝の市況・引け後の日足）また出る */}
      {workflow.next && <WorkflowStrip workflow={workflow} />}

      {/* 今日の結論（要約のみ。詳細は Today 画面） */}
      <TodaySummaryCard analysis={todayAnalysis} load={todayLoad} />

      <QuoteGrid
        quotes={[...mc.indices, ...mc.volatility, ...mc.fx, ...mc.rates]}
        order={DASHBOARD_QUOTE_ORDER}
      />

      {/* 今週の地合い（スイングの保有期間に向けて）。今日の判断は上の「今日の結論」なので、ここは今週の見通しと注意だけ */}
      <WeekMarket analysis={a} today={todayAnalysis?.today ?? null} />

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
