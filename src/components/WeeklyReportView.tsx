/**
 * 週次レポート（今週の作戦）の閲覧ビュー。編集はせず、読むことに特化する。
 *
 *   表紙（期間・地合い・候補数・注目イベント）
 *   → 今日の市況（Today がある場合）→ 地合い → 今週のイベント → 上位銘柄（早見表＋1銘柄ずつ）
 *   → 運用上の注意 → 注意書き
 *
 * 文章の中身は src/lib/reportGenerator.ts の build*()（Markdown 保存と同じ内容）。
 */
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { AnalyzedCandidate, DatasetAnalysis } from '../lib/analysis';
import { formatDateJa } from '../lib/calendar';
import { formatDateTime, formatPct, formatPrice, formatScore, pctFrom } from '../lib/format';
import { marketContextOutdated, marketContextWhen, viRegime } from '../lib/market';
import type { ParsedMarketMemo } from '../lib/marketMemo';
import { buildOperationNotes, DISCLAIMER, eventPhase, reportTitle, type ReportNoteGroup } from '../lib/reportGenerator';
import { findQuote } from '../lib/scoring';
import type { TodayAnalysis } from '../lib/todayAnalysis';
import { isTodayFresh } from '../lib/workflow';
import { PriceLadder, SectorBars, Sparkline } from './charts';
import {
  IconCalendar,
  IconCandle,
  IconDoc,
  IconFlow,
  IconGap,
  IconLink,
  IconList,
  IconMarket,
  IconScale,
  IconShield,
  IconSun,
} from './icons';
import { QuoteGrid, DASHBOARD_QUOTE_ORDER } from './QuoteGrid';
import { EntryPlanCases } from './EntryPlanCases';
import { ProvisionalNote } from './PlanStatus';
import { PickRoleBadge } from './TodayMemoBoards';
import { TodayStanceBadge } from './TodaySummary';
import { WatchActionBadge } from './TodayWatchlist';
import { Change, cx, ScoreBar, StanceBadge, WarningTagView } from './ui';
import { WeekBoard } from './WeekBoard';

type IconType = ComponentType<{ className?: string }>;

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrollToId = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });

// ---------------------------------------------------------------------------
// 共通の部品
// ---------------------------------------------------------------------------

function SectionHeading({ id, icon: Icon, title, aside }: { id: string; icon: IconType; title: string; aside?: ReactNode }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={`${id}-title`} className="flex items-center gap-2 text-[16px] font-bold text-ink">
        <Icon className="h-[18px] w-[18px] translate-y-[2px] text-accent" />
        {title}
      </h2>
      {aside && <div className="text-[12px] text-muted">{aside}</div>}
    </div>
  );
}

function Section({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4">
      {children}
    </section>
  );
}

function Fact({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="-mr-px -mb-px min-w-0 border-r border-b border-rule px-5 py-3">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-[15px] leading-snug font-bold text-ink">{children}</dd>
      {sub && <dd className="mt-0.5 text-[12px] leading-snug text-ink-2">{sub}</dd>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 表紙
// ---------------------------------------------------------------------------

function ReportCover({ a }: { a: DatasetAnalysis }) {
  const w = a.window;
  const mc = a.dataset.marketContext;
  const vi = findQuote(mc, 'nikkeiVI');
  const regime = vi ? viRegime(vi.value) : null;
  const warned = a.top.filter((c) => c.warnings.some((x) => x.severity !== 'low')).length;
  const keyEvents = a.events.filter((e) => e.importance === 'high' && eventPhase(e, a) !== 'OUT後');

  return (
    <header className="panel overflow-hidden border-t-[3px] border-t-accent">
      <div className="px-5 py-4">
        <p className="eyebrow">週次レポート</p>
        <h2 className="mt-1 text-[22px] leading-tight font-bold tracking-tight text-ink">{reportTitle(a)}</h2>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink">
          <span className="rounded-sm bg-accent px-1.5 text-[11px] leading-[1.7] font-bold text-panel">IN</span>
          <span className="num">{formatDateJa(w.entryDate)}</span> 寄り
          <span className="text-muted" aria-hidden>
            →
          </span>
          <span className="rounded-sm border border-accent px-1.5 text-[11px] leading-[1.6] font-bold text-accent">OUT</span>
          <span className="num">{formatDateJa(w.exitDate)}</span> 大引けまで
          <span className="text-muted">（{w.holdingDays.length}営業日）</span>
        </p>
        <p className="mt-1 text-[12px] text-muted">
          データ基準日 <span className="num">{formatDateJa(a.dataset.asOf)}</span> 引け ・ 作成 {formatDateTime(a.dataset.meta.generatedAt)}
        </p>
        {a.dataset.meta.isSample && (
          <p className="mt-2 text-[12px] font-semibold text-caution">
            サンプルデータです。銘柄・数値・日程はすべて架空で、実在銘柄の推奨ではありません。
          </p>
        )}
        <ProvisionalNote a={a} className="mt-2" />
      </div>
      <dl className="grid grid-cols-1 overflow-hidden border-t border-rule sm:grid-cols-3">
        <Fact label="地合い" sub={regime ? `日経VI ${vi!.value.toFixed(1)}：${regime.guidance}` : mc.headline}>
          <StanceBadge stance={mc.stance} />
        </Fact>
        <Fact label="今週の候補" sub={warned > 0 ? `うち${warned}銘柄に注意タグあり` : '注意タグのある銘柄なし'}>
          <span className="num">{a.top.length}</span>銘柄
        </Fact>
        <Fact
          label="注目イベント"
          sub={
            keyEvents.length > 0
              ? keyEvents
                  .slice(0, 3)
                  .map((e) => `${formatDateJa(e.date, false)} ${e.label}`)
                  .join('・')
              : '重要度の高いイベントの登録なし'
          }
        >
          重要度高 <span className="num">{keyEvents.length}</span>件
        </Fact>
      </dl>
    </header>
  );
}

// ---------------------------------------------------------------------------
// 今日の市況
// ---------------------------------------------------------------------------

function TodaySection({ t, memo }: { t: TodayAnalysis; memo: ParsedMarketMemo | null }) {
  const d = t.today;
  const fresh = isTodayFresh(d.asOf);
  return (
    <Section id="r-today">
      <SectionHeading
        id="r-today"
        icon={IconSun}
        title="今日の市況"
        aside={
          fresh ? (
            `${formatDateJa(d.asOf)} ${d.session}`
          ) : (
            <span className="text-caution">
              {formatDateJa(d.asOf)}の内容（今日の分は未反映）
            </span>
          )
        }
      />
      <div className="panel overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start gap-3">
            <TodayStanceBadge stance={d.stance} />
            <p className="min-w-0 flex-1 text-[15px] leading-snug font-bold text-ink">{d.headline}</p>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="eyebrow">{t.open.basis === 'actual' ? '寄り付き（実際）' : '想定寄り'}</dt>
              <dd className="mt-0.5 font-semibold">
                {t.open.gapPct === null ? (
                  <span className="text-muted">未確認</span>
                ) : (
                  <>
                    {t.open.label} <span className="num">{formatPct(t.open.gapPct, 2)}</span>
                  </>
                )}
                {t.open.basis === 'actual' && !d.expectedOpen.unconfirmed && (
                  <span className="ml-1.5 text-[12px] font-normal text-muted">
                    （想定 {d.expectedOpen.label} {formatPct(d.expectedOpen.gapPct, 2)}）
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">サイズ目安</dt>
              <dd className="mt-0.5 font-semibold">{d.positionSize.label}</dd>
            </div>
            <div>
              {/* Today に日経VIが無ければ VIX を使うので、見出しは実際に使った指標名にする */}
              <dt className="eyebrow">{t.vi?.label ?? '日経VI'}</dt>
              <dd className="mt-0.5 font-semibold">
                {t.vi ? (
                  <>
                    <span className="num">{t.vi.value.toFixed(2)}</span>（{t.vi.regime.label}）
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
          {memo?.needsReview && (
            <p className="mt-3 text-[12px] text-caution">
              市況メモに要確認の記載が{memo.reviewHits.length}件あります。数値・日程は一次情報で確認してください。
            </p>
          )}
        </div>
        {(t.picks.length > 0 || d.plan?.invalidation || !!d.sectorStances?.length) && (
          <div className="space-y-1.5 border-t border-rule px-5 py-3 text-[13px]">
            <p className="eyebrow">今日の売買方針（市況メモ）</p>
            {t.picks.length > 0 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                {(['main', 'confirm', 'wait', 'avoid'] as const).map((role) => {
                  const picks = t.picks.filter((p) => p.role === role);
                  return picks.length === 0 ? null : (
                    <li key={role} className="flex items-center gap-1.5">
                      <PickRoleBadge role={role} />
                      {picks.map((p) => p.name).join('、')}
                    </li>
                  );
                })}
              </ul>
            )}
            {d.plan?.invalidation && (
              <p>
                <span className="font-bold">撤回条件</span>：{d.plan.invalidation}
              </p>
            )}
            {!!d.sectorStances?.length && (
              <p className="text-ink-2">
                <span className="font-bold text-ink">セクター</span>：
                {(['priority', 'select', 'caution'] as const)
                  .map((kind) => {
                    const items = d.sectorStances!.filter((s) => s.stance === kind).map((s) => s.sector);
                    return items.length ? `${{ priority: '優先', select: '選別', caution: '慎重' }[kind]} ${items.join('、')}` : null;
                  })
                  .filter(Boolean)
                  .join(' ／ ')}
              </p>
            )}
          </div>
        )}
        {t.watchlist.length > 0 && (
          <div className="border-t border-rule px-5 py-3">
            <p className="eyebrow">今日の監視銘柄の扱い</p>
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
              {t.watchlist.map((w) => (
                <li key={w.candidate.code} className="flex items-center gap-1.5" title={w.reason}>
                  <WatchActionBadge action={w.action} />
                  {w.candidate.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="border-t border-rule px-5 py-2 text-right">
          <Link to="/today" className="text-[12.5px] font-semibold text-accent hover:underline">
            Todayで詳しく見る →
          </Link>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 地合い
// ---------------------------------------------------------------------------

function MarketSection({ a, today }: { a: DatasetAnalysis; today: TodayAnalysis | null }) {
  const mc = a.dataset.marketContext;
  const outdated = marketContextOutdated(mc, today?.today ?? null);
  const vi = findQuote(mc, 'nikkeiVI');
  const regime = vi ? viRegime(vi.value) : null;
  const quotes = [...mc.indices, ...mc.volatility, ...mc.fx, ...mc.rates];

  return (
    <Section id="r-market">
      <SectionHeading
        id="r-market"
        icon={IconMarket}
        title="地合い"
        aside={
          <>
            {marketContextWhen(mc, a.dataset.asOf)}
            {outdated && today && (
              <span className="ml-1.5 text-caution">
                ・ Todayは{today.today.session}に更新済み（候補を生成し直すと反映）
              </span>
            )}
          </>
        }
      />
      <div className="space-y-3">
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="space-y-3 px-5 py-4">
              <div className="flex flex-wrap items-start gap-3">
                <StanceBadge stance={mc.stance} />
                <p className="min-w-0 flex-1 text-[15px] leading-snug font-bold text-ink">{mc.headline}</p>
              </div>
              {/* Today から作った地合いは「前日」が一言と同じ文なので省く。今週の見通しが無ければ省く */}
              {((mc.summaryToday && mc.summaryToday !== mc.headline) || mc.summaryWeek) && (
                <dl className="space-y-1.5 text-[13.5px] leading-relaxed text-ink">
                  {mc.summaryToday && mc.summaryToday !== mc.headline && (
                    <div className="flex gap-3">
                      <dt className="w-8 shrink-0 font-semibold text-muted">前日</dt>
                      <dd>{mc.summaryToday}</dd>
                    </div>
                  )}
                  {mc.summaryWeek && (
                    <div className="flex gap-3">
                      <dt className="w-8 shrink-0 font-semibold text-muted">今週</dt>
                      <dd>{mc.summaryWeek}</dd>
                    </div>
                  )}
                </dl>
              )}
              {regime && vi && (
                <p className="flex items-start gap-2 rounded-sm bg-accent-soft/70 px-3 py-2 text-[13px] text-ink">
                  <IconScale className="mt-0.5 text-accent" />
                  <span>
                    日経VI <span className="num font-semibold">{vi.value.toFixed(1)}</span> は「{regime.label}」水準。
                    <span className="font-semibold">{regime.guidance}</span>。
                  </span>
                </p>
              )}
              {mc.riskNotes.length > 0 && (
                <ul className="space-y-1 text-[13px] text-ink-2">
                  {mc.riskNotes.map((n) => (
                    <li key={n} className="flex gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-caution-fill" aria-hidden />
                      <span>
                        <span className="sr-only">注意：</span>
                        {n}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {mc.sectors.length > 0 && (
              <aside className="border-t border-rule px-5 py-4 lg:border-t-0 lg:border-l">
                <p className="eyebrow mb-2">業種別騰落（基準日）</p>
                <SectorBars sectors={mc.sectors} />
              </aside>
            )}
          </div>
        </div>
        {quotes.length > 0 && <QuoteGrid quotes={quotes} order={DASHBOARD_QUOTE_ORDER} />}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 上位銘柄
// ---------------------------------------------------------------------------

function QuickTable({ picks }: { picks: AnalyzedCandidate[] }) {
  return (
    // relative：表の中の sr-only（absolute）がスクロール枠の外へはみ出してページ幅を広げないように
    <div className="panel relative overflow-x-auto">
      <table className="data-table">
        <caption className="sr-only">上位銘柄の早見表</caption>
        <thead>
          <tr>
            <th className="w-8 text-right">#</th>
            <th>銘柄</th>
            <th>総合</th>
            <th>形</th>
            <th className="text-right">入り目安</th>
            <th className="text-right">損切り</th>
            <th className="text-right">利確</th>
            <th>注意</th>
          </tr>
        </thead>
        <tbody>
          {picks.map((c) => {
            const close = c.price.close;
            const zone =
              c.entryPlan.zoneLow !== undefined && c.entryPlan.zoneHigh !== undefined
                ? `${formatPrice(c.entryPlan.zoneLow)}〜${formatPrice(c.entryPlan.zoneHigh)}`
                : '—';
            return (
              <tr key={c.code}>
                <td className="num text-right font-semibold text-ink-2">{c.rank}</td>
                <td className="min-w-[10rem]">
                  <button
                    type="button"
                    className="text-left font-semibold text-ink hover:text-accent hover:underline"
                    onClick={() => scrollToId(`r-pick-${c.code}`)}
                  >
                    <span className="num mr-1.5 text-[12px] font-medium text-ink-2">{c.code}</span>
                    {c.name}
                  </button>
                  <div className="text-[11.5px] text-muted">{c.sector}</div>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="num w-6 text-right font-semibold">{formatScore(c.scores.total)}</span>
                    <ScoreBar value={c.scores.total} className="w-12" />
                  </div>
                </td>
                <td className="text-[12px] whitespace-nowrap text-ink-2">{c.technical.pattern ?? '—'}</td>
                <td className="num text-right whitespace-nowrap">{zone}</td>
                <td className="text-right whitespace-nowrap">
                  <span className="num">{formatPrice(c.stopLoss.price)}</span>
                  <span className="num block text-[11px] text-down">{formatPct(pctFrom(c.stopLoss.price, close))}</span>
                </td>
                <td className="text-right whitespace-nowrap">
                  <span className="num">{c.takeProfit.targets.map((t) => formatPrice(t.price)).join(' → ')}</span>
                  {c.takeProfit.targets[0] && (
                    <span className="num block text-[11px] text-up">{formatPct(pctFrom(c.takeProfit.targets[0].price, close))}〜</span>
                  )}
                </td>
                <td className="min-w-[7rem]">
                  {c.warnings.length === 0 ? (
                    <span className="text-[12px] text-muted">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {c.warnings
                        .filter((w) => w.severity !== 'low')
                        .slice(0, 2)
                        .map((w) => (
                          <WarningTagView key={`${w.id}-${w.label}`} tag={w} />
                        ))}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CommentRow({ icon: Icon, title, body }: { icon: IconType; title: string; body: string }) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 text-muted" />
      <div className="min-w-0">
        <h4 className="text-[12px] font-bold text-ink-2">{title}</h4>
        <p className="text-[13.5px] leading-relaxed text-ink">{body || '—'}</p>
      </div>
    </div>
  );
}

function PlanRow({ label, tone, children }: { label: string; tone?: 'down' | 'up'; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2 border-b border-rule py-2 last:border-b-0">
      <dt className={cx('text-[12px] font-bold', tone === 'down' ? 'text-down' : tone === 'up' ? 'text-up' : 'text-ink-2')}>{label}</dt>
      <dd className="text-[13px] leading-relaxed text-ink">{children}</dd>
    </div>
  );
}

const SCORE_ITEMS = [
  { key: 'supplyDemand', label: '需給' },
  { key: 'technical', label: 'テクニカル' },
  { key: 'event', label: 'イベント' },
  { key: 'risk', label: 'リスク' },
] as const;

function PickArticle({ c }: { c: AnalyzedCandidate }) {
  const close = c.price.close;
  return (
    <article id={`r-pick-${c.code}`} className="panel scroll-mt-4 overflow-hidden" aria-labelledby={`r-pick-${c.code}-title`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <span className="rounded-sm bg-accent px-1.5 py-px font-bold text-panel">{c.rank}位</span>
            <span>
              {c.sector}・{c.theme}
            </span>
            {c.technical.pattern && <span className="text-ink-2">形：{c.technical.pattern}</span>}
          </div>
          <h3 id={`r-pick-${c.code}-title`} className="mt-1 text-[17px] leading-tight font-bold text-ink">
            <span className="num mr-2 text-[14px] font-medium text-ink-2">{c.code}</span>
            {c.name}
          </h3>
        </div>
        <div className="flex items-end gap-4">
          {c.price.history && (
            <div className="hidden sm:block">
              <Sparkline values={c.price.history} width={110} height={34} label={`${c.name}の終値推移`} />
            </div>
          )}
          <div className="text-right">
            <div className="num text-[16px] leading-tight font-semibold">{formatPrice(close)}</div>
            <Change value={c.price.change} pct={c.price.changePct} digits={Number.isInteger(c.price.change) ? 0 : 1} className="text-[11.5px]" />
          </div>
          <div className="border-l border-rule pl-4 text-right">
            <div className="text-[10.5px] text-muted">総合</div>
            <div className="text-[24px] leading-none font-bold text-ink">{formatScore(c.scores.total)}</div>
          </div>
        </div>
      </header>

      <div className="space-y-2.5 border-b border-rule px-5 py-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          {SCORE_ITEMS.map((s) => (
            <div key={s.key}>
              <div className="flex items-baseline justify-between text-[11.5px]">
                <span className="text-ink-2">{s.label}</span>
                <span className="num font-semibold">{formatScore(c.scores[s.key])}</span>
              </div>
              <ScoreBar value={c.scores[s.key]} tone={s.key === 'risk' ? 'caution' : 'accent'} className="mt-1" />
            </div>
          ))}
        </div>
        {c.warnings.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {c.warnings.map((w) => (
              <li key={`${w.id}-${w.label}`} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <WarningTagView tag={w} />
                <span>{w.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="space-y-3 border-b border-rule px-5 py-4 lg:border-r lg:border-b-0">
          <CommentRow icon={IconFlow} title="需給" body={c.comments.supplyDemand} />
          <CommentRow icon={IconCandle} title="テクニカル" body={c.comments.technical} />
          <CommentRow icon={IconDoc} title="ファンダ / イベント" body={c.comments.fundamental} />
        </div>
        <div className="px-5 py-4">
          <PriceLadder
            close={close}
            stop={c.stopLoss.price}
            zoneLow={c.entryPlan.zoneLow}
            zoneHigh={c.entryPlan.zoneHigh}
            targets={c.takeProfit.targets}
          />
          <dl className="mt-2">
            <PlanRow label="入り方">
              <EntryPlanCases plan={c.entryPlan} />
            </PlanRow>
            <PlanRow label="損切り" tone="down">
              <span className="num font-semibold">{formatPrice(c.stopLoss.price)}円</span>
              <span className="num text-down">（{formatPct(pctFrom(c.stopLoss.price, close))}）</span>
              <span className="block text-ink-2">{c.stopLoss.rule}</span>
            </PlanRow>
            <PlanRow label="利確" tone="up">
              {c.takeProfit.targets.map((t) => (
                <span key={t.label} className="mr-3 inline-block">
                  <span className="num font-semibold">{formatPrice(t.price)}円</span>
                  <span className="num text-up">（{formatPct(pctFrom(t.price, close))}）</span>
                  <span className="text-ink-2">{t.label}</span>
                </span>
              ))}
              <span className="block text-ink-2">{c.takeProfit.rule}</span>
            </PlanRow>
            <PlanRow label="見送り">
              <ul className="list-disc space-y-0.5 pl-4">
                {c.risks.skipConditions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </PlanRow>
          </dl>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// 運用上の注意
// ---------------------------------------------------------------------------

const NOTE_ICONS: Record<ReportNoteGroup['id'], IconType> = {
  correlation: IconLink,
  gap: IconGap,
  calendar: IconCalendar,
  position: IconScale,
};

function OperationsSection({ groups }: { groups: ReportNoteGroup[] }) {
  return (
    <Section id="r-ops">
      <SectionHeading id="r-ops" icon={IconShield} title="運用上の注意" />
      <div className="panel overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {groups.map((g) => {
            const Icon = NOTE_ICONS[g.id];
            return (
              <div key={g.id} className="-mr-px -mb-px border-r border-b border-rule px-5 py-4">
                <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
                  <Icon className="text-accent" />
                  {g.title}
                </h3>
                <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink">
                  {g.notes.map((n, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-2" aria-hidden />
                      <span>
                        {n.label && <span className="mr-1 font-bold">{n.label}：</span>}
                        {n.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 目次（PC幅のみ）
// ---------------------------------------------------------------------------

interface TocItem {
  id: string;
  label: string;
  children?: { id: string; label: string }[];
}

function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (els.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function ReportToc({ items }: { items: TocItem[] }) {
  const ids = useMemo(() => items.flatMap((i) => [i.id, ...(i.children?.map((c) => c.id) ?? [])]), [items]);
  const active = useActiveSection(ids);
  const link = (id: string, label: string, sub = false) => (
    <button
      type="button"
      onClick={() => scrollToId(id)}
      aria-current={active === id ? 'location' : undefined}
      className={cx(
        'block w-full truncate border-l-2 py-1 text-left',
        sub ? 'pl-5 text-[12px]' : 'pl-3 text-[12.5px] font-semibold',
        active === id ? 'border-accent text-accent' : 'border-transparent text-ink-2 hover:text-ink',
      )}
    >
      {label}
    </button>
  );
  return (
    <nav aria-label="レポートの目次" className="hidden lg:block">
      <div className="sticky top-4">
        <p className="eyebrow mb-1.5 pl-3">目次</p>
        <ul className="border-l border-rule">
          {items.map((i) => (
            <li key={i.id}>
              {link(i.id, i.label)}
              {i.children && (
                <ul>
                  {i.children.map((c) => (
                    <li key={c.id}>{link(c.id, c.label, true)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

export function WeeklyReportView({
  analysis: a,
  today,
  memo,
}: {
  analysis: DatasetAnalysis;
  today: TodayAnalysis | null;
  memo: ParsedMarketMemo | null;
}) {
  const groups = useMemo(() => buildOperationNotes(a), [a]);
  const toc = useMemo<TocItem[]>(
    () => [
      { id: 'r-cover', label: '概要' },
      ...(today ? [{ id: 'r-today', label: '今日の市況' }] : []),
      { id: 'r-market', label: '地合い' },
      { id: 'r-events', label: '今週のイベント' },
      {
        id: 'r-picks',
        label: `上位${a.top.length}銘柄`,
        children: a.top.map((c) => ({ id: `r-pick-${c.code}`, label: `${c.rank}. ${c.name}` })),
      },
      { id: 'r-ops', label: '運用上の注意' },
    ],
    [a, today],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_12.5rem]">
      <div className="min-w-0 space-y-7">
        <div id="r-cover" className="scroll-mt-4">
          <ReportCover a={a} />
        </div>

        {today && <TodaySection t={today} memo={memo} />}

        <MarketSection a={a} today={today} />

        <Section id="r-events">
          <SectionHeading id="r-events" icon={IconCalendar} title="今週のイベント" aside={`${a.events.length}件`} />
          <WeekBoard analysis={a} />
        </Section>

        <Section id="r-picks">
          <SectionHeading id="r-picks" icon={IconList} title={`上位${a.top.length}銘柄`} aside="スコア順。銘柄名を押すと詳しい説明へ" />
          <div className="space-y-4">
            <QuickTable picks={a.top} />
            {a.top.map((c) => (
              <PickArticle key={c.code} c={c} />
            ))}
          </div>
        </Section>

        <OperationsSection groups={groups} />

        <p className="rounded-sm border border-rule bg-panel-2 px-4 py-3 text-[12px] leading-relaxed text-ink-2">※{DISCLAIMER}</p>
      </div>

      <ReportToc items={toc} />
    </div>
  );
}
