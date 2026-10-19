import type { ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { PriceLadder, Sparkline } from '../components/charts';
import { EntryPlanCases } from '../components/EntryPlanCases';
import { FavoriteButton } from '../components/FavoriteToggle';
import { ProvisionalBadge, ProvisionalNote } from '../components/PlanStatus';
import { Change, cx, KeyValueGrid, Panel, ScoreBar, Value, WarningTagView } from '../components/ui';
import { YahooFinanceLink } from '../components/YahooFinanceLink';
import type { AnalyzedCandidate } from '../lib/analysis';
import { formatDateJa } from '../lib/calendar';
import { formatLevel, formatOku, formatPct, formatPrice, formatScore, formatShares, formatSigned, pctFrom } from '../lib/format';
import { CATEGORY_LABELS } from '../lib/scoring';
import { universeCodes } from '../lib/workflow';
import { useAnalysis, useData } from '../state/DataContext';
import type { ScoreCategory } from '../types/dataset';

const TIMING_LABEL = { 'pre-market': '寄り前', intraday: '場中', 'after-close': '引け後', unknown: '時刻未定' } as const;
const EARNINGS_POSITION = {
  unknown: '日程未定',
  'before-entry': 'IN前',
  'in-window': '保有期間中（決算またぎ）',
  'exit-day': 'OUT日当日',
  'after-window-near': '保有期間の直後',
  'after-window': '保有期間外',
} as const;

function PlanRow({ label, children, tone }: { label: string; children: ReactNode; tone?: 'down' | 'up' }) {
  return (
    <div className="grid gap-1 border-b border-rule py-2.5 last:border-b-0 sm:grid-cols-[6.5rem_1fr] sm:gap-3">
      <dt
        className={cx(
          'text-[12px] font-bold',
          tone === 'down' ? 'text-down' : tone === 'up' ? 'text-up' : 'text-ink-2',
        )}
      >
        {label}
      </dt>
      <dd className="text-[13px] text-ink">{children}</dd>
    </div>
  );
}

function CommentBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-b border-rule py-2.5 last:border-b-0">
      <h3 className="mb-0.5 text-[12px] font-bold text-ink-2">{title}</h3>
      <p className="text-[13px] leading-relaxed text-ink">{body || '—'}</p>
    </div>
  );
}

function ScoreBreakdown({ c }: { c: AnalyzedCandidate }) {
  const categories: ScoreCategory[] = ['supplyDemand', 'technical', 'event', 'risk'];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {categories.map((cat) => (
          <div key={cat}>
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="text-ink-2">
                {CATEGORY_LABELS[cat]}
                {cat === 'risk' && <span className="ml-1 text-[10.5px] text-muted">高いほど危険</span>}
              </span>
              <span className="num text-[15px] font-semibold">{formatScore(c.scores[cat])}</span>
            </div>
            <ScoreBar value={c.scores[cat]} tone={cat === 'risk' ? 'caution' : 'accent'} className="mt-1" />
          </div>
        ))}
      </div>

      <div className="relative overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>区分</th>
              <th>指標</th>
              <th>値</th>
              <th className="text-right">点</th>
              <th className="w-28" aria-label="メーター" />
              <th className="text-right">重み</th>
            </tr>
          </thead>
          <tbody>
            {c.scores.factors.map((f) => (
              <tr key={f.id}>
                <td className="text-[12px] whitespace-nowrap text-muted">{CATEGORY_LABELS[f.category]}</td>
                <td className="whitespace-nowrap">{f.label}</td>
                <td className="text-[12px] text-ink-2">
                  {f.value ?? '—'}
                  {f.note && <span className="ml-1 text-muted">（{f.note}）</span>}
                </td>
                <td className="num text-right">{f.score === null ? '—' : formatScore(f.score)}</td>
                <td>
                  {f.score === null ? (
                    <span className="text-[11px] text-muted">データなし</span>
                  ) : (
                    <ScoreBar value={f.score} tone={f.category === 'risk' ? 'caution' : 'accent'} />
                  )}
                </td>
                <td className="num text-right text-ink-2">{f.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const BACK_LABEL: Record<string, string> = {
  favorites: '← お気に入り',
  all: '← 全銘柄',
};

/** 開いた一覧（候補一覧のタブ）へ戻るリンク先。直接開いたときは候補一覧 */
function useBackLink(): { to: string; label: string } {
  const from = (useLocation().state as { from?: string } | null)?.from;
  if (!from?.startsWith('/candidates')) return { to: '/candidates', label: '← 候補一覧' };
  const tab = new URLSearchParams(from.split('?')[1] ?? '').get('tab') ?? '';
  return { to: from, label: BACK_LABEL[tab] ?? '← 候補一覧' };
}

export function CandidateDetailPage() {
  const a = useAnalysis();
  const { universeCsv } = useData();
  const { code } = useParams();
  const back = useBackLink();
  const location = useLocation();
  const idx = a.ranked.findIndex((c) => c.code === code);
  const c = a.ranked[idx];

  if (!c) {
    return (
      <div className="panel mx-auto mt-6 max-w-lg px-5 py-4">
        <p className="font-bold">銘柄 {code} はこのデータセットにありません</p>
        <p className="mt-1 text-[13px] text-ink-2">
          日足が無い・売買代金や株価の条件外などで採点していない銘柄です。お気に入りにすると、次に候補を生成したときから条件に関係なく採点されます。
        </p>
        <Link to={back.to} className="mt-2 inline-block text-[13px] font-semibold text-accent hover:underline">
          {back.label.replace('← ', '')}へ戻る
        </Link>
      </div>
    );
  }

  const prev = a.ranked[idx - 1];
  const next = a.ranked[idx + 1];
  const m = c.metrics;
  const close = c.price.close;
  const inTop = c.rank <= a.top.length;
  // お気に入りは銘柄リストの favorite 列なので、リストにある銘柄だけ付け外しできる
  const inUniverse = universeCodes(universeCsv).includes(c.code);

  return (
    <div className="space-y-4">
      <nav className="flex items-center justify-between gap-3 text-[12px]" aria-label="銘柄の移動">
        <Link to={back.to} className="font-semibold text-accent hover:underline">
          {back.label}
        </Link>
        <div className="flex gap-3">
          {prev && (
            <Link to={`/candidates/${prev.code}`} state={location.state} className="text-ink-2 hover:text-accent">
              ‹ {prev.rank}位 {prev.name}
            </Link>
          )}
          {next && (
            <Link to={`/candidates/${next.code}`} state={location.state} className="text-ink-2 hover:text-accent">
              {next.rank}位 {next.name} ›
            </Link>
          )}
        </div>
      </nav>

      {/* 銘柄ヘッダー */}
      <section className="panel px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <span
                className={cx(
                  'rounded-sm px-1.5 py-px font-bold',
                  inTop ? 'bg-accent text-panel' : 'border border-rule-strong text-ink-2',
                )}
              >
                {c.rank}位{!inTop && '（圏外）'}
              </span>
              <span>{c.market}</span>
              <span>{c.sector}</span>
              <span>テーマ：{c.theme}</span>
              {c.technical.pattern && <span className="text-ink-2">形：{c.technical.pattern}</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="text-[22px] leading-tight font-bold tracking-tight">
                <span className="num mr-2 text-[17px] font-medium text-ink-2">{c.code}</span>
                {c.name}
              </h1>
              {inUniverse && <FavoriteButton code={c.code} name={c.name} />}
              <YahooFinanceLink code={c.code} isSample={a.dataset.meta.isSample} />
            </div>
            {c.warnings.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
                {c.warnings.map((w) => (
                  <li key={`${w.id}-${w.label}`} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                    <WarningTagView tag={w} />
                    <span>{w.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-end gap-5">
            {c.price.history && (
              <div className="hidden sm:block">
                <Sparkline values={c.price.history} width={140} height={44} label={`${c.name}の終値推移`} />
                <div className="mt-0.5 text-right text-[10.5px] text-muted">直近{c.price.history.length}日</div>
              </div>
            )}
            <div className="text-right">
              <div className="text-[11px] text-muted">終値（{formatDateJa(a.dataset.asOf)}）</div>
              <div className="text-[22px] leading-tight font-semibold">{formatPrice(close)}</div>
              <Change
                value={c.price.change}
                pct={c.price.changePct}
                digits={Number.isInteger(c.price.change) ? 0 : 1}
                className="text-[12px]"
              />
            </div>
            <div className="border-l border-rule pl-5 text-right">
              <div className="text-[11px] text-muted">総合スコア</div>
              <div className="text-[30px] leading-none font-bold text-ink">{formatScore(c.scores.total)}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <Panel title="分析コメント">
          <CommentBlock title="需給" body={c.comments.supplyDemand} />
          <CommentBlock title="テクニカル" body={c.comments.technical} />
          <CommentBlock title="ファンダ / イベント" body={c.comments.fundamental} />
        </Panel>

        <Panel
          title={
            <>
              作戦
              <ProvisionalBadge a={a} />
            </>
          }
          aside={
            <span>
              {a.window.pattern.label}（<span className="num">{formatDateJa(a.window.entryDate)}</span>〜
              <span className="num">{formatDateJa(a.window.exitDate)}</span>）
            </span>
          }
        >
          <ProvisionalNote a={a} className="mb-3" />
          {/* 暫定のときは価格を少し薄くして、目安であることを見せる */}
          <div className={cx(a.plan.provisional && 'opacity-70')}>
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
              <PlanRow label="損切り目安" tone="down">
                <span className="num mr-1.5 font-semibold">{formatPrice(c.stopLoss.price)}円</span>
                <span className="num text-down">（{formatPct(pctFrom(c.stopLoss.price, close))}）</span>
                <span className="mt-0.5 block text-ink-2">{c.stopLoss.rule}</span>
              </PlanRow>
              <PlanRow label="利確目安" tone="up">
                <ul className="space-y-0.5">
                  {c.takeProfit.targets.map((t) => (
                    <li key={t.label}>
                      <span className="num mr-1.5 font-semibold">{formatPrice(t.price)}円</span>
                      <span className="num text-up">（{formatPct(pctFrom(t.price, close))}）</span>
                      <span className="ml-1.5 text-ink-2">{t.label}</span>
                    </li>
                  ))}
                </ul>
                <span className="mt-0.5 block text-ink-2">{c.takeProfit.rule}</span>
              </PlanRow>
              <PlanRow label="見送り条件">
                <ul className="list-disc space-y-0.5 pl-4">
                  {c.risks.skipConditions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </PlanRow>
            </dl>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="スコア内訳" aside="指標ごとの点数（0〜100）と重み">
          <ScoreBreakdown c={c} />
        </Panel>

        <div className="space-y-4">
          <Panel title="価格・テクニカル">
            <KeyValueGrid
              rows={[
                { label: '5日線', value: <span className="num">{formatLevel(c.technical.ma5)}（{formatPct(m.maDeviation5)}）</span> },
                { label: '25日線', value: <span className="num">{formatLevel(c.technical.ma25)}（{formatPct(m.maDeviation25)}）</span> },
                { label: '20日高値', value: <span className="num">{formatPrice(c.price.high20d)}</span>, hint: '基準日を除く直近20営業日' },
                { label: '52週高値', value: <Value value={c.price.high52w} /> },
                { label: 'RSI(14)', value: <Value value={c.technical.rsi14} digits={1} /> },
                { label: 'ATR(14)', value: <span className="num">{formatLevel(c.technical.atr14)}（{formatPct(m.atrPct, 1, false)}）</span> },
              ]}
            />
          </Panel>
          <Panel title="出来高・信用残">
            <KeyValueGrid
              rows={[
                { label: '出来高', value: <span className="num">{formatShares(c.volume.latest)}</span> },
                { label: '20日平均比', value: <Value value={m.volumeRatio20d} digits={2} unit="倍" /> },
                { label: '売買代金', value: <span className="num">{formatOku(c.volume.turnoverOku)}</span> },
                ...(c.margin
                  ? [
                      { label: '信用買残', value: <span className="num">{formatShares(c.margin.buyBalance)}（{formatPct(m.buyChangePct, 0)}）</span> },
                      { label: '信用売残', value: <span className="num">{formatShares(c.margin.sellBalance)}（{formatPct(m.sellChangePct, 0)}）</span> },
                      { label: '信用倍率', value: <Value value={m.marginRatio} digits={2} unit="倍" /> },
                      { label: '信用残基準日', value: <span className="num">{formatDateJa(c.margin.asOf)}</span> },
                    ]
                  : [{ label: '信用残', value: <span className="text-muted">データなし</span> }]),
              ]}
            />
          </Panel>
          <Panel title="決算・イベント">
            <KeyValueGrid
              rows={[
                {
                  label: '次回決算',
                  value: c.earnings.nextDate ? (
                    <span>
                      <span className="num">{formatDateJa(c.earnings.nextDate)}</span> {TIMING_LABEL[c.earnings.timing ?? 'unknown']}
                    </span>
                  ) : (
                    <span className="text-muted">未定</span>
                  ),
                },
                { label: '保有期間との関係', value: EARNINGS_POSITION[m.earningsTiming] },
                { label: '進捗率', value: <Value value={c.earnings.progressRate} unit="%" /> },
                {
                  label: '為替感応度',
                  value: c.sensitivity?.usdJpy === undefined ? '—' : <span className="num">{formatSigned(c.sensitivity.usdJpy, 1)}</span>,
                  hint: '−1〜+1。円安で追い風なら正',
                },
                { label: 'β', value: <Value value={c.sensitivity?.beta} digits={1} /> },
              ]}
            />
            {c.catalysts && c.catalysts.length > 0 && (
              <ul className="mt-2 space-y-1 text-[12.5px]">
                {c.catalysts.map((x) => (
                  <li key={x.label} className="flex gap-1.5">
                    <span
                      className={cx(
                        'shrink-0 font-bold',
                        x.impact === 'positive' ? 'text-up' : x.impact === 'negative' ? 'text-down' : 'text-muted',
                      )}
                    >
                      {x.impact === 'positive' ? '＋' : x.impact === 'negative' ? '−' : '・'}
                      <span className="sr-only">{x.impact === 'positive' ? '好材料' : x.impact === 'negative' ? '悪材料' : '中立'}</span>
                    </span>
                    {x.label}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
