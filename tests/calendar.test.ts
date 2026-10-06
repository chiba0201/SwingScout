import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  businessDaysBetween,
  computeHoldingWindow,
  findHoldingPattern,
  isBusinessDay,
  sqDate,
} from '../src/lib/calendar';

describe('calendar', () => {
  it('土日と祝日は営業日ではない', () => {
    expect(isBusinessDay('2026-10-09')).toBe(true); // 金
    expect(isBusinessDay('2026-10-10')).toBe(false); // 土
    expect(isBusinessDay('2026-10-12')).toBe(false); // スポーツの日
  });

  it('営業日の加算・差分', () => {
    expect(addBusinessDays('2026-10-09', 1)).toBe('2026-10-13');
    expect(businessDaysBetween('2026-10-06', '2026-10-13')).toBe(4);
    expect(businessDaysBetween('2026-10-13', '2026-10-06')).toBe(-4);
  });

  it('SQ日は第2金曜（3・6・9・12月はメジャー）', () => {
    expect(sqDate(2026, 10)).toEqual({ date: '2026-10-09', major: false });
    expect(sqDate(2026, 12)).toEqual({ date: '2026-12-11', major: true });
  });

  it('月曜引け基準なら同じ週の火曜In・金曜Out', () => {
    const w = computeHoldingWindow('2026-10-05');
    expect(w.entryDate).toBe('2026-10-06');
    expect(w.exitDate).toBe('2026-10-09');
    expect(w.holdingDays).toHaveLength(4);
    expect(w.nextOpenAfterExit).toBe('2026-10-13');
    expect(w.closedDaysAfterExit).toBe(3); // 土日＋スポーツの日
  });

  it('金曜引け基準なら翌週の火曜In', () => {
    const w = computeHoldingWindow('2026-10-02');
    expect(w.entryDate).toBe('2026-10-06');
  });

  it('エントリー曜日が祝日なら翌営業日にずらす', () => {
    // 2026-09-22(火) は国民の休日、09-23(水) は秋分の日
    const w = computeHoldingWindow('2026-09-18', findHoldingPattern('tue-fri'));
    expect(w.entryDate).toBe('2026-09-24');
    expect(w.exitDate).toBe('2026-09-25');
  });
});
