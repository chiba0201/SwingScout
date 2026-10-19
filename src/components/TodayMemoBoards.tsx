/**
 * 市況メモ（主に末尾の「SwingScout用まとめ」）から取れた内容の表示。取れなかったブロックは出さない。
 *   売買方針 … 本線・確認後・待機・避ける銘柄、入る条件・撤回条件・損切り、セクターの扱い
 *   米国の関連株 / 日経の節目 / 個別材料・夜間PTS
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { formatNumber, formatPrice } from '../lib/format';
import { PICK_ROLE_LABELS, type MatchedPick, type TodayAnalysis } from '../lib/todayAnalysis';
import { openGapLabel } from '../lib/todayBuilder';
import { useData } from '../state/DataContext';
import type { PickRole, SectorStanceKind, StockCatalyst, TodayMarket } from '../types/today';
import { ChangePct, cx, Panel } from './ui';

const ROLE_ORDER: PickRole[] = ['main', 'confirm', 'wait', 'avoid'];

const ROLE_CLASS: Record<PickRole, string> = {
  main: 'border-accent bg-accent text-panel',
  confirm: 'border-accent/50 bg-accent-soft text-accent',
  wait: 'border-rule-strong bg-panel-2 text-ink-2',
  avoid: 'border-caution/50 bg-caution-soft text-caution',
};

export function PickRoleBadge({ role }: { role: PickRole }) {
  return (
    <span className={cx('inline-block rounded-sm border px-1.5 py-px text-[11px] font-bold whitespace-nowrap', ROLE_CLASS[role])}>
      {PICK_ROLE_LABELS[role]}
    </span>
  );
}

const SECTOR_LABEL: Record<SectorStanceKind, string> = { priority: '優先', select: '選別', caution: '慎重' };
const SECTOR_CLASS: Record<SectorStanceKind, string> = {
  priority: 'border-accent/50 bg-accent-soft text-accent',
  select: 'border-rule-strong bg-panel text-ink-2',
  caution: 'border-caution/50 bg-caution-soft text-caution',
};

function PickChip({ pick }: { pick: MatchedPick }) {
  const { favorites } = useData();
  const c = pick.candidate;
  const code = pick.code ?? c?.code;
  const body = (
    <>
      {code && <span className="num mr-1 text-[11.5px] font-medium text-ink-2">{code}</span>}
      <span className="font-semibold text-ink">{pick.name}</span>
      {code && favorites.has(code) && (
        <span className="ml-0.5 text-accent" title="お気に入り">
          <span aria-hidden>★</span>
          <span className="sr-only">（お気に入り）</span>
        </span>
      )}
      {c && <span className="ml-1.5 text-[11px] text-muted">{c.rank}位</span>}
    </>
  );
  const className = 'inline-flex items-center rounded border border-rule bg-panel px-2 py-0.5 text-[12.5px]';
  return c ? (
    <Link to={`/candidates/${c.code}`} className={cx(className, 'hover:border-accent/60 hover:bg-accent-soft/40')} title="銘柄詳細を開く">
      {body}
    </Link>
  ) : (
    <span className={className} title="採点済みの候補にない銘柄です">
      {body}
    </span>
  );
}

function PlanRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-1.5 sm:grid-cols-[5.5rem_1fr] sm:gap-3">
      <dt className="text-[12px] font-bold text-ink-2">{label}</dt>
      <dd className="text-[13px] leading-relaxed text-ink">{children}</dd>
    </div>
  );
}

/** 売買方針（本線・待機などの銘柄、入る条件・撤回条件・損切り、セクターの扱い） */
export function TodayPlanPanel({ analysis: t }: { analysis: TodayAnalysis }) {
  const plan = t.today.plan;
  const sectors = t.today.sectorStances ?? [];
  if (!plan && sectors.length === 0) return null;
  const byRole = ROLE_ORDER.map((role) => ({ role, picks: t.picks.filter((p) => p.role === role) })).filter((g) => g.picks.length > 0);

  return (
    <Panel title="今日の売買方針" aside="市況メモのまとめから" bodyClassName="p-0">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {byRole.length > 0 && (
          <dl className="space-y-2 border-b border-rule px-4 py-3 lg:border-r lg:border-b-0">
            {byRole.map(({ role, picks }) => (
              <div key={role} className="flex items-start gap-2.5">
                <dt className="w-14 shrink-0 pt-0.5">
                  <PickRoleBadge role={role} />
                </dt>
                <dd className="flex min-w-0 flex-wrap gap-1.5">
                  {picks.map((p) => (
                    <PickChip key={`${p.code ?? p.name}-${role}`} pick={p} />
                  ))}
                </dd>
              </div>
            ))}
            <p className="pt-1 text-[11px] text-muted">順位は採点した銘柄の中での順位。リンクから銘柄詳細を開けます</p>
          </dl>
        )}
        {plan && (plan.entry || plan.invalidation || plan.stopLoss) && (
          <dl className="divide-y divide-rule px-4 py-1.5">
            {plan.entry && <PlanRow label="入る条件">{plan.entry}</PlanRow>}
            {plan.invalidation && (
              <PlanRow label="撤回条件">
                <span className="font-semibold">{plan.invalidation}</span>
              </PlanRow>
            )}
            {plan.stopLoss && <PlanRow label="損切り">{plan.stopLoss}</PlanRow>}
          </dl>
        )}
      </div>
      {sectors.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rule px-4 py-2.5">
          <span className="text-[12px] font-bold text-ink-2">セクター</span>
          {(['priority', 'select', 'caution'] as const).map((kind) => {
            const items = sectors.filter((s) => s.stance === kind);
            if (items.length === 0) return null;
            return (
              <span key={kind} className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                <span className={cx('rounded-sm border px-1.5 py-px text-[11px] font-bold', SECTOR_CLASS[kind])}>{SECTOR_LABEL[kind]}</span>
                <span className="text-ink">{items.map((s) => s.sector).join('、')}</span>
              </span>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/** 米国の関連株（分野ごと。分野の平均騰落も添える） */
export function RelatedStocksPanel({ today }: { today: TodayMarket }) {
  const stocks = today.relatedStocks ?? [];
  if (stocks.length === 0) return null;
  const groups = [...new Set(stocks.map((s) => s.group))].map((group) => {
    const items = stocks.filter((s) => s.group === group);
    return { group, items, avg: items.reduce((a, s) => a + s.changePct, 0) / items.length };
  });
  return (
    <Panel title="米国の関連株" aside="前日の通常取引" bodyClassName="p-0">
      <ul className="divide-y divide-rule">
        {groups.map(({ group, items, avg }) => (
          <li key={group} className="grid grid-cols-[6.5rem_1fr] items-baseline gap-3 px-4 py-2">
            <div>
              <div className="text-[12.5px] font-bold text-ink">{group}</div>
              {items.length > 1 && (
                <div className="text-[11px] text-muted">
                  平均 <ChangePct pct={avg} digits={2} />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px]">
              {items.map((s) => (
                <span key={s.name} className="whitespace-nowrap">
                  <span className="mr-1 text-ink-2">{s.name}</span>
                  <ChangePct pct={s.changePct} digits={2} />
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * 日経の節目。高い順に並べ、寄り付きの位置を差し込む。
 * 寄る前は想定寄り（前日終値 × 想定ギャップ。目安なので「≈」）、寄った後は実際の寄り。
 */
export function LevelsPanel({ today, previousClose }: { today: TodayMarket; previousClose: number | null }) {
  const levels = today.levels ?? [];
  if (levels.length === 0 && !today.breadth) return null;
  const actual = today.actualOpen;
  const close = previousClose ?? today.externalQuotes.find((q) => q.id === 'nikkei225')?.value;
  // 想定寄りが未確認なら、寄るまで印は出さない
  const openPrice = actual
    ? (actual.price ?? (close ? Math.round(close * (1 + actual.gapPct / 100)) : null))
    : close && !today.expectedOpen.unconfirmed
      ? Math.round(close * (1 + today.expectedOpen.gapPct / 100))
      : null;
  const openLabel = actual ? `実際の寄り（${openGapLabel(actual.gapPct)}）` : `想定寄り（目安・${today.expectedOpen.label}）`;
  const rows = [
    ...levels.map((l) => ({ ...l, expected: false })),
    ...(openPrice !== null && levels.length > 0 ? [{ price: openPrice, label: openLabel, expected: true }] : []),
  ].sort((a, b) => b.price - a.price);

  return (
    <Panel title="日経の節目" aside="現物基準" bodyClassName="p-0">
      {rows.length > 0 && (
        <ol className="relative py-1.5">
          {/* 縦の軸 */}
          <span className="absolute top-3 bottom-3 left-[1.375rem] w-px bg-rule-strong" aria-hidden />
          {rows.map((r) => (
            <li
              key={`${r.price}-${r.label}`}
              className={cx('relative flex items-baseline gap-3 py-1 pr-4 pl-10 text-[12.5px]', r.expected && 'bg-accent-soft/60')}
            >
              <span
                className={cx(
                  'absolute top-1/2 left-[1.125rem] h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2',
                  r.expected ? 'border-accent bg-accent' : 'border-rule-strong bg-panel',
                )}
                aria-hidden
              />
              <span className={cx('num w-20 shrink-0 text-right', r.expected ? 'font-bold text-accent' : 'font-semibold text-ink')}>
                {r.expected && !actual ? '≈ ' : ''}
                {formatNumber(r.price, r.price % 1 === 0 ? 0 : 2)}
              </span>
              <span className={cx(r.expected ? 'font-semibold text-accent' : 'text-ink-2')}>{r.label}</span>
            </li>
          ))}
        </ol>
      )}
      {today.breadth && (
        <p className="border-t border-rule px-4 py-2 text-[12px] text-ink-2">
          <span className="mr-1.5 font-bold">前日の広がり</span>
          {today.breadth}
        </p>
      )}
    </Panel>
  );
}

const IMPACT_LABEL: Record<StockCatalyst['impact'], string> = { positive: '好材料', negative: '悪材料', neutral: '中立' };
const IMPACT_CLASS: Record<StockCatalyst['impact'], string> = {
  positive: 'text-up',
  negative: 'text-down',
  neutral: 'text-muted',
};

/** 個別材料と夜間PTS（国内材料の上に出す） */
export function StockNotes({ today }: { today: TodayMarket }) {
  const catalysts = today.catalysts ?? [];
  const pts = today.pts ?? [];
  if (catalysts.length === 0 && pts.length === 0) return null;
  return (
    <div className="space-y-3">
      {catalysts.length > 0 && (
        <div>
          <h3 className="mb-1 text-[12px] font-bold text-ink-2">個別材料</h3>
          <ul className="space-y-1 text-[13px]">
            {catalysts.map((c) => (
              <li key={`${c.code ?? c.name}-${c.text}`} className="leading-snug">
                {c.code && <span className="num mr-1 text-[11.5px] text-ink-2">{c.code}</span>}
                <span className="font-semibold">{c.name}</span>
                <span className={cx('ml-1.5 text-[11px] font-semibold', IMPACT_CLASS[c.impact])}>{IMPACT_LABEL[c.impact]}</span>
                <span className="block text-[12.5px] text-ink-2">{c.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pts.length > 0 && (
        <div>
          <h3 className="mb-1 text-[12px] font-bold text-ink-2">前夜のPTS（東証終値比）</h3>
          <ul className="space-y-0.5 text-[12.5px]">
            {pts.map((p) => (
              <li key={p.code ?? p.name} className="flex items-baseline justify-between gap-3">
                <span>
                  {p.code && <span className="num mr-1 text-[11.5px] text-ink-2">{p.code}</span>}
                  {p.name}
                </span>
                <span className="whitespace-nowrap">
                  {p.price !== undefined && <span className="num mr-2 text-ink-2">{formatPrice(p.price)}</span>}
                  {p.changePct !== undefined && <ChangePct pct={p.changePct} digits={2} />}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
