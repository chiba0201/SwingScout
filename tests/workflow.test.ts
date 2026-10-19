import { describe, expect, it } from 'vitest';
import { jstNow, latestCloseDate, todayJst } from '../src/lib/calendar';
import { datasetModeFromSource, isBrowserGenerated } from '../src/lib/datasetMode';
import { buildWorkflow, isTodayFresh, priceCoverage, universeCodes } from '../src/lib/workflow';

/** 日本時間で指定した日時の Date */
const jst = (iso: string) => new Date(`${iso}+09:00`);

const UNIVERSE = 'code,name,sector\n6857,アドバンテスト,電気機器\n8035,東京エレクトロン,電気機器\n6857,重複,電気機器\n';

describe('日本時間の日付と最新の引け', () => {
  it('UTC の深夜でも日本時間の日付になる', () => {
    expect(todayJst(new Date('2026-10-05T16:00:00Z'))).toBe('2026-10-06');
    expect(jstNow(jst('2026-10-06T08:15:00')).minutes).toBe(8 * 60 + 15);
  });

  it('営業日の15:30以降は当日、それより前は前営業日', () => {
    expect(latestCloseDate(jst('2026-10-06T15:29:00'))).toBe('2026-10-05');
    expect(latestCloseDate(jst('2026-10-06T15:30:00'))).toBe('2026-10-06');
  });

  it('休場日・週末は直前の営業日', () => {
    expect(latestCloseDate(jst('2026-10-12T20:00:00'))).toBe('2026-10-09'); // スポーツの日
    expect(latestCloseDate(jst('2026-10-11T10:00:00'))).toBe('2026-10-09'); // 日曜
  });
});

describe('日足の揃い具合', () => {
  it('銘柄コードを重複なしで取り出し、不足を数える', () => {
    expect(universeCodes(UNIVERSE)).toEqual(['6857', '8035']);
    expect(priceCoverage(UNIVERSE, ['6857'])).toMatchObject({ have: 1, need: 2, missing: ['8035'] });
  });
});

describe('buildWorkflow', () => {
  const now = jst('2026-10-06T08:30:00'); // 火曜の寄り前。最新の引けは 10/5(月)

  it('何もしていなければ最初のステップが次', () => {
    const wf = buildWorkflow({ now, today: null, dataset: { asOf: '2026-10-05', isSample: true, fromBrowser: false }, prices: null });
    expect(wf.next?.id).toBe('market');
    expect(wf.steps.map((s) => s.state)).toEqual(['todo', 'todo', 'todo', 'anytime', 'anytime']);
    expect(wf.latestClose).toBe('2026-10-05');
  });

  it('市況を反映し、日足がそろったら次は候補生成', () => {
    const wf = buildWorkflow({
      now,
      today: { asOf: '2026-10-06', session: '寄り前', fromBrowser: true },
      dataset: { asOf: '2026-10-02', isSample: false, fromBrowser: false },
      prices: { ...priceCoverage(UNIVERSE, ['6857', '8035']), updatedAt: jst('2026-10-06T07:50:00').toISOString() },
    });
    expect(wf.steps[0]?.state).toBe('done');
    expect(wf.steps[1]?.state).toBe('done');
    expect(wf.next?.id).toBe('generate');
  });

  it('日足がそろっていても、最新の引けより前の取得なら取り直し', () => {
    const wf = buildWorkflow({
      now,
      today: { asOf: '2026-10-06', session: '寄り前', fromBrowser: false },
      dataset: null,
      prices: { ...priceCoverage(UNIVERSE, ['6857', '8035']), updatedAt: jst('2026-10-05T10:00:00').toISOString() },
    });
    expect(wf.steps[1]?.state).toBe('todo');
    expect(wf.steps[1]?.detail).toMatch(/より前の取得/);
  });

  it('最新の候補が表示されていれば、日足・候補生成は済み扱い', () => {
    const wf = buildWorkflow({
      now,
      today: { asOf: '2026-10-06', session: '寄り前', fromBrowser: false },
      dataset: { asOf: '2026-10-05', isSample: false, fromBrowser: false },
      prices: null,
    });
    expect(wf.next).toBeNull();
    expect(wf.steps[1]?.detail).toMatch(/不要/);
  });

  it('サンプル表示中は候補生成が未完了', () => {
    const wf = buildWorkflow({
      now,
      today: { asOf: '2026-10-06', session: '寄り前', fromBrowser: false },
      dataset: { asOf: '2026-10-05', isSample: true, fromBrowser: false },
      prices: null,
    });
    expect(wf.steps[2]?.state).toBe('todo');
  });

  it('Today の鮮度', () => {
    expect(isTodayFresh('2026-10-06', now)).toBe(true);
    expect(isTodayFresh('2026-10-05', now)).toBe(false);
    expect(isTodayFresh(null, now)).toBe(false);
  });
});

describe('datasetMode', () => {
  it('このブラウザで作ったデータも種類を判別できる', () => {
    expect(isBrowserGenerated('browser-universe')).toBe(true);
    expect(isBrowserGenerated('universe')).toBe(false);
    expect(datasetModeFromSource('browser-universe').mode).toBe('universe');
    expect(datasetModeFromSource('browser-favorites').mode).toBe('watchlist');
  });
});
