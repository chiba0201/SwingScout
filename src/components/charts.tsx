/**
 * 小さな可視化部品（依存ライブラリなし）。
 * 色はトークンのみ：線・軸は無彩色、グリーン/レッドは上昇/下落の意味があるときだけ。
 */
import { useId } from 'react';
import { formatPct, formatPrice, pctFrom } from '../lib/format';
import type { SectorMove } from '../types/dataset';
import { cx } from './ui';

// ---------------------------------------------------------------------------
// スパークライン
// ---------------------------------------------------------------------------

export function Sparkline({
  values,
  width = 96,
  height = 28,
  className,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  label?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 3;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2));
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const up = last >= first;
  const summary = `${label ?? '終値推移'}：${values.length}日間で${formatPct(pctFrom(last, first))}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cx('overflow-visible', className)}
      role="img"
      aria-label={summary}
    >
      <title>{summary}</title>
      <polyline points={points} fill="none" stroke="var(--c-muted)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle
        cx={x(values.length - 1)}
        cy={y(last)}
        r="2.75"
        fill={up ? 'var(--c-up)' : 'var(--c-down)'}
        stroke="var(--c-panel)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 価格ラダー（損切り・エントリーゾーン・終値・利確を1本の数直線に）
// ---------------------------------------------------------------------------

interface LadderMark {
  key: string;
  price: number;
  label: string;
  tone: 'down' | 'ink' | 'up';
}

export function PriceLadder({
  close,
  stop,
  zoneLow,
  zoneHigh,
  targets,
}: {
  close: number;
  stop: number;
  zoneLow?: number;
  zoneHigh?: number;
  targets: { price: number; label: string }[];
}) {
  const marks: LadderMark[] = [
    { key: 'stop', price: stop, label: '損切り', tone: 'down' } satisfies LadderMark,
    { key: 'close', price: close, label: '終値', tone: 'ink' } satisfies LadderMark,
    ...targets.map((t, i): LadderMark => ({ key: `t${i}`, price: t.price, label: `利確${i + 1}`, tone: 'up' })),
  ].sort((a, b) => a.price - b.price);

  const prices = [...marks.map((m) => m.price), zoneLow ?? close, zoneHigh ?? close];
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || 1;
  const pos = (p: number) => 6 + ((p - lo) / span) * 88; // 左右6%の余白

  const toneClass = { down: 'bg-down', ink: 'bg-ink', up: 'bg-up' } as const;
  const textClass = { down: 'text-down', ink: 'text-ink', up: 'text-up' } as const;

  return (
    <figure className="m-0">
      <div className="relative h-[84px]" role="img" aria-label={marks.map((m) => `${m.label} ${formatPrice(m.price)}円`).join('、')}>
        {/* 軸 */}
        <div className="absolute top-1/2 right-0 left-0 h-px bg-rule-strong" />
        {/* 損切り〜終値（リスク）と終値〜利確（リワード）の区間 */}
        <div className="absolute top-1/2 h-[3px] -translate-y-1/2 bg-down/35" style={{ left: `${pos(stop)}%`, width: `${pos(close) - pos(stop)}%` }} />
        {targets.length > 0 && (
          <div
            className="absolute top-1/2 h-[3px] -translate-y-1/2 bg-up/35"
            style={{ left: `${pos(close)}%`, width: `${pos(Math.max(...targets.map((t) => t.price))) - pos(close)}%` }}
          />
        )}
        {/* エントリーゾーン */}
        {zoneLow !== undefined && zoneHigh !== undefined && (
          <div
            className="absolute top-1/2 h-3.5 -translate-y-1/2 rounded-sm border border-accent bg-accent-soft"
            style={{ left: `${pos(zoneLow)}%`, width: `max(${pos(zoneHigh) - pos(zoneLow)}%, 4px)` }}
            title={`エントリーゾーン ${formatPrice(zoneLow)}〜${formatPrice(zoneHigh)}円`}
          />
        )}
        {marks.map((m, i) => {
          const above = i % 2 === 1;
          return (
            <div key={m.key} className="absolute top-0 bottom-0" style={{ left: `${pos(m.price)}%` }}>
              <div className={cx('absolute top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full', toneClass[m.tone])} />
              <div
                className={cx(
                  'absolute -translate-x-1/2 text-center leading-tight whitespace-nowrap',
                  above ? 'top-0' : 'bottom-0',
                )}
              >
                <div className={cx('text-[10.5px] font-semibold', textClass[m.tone])}>{m.label}</div>
                <div className="num text-[11.5px] text-ink">{formatPrice(m.price)}</div>
              </div>
            </div>
          );
        })}
      </div>
      {zoneLow !== undefined && zoneHigh !== undefined && (
        <figcaption className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block h-2.5 w-4 rounded-sm border border-accent bg-accent-soft" aria-hidden />
          エントリーゾーン {formatPrice(zoneLow)}〜{formatPrice(zoneHigh)}円
        </figcaption>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 業種別騰落（中心軸から左右に伸びる横棒）
// ---------------------------------------------------------------------------

export function SectorBars({ sectors }: { sectors: SectorMove[] }) {
  const id = useId();
  const sorted = [...sectors].sort((a, b) => b.changePct - a.changePct);
  const maxAbs = Math.max(0.5, ...sorted.map((s) => Math.abs(s.changePct)));

  return (
    <table className="w-full text-[12px]" aria-describedby={id}>
      <caption id={id} className="sr-only">
        業種別騰落率（基準日）
      </caption>
      <tbody>
        {sorted.map((s) => {
          const width = (Math.abs(s.changePct) / maxAbs) * 50;
          const up = s.changePct >= 0;
          return (
            <tr key={s.sector} className="group" title={`${s.sector} ${formatPct(s.changePct)}`}>
              <th scope="row" className="w-[7.5em] py-[3px] pr-2 text-left font-normal whitespace-nowrap text-ink-2">
                {s.sector}
              </th>
              <td className="py-[3px]">
                <div className="relative h-3">
                  <div className="absolute top-[-3px] bottom-[-3px] left-1/2 w-px bg-rule-strong" />
                  <div
                    className={cx('absolute top-0 h-full', up ? 'rounded-r-[3px] bg-up' : 'rounded-l-[3px] bg-down', 'group-hover:opacity-80')}
                    style={up ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }}
                  />
                </div>
              </td>
              <td className="num w-[4.5em] py-[3px] pl-2 text-right text-ink">{formatPct(s.changePct)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
