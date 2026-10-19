/** 画面共通の小さな部品 */
import type { ReactNode } from 'react';
import type { WarningTag } from '../lib/warnings';
import { formatNumber, formatPct, formatScore, formatSigned } from '../lib/format';
import { STANCE_LABELS } from '../lib/market';
import type { MarketStance, QuotePolarity } from '../types/dataset';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');
export { cx };

// ---------------------------------------------------------------------------
// レイアウト
// ---------------------------------------------------------------------------

export function Panel({
  title,
  aside,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section className={cx('panel', className)} aria-labelledby={id}>
      {(title || aside) && (
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-2.5">
          {title && (
            <h2 id={id} className="text-[13px] font-bold text-ink">
              {title}
            </h2>
          )}
          {aside && <div className="text-[12px] text-muted">{aside}</div>}
        </header>
      )}
      {/* bodyClassName を渡すと既定の余白を置き換える */}
      <div className={bodyClassName ?? 'px-4 py-3'}>{children}</div>
    </section>
  );
}

export function PageTitle({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-lg font-bold tracking-tight text-ink">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 数値表示
// ---------------------------------------------------------------------------

/** 符号と polarity から色クラスを決める（グリーン/レッドはここでしか使わない） */
export function directionClass(value: number, polarity: QuotePolarity = 'up-good'): string {
  if (polarity === 'neutral' || value === 0) return 'text-ink-2';
  const good = polarity === 'up-good' ? value > 0 : value < 0;
  return good ? 'text-up' : 'text-down';
}

export function Arrow({ value }: { value: number }) {
  if (value === 0) return <span aria-hidden>―</span>;
  return <span aria-hidden>{value > 0 ? '▲' : '▼'}</span>;
}

/** 前日比など。pct を渡すと「+12.3（+1.2%）」形式 */
export function Change({
  value,
  pct,
  digits = 1,
  polarity = 'up-good',
  className,
}: {
  value: number;
  pct?: number;
  digits?: number;
  polarity?: QuotePolarity;
  className?: string;
}) {
  const trend = value !== 0 ? value : (pct ?? 0);
  const label = trend > 0 ? '上昇' : trend < 0 ? '下落' : '変わらず';
  return (
    <span className={cx('num whitespace-nowrap', directionClass(trend, polarity), className)}>
      <span className="sr-only">{label}</span>
      <Arrow value={trend} /> {value === 0 && pct !== undefined ? formatPct(pct, 2) : formatSigned(value, digits)}
      {value !== 0 && pct !== undefined && <span className="ml-1">({formatPct(pct, 2)})</span>}
    </span>
  );
}

/** 騰落率のみ */
export function ChangePct({ pct, digits = 1, className }: { pct: number; digits?: number; className?: string }) {
  return (
    <span className={cx('num whitespace-nowrap', directionClass(pct), className)}>
      <Arrow value={pct} /> {formatPct(pct, digits)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// スコア
// ---------------------------------------------------------------------------

type Tone = 'accent' | 'caution';

/** 0〜100 の細いメーター。トラックは同系色の薄い段 */
export function ScoreBar({ value, tone = 'accent', className }: { value: number; tone?: Tone; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  // 幅の指定（w-12 など）があればそれを使い、横並びで潰れないよう縮ませない。無ければ親の幅いっぱい
  const sized = /(^|\s)w-/.test(className ?? '');
  return (
    <div
      className={cx(
        'h-1.5 overflow-hidden rounded-full',
        sized ? 'shrink-0' : 'w-full',
        tone === 'accent' ? 'bg-accent-track' : 'bg-caution-track',
        className,
      )}
      aria-hidden
    >
      <div
        className={cx('h-full rounded-full', tone === 'accent' ? 'bg-accent' : 'bg-caution-fill')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** 表のセル用：数値＋メーター */
export function ScoreCell({ value, tone = 'accent', label }: { value: number; tone?: Tone; label: string }) {
  return (
    <div className="ml-auto w-12" title={`${label} ${formatScore(value)}`}>
      <div className="num text-right text-[13px] leading-tight">{formatScore(value)}</div>
      <ScoreBar value={value} tone={tone} className="mt-1" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// タグ・バッジ
// ---------------------------------------------------------------------------

function AlertIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" aria-hidden>
      <path d="M6 1.2 11 10.4H1z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 4.6v2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="8.8" r=".75" fill="currentColor" />
    </svg>
  );
}

const SEVERITY_CLASS: Record<WarningTag['severity'], string> = {
  high: 'bg-caution text-panel border-caution',
  medium: 'bg-caution-soft text-caution border-caution/40',
  low: 'bg-panel text-ink-2 border-rule-strong',
};
const SEVERITY_LABEL: Record<WarningTag['severity'], string> = { high: '重要', medium: '注意', low: '参考' };

export function WarningTagView({ tag }: { tag: WarningTag }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[11px] leading-[1.5] font-semibold whitespace-nowrap',
        SEVERITY_CLASS[tag.severity],
      )}
      title={`${SEVERITY_LABEL[tag.severity]}: ${tag.detail}`}
    >
      {tag.severity !== 'low' && <AlertIcon />}
      <span className="sr-only">{SEVERITY_LABEL[tag.severity]}：</span>
      {tag.label}
    </span>
  );
}

export function WarningTags({ warnings, max }: { warnings: WarningTag[]; max?: number }) {
  if (warnings.length === 0) return <span className="text-[12px] text-muted">—</span>;
  const shown = max ? warnings.slice(0, max) : warnings;
  const rest = warnings.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((w) => (
        <WarningTagView key={`${w.id}-${w.label}`} tag={w} />
      ))}
      {rest > 0 && <span className="text-[11px] text-muted">+{rest}</span>}
    </div>
  );
}

const STANCE_CLASS: Record<MarketStance, string> = {
  bullish: 'border-up/40 bg-up-soft text-up',
  neutral: 'border-rule-strong bg-panel-2 text-ink-2',
  bearish: 'border-down/40 bg-down-soft text-down',
};

export function StanceBadge({ stance }: { stance: MarketStance }) {
  return (
    <span className={cx('inline-flex items-center rounded-sm border px-2 py-0.5 text-[12px] font-bold', STANCE_CLASS[stance])}>
      スタンス：{STANCE_LABELS[stance]}
    </span>
  );
}

export function Value({ value, digits = 0, unit }: { value: number | null | undefined; digits?: number; unit?: string }) {
  return (
    <span className="num">
      {formatNumber(value, digits)}
      {unit && value !== null && value !== undefined && <span className="ml-0.5 font-sans text-[0.85em] text-muted">{unit}</span>}
    </span>
  );
}

/** ラベルと値の定義リスト（指標表） */
export function KeyValueGrid({ rows }: { rows: { label: string; value: ReactNode; hint?: string }[] }) {
  return (
    <dl className="text-[13px]">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 border-b border-rule py-1.5 last:border-b-0">
          <dt className="shrink-0 text-muted" title={r.hint}>
            {r.label}
          </dt>
          <dd className="text-right">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
