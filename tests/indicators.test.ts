import { describe, expect, it } from 'vitest';
import { atr, buildSnapshots, rsi, sma, type DailyBar } from '../src/lib/indicators';

const bars = (closes: number[]): DailyBar[] =>
  closes.map((c, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: c,
    high: c + 2,
    low: c - 2,
    close: c,
    volume: 1000 * (i + 1),
  }));

describe('indicators', () => {
  it('sma は末尾 period 本の平均', () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(sma([1, 2, 3, 4, 5], 2)).toBe(4.5);
    expect(sma([1, 2], 5)).toBeNull();
  });

  it('上昇だけなら RSI は 100、下落だけなら 0', () => {
    expect(rsi(Array.from({ length: 20 }, (_, i) => 100 + i))).toBe(100);
    expect(rsi(Array.from({ length: 20 }, (_, i) => 100 - i))).toBeCloseTo(0);
  });

  it('値幅が一定なら ATR はその値幅', () => {
    expect(atr(bars(Array(30).fill(100)))).toBeCloseTo(4);
  });

  it('スナップショット：20日高値は基準日を除いて計算する', () => {
    const closes = [...Array.from({ length: 29 }, () => 100), 120];
    const snap = buildSnapshots(bars(closes));
    expect(snap.price.close).toBe(120);
    expect(snap.price.high20d).toBe(102);
    expect(snap.price.changePct).toBe(20);
    expect(snap.technical.ma5).toBe(104);
    expect(snap.volume.latest).toBe(30_000);
  });
});
