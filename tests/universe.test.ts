import { describe, expect, it } from 'vitest';
import type { AnalyzedCandidate } from '../src/lib/analysis';
import { buildDatasetInBrowser } from '../src/lib/browserDatasetBuilder';
import { addBusinessDays } from '../src/lib/calendar';
import { chunk, lastBarDate, summarizePriceDates } from '../src/lib/priceSummary';
import {
  carryOverFavorites,
  decodeCsvBytes,
  favoriteCodes,
  isFavoriteValue,
  readUniverseEntries,
  setFavorite,
  universeCsvFromDataset,
  validateUniverseCsv,
} from '../src/lib/universeCsv';
import { buildUniverseRows, filterUniverseRows, sortUniverseRows } from '../src/lib/universeRows';
import { validateDataset } from '../src/lib/validate';
import type { MarketContext } from '../src/types/dataset';

const LIST = `code,name,sector,theme,fundamentalNote
1001,大型株,電気機器,半導体,"注記, カンマ入り"
1002,小型株,サービス業,,
1003,日足なし,銀行業,,
`;

describe('universeCsv', () => {
  it('favorite 列の値を真偽にする', () => {
    for (const v of ['1', 'true', 'YES', '○', '★', ' 1 ']) expect(isFavoriteValue(v)).toBe(true);
    for (const v of ['', '0', 'false', 'no', undefined]) expect(isFavoriteValue(v)).toBe(false);
  });

  it('必須列が無いCSVは入稿できない', () => {
    expect(validateUniverseCsv('code,name\n1001,A\n')).toMatchObject({ ok: false });
    expect(validateUniverseCsv('code,name,sector\n')).toMatchObject({ ok: false });
    expect(validateUniverseCsv(LIST)).toEqual({ ok: true, count: 3 });
    // 日本語の列名でもよい
    expect(validateUniverseCsv('コード,銘柄名,業種\n1001,A,電気機器\n')).toEqual({ ok: true, count: 1 });
  });

  it('お気に入りの付け外しで favorite 列を足し、ほかの列はそのまま残す', () => {
    const on = setFavorite(LIST, '1002', true);
    expect(on.split('\n')[0]).toBe('code,name,sector,theme,fundamentalNote,favorite');
    expect([...favoriteCodes(on)]).toEqual(['1002']);
    expect(on).toContain('"注記, カンマ入り"');
    const both = setFavorite(on, '1001', true);
    expect([...favoriteCodes(both)].sort()).toEqual(['1001', '1002']);
    expect([...favoriteCodes(setFavorite(both, '1002', false))]).toEqual(['1001']);
    expect(readUniverseEntries(both)).toHaveLength(3);
  });

  it('favorite 列の無いCSVを入稿したら、いまのお気に入りを引き継ぐ', () => {
    const carried = carryOverFavorites(LIST, new Set(['1003', '9999']));
    expect([...favoriteCodes(carried)]).toEqual(['1003']);
    // favorite 列があれば入稿した内容を優先する
    const withColumn = setFavorite(LIST, '1001', true);
    expect(carryOverFavorites(withColumn, new Set(['1003']))).toBe(withColumn);
  });

  it('Excel の Shift_JIS と BOM 付き UTF-8 を読める', () => {
    const sjis = new Uint8Array([0x83, 0x52, 0x81, 0x5b, 0x83, 0x68, 0x0d, 0x0a]); // 「コード」＋CRLF
    expect(decodeCsvBytes(sjis)).toBe('コード\n');
    const utf8 = new TextEncoder().encode('﻿code,name\r\n');
    expect(decodeCsvBytes(utf8)).toBe('code,name\n');
  });
});

describe('priceSummary', () => {
  it('日足の最後の日と、基準日まで届いていない銘柄', () => {
    const a = 'Date,Close\n2026-10-02,1\n2026-10-05,2\n2026-10-06,3\n';
    const b = 'Date,Close\n2026-10-02,1\n2026-10-05,2\n';
    expect(lastBarDate(a)).toBe('2026-10-06');
    expect(lastBarDate('Date,Close\n')).toBeNull();
    const s = summarizePriceDates(['A', 'B', 'C'], new Map([['A', a], ['B', b]]));
    expect(s).toEqual({ latest: '2026-10-06', upToDate: 1, stale: ['B'] });
  });

  it('小分けにする', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 20)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ブラウザ内生成：お気に入りは足切りしない・銘柄リスト全体を残す
// ---------------------------------------------------------------------------

const AS_OF = '2026-10-06';

function priceCsv(close: number, volume: number, bars = 80): string {
  const lines = ['Date,Open,High,Low,Close,Volume'];
  for (let i = bars - 1; i >= 0; i--) {
    const c = close * (1 - i * 0.001);
    lines.push(`${addBusinessDays(AS_OF, -i)},${c},${c * 1.01},${c * 0.99},${c},${volume}`);
  }
  return `${lines.join('\n')}\n`;
}

const MARKET: MarketContext = {
  stance: 'neutral',
  headline: '',
  summaryToday: '',
  summaryWeek: '',
  indices: [],
  volatility: [],
  fx: [],
  rates: [],
  events: [],
  sectors: [],
  riskNotes: [],
};

function build(universeCsv: string) {
  return buildDatasetInBrowser({
    asOf: AS_OF,
    patternId: 'tue-fri',
    source: 'browser-universe',
    universeCsv,
    market: MARKET,
    pricesByCode: new Map([
      ['1001', priceCsv(3000, 2_000_000)], // 売買代金 約60億円
      ['1002', priceCsv(150, 100_000)], // 株価200円未満・売買代金1億円未満
    ]),
    keep: Number.POSITIVE_INFINITY,
    topN: 6,
    minTurnoverOku: 1,
    minPrice: 200,
    lookbackDays: 260,
  });
}

describe('buildDatasetInBrowser（銘柄リスト）', () => {
  it('条件外の銘柄は採点しないが、銘柄リストには状態つきで残す', () => {
    const { dataset, stats } = build(LIST);
    expect(() => validateDataset(dataset)).not.toThrow();
    expect(dataset.candidates.map((c) => c.code)).toEqual(['1001']);
    expect(dataset.universe?.map((u) => [u.code, u.status, u.favorite])).toEqual([
      ['1001', 'scored', false],
      ['1002', 'filtered', false],
      ['1003', 'no-prices', false],
    ]);
    expect(stats.missingPrices).toEqual(['1003']);
  });

  it('お気に入りは売買代金・株価の条件に関係なく採点する', () => {
    const { dataset } = build(setFavorite(LIST, '1002', true));
    expect(dataset.candidates.map((c) => c.code).sort()).toEqual(['1001', '1002']);
    expect(dataset.candidates.find((c) => c.code === '1002')?.favorite).toBe(true);
    expect(dataset.universe?.find((u) => u.code === '1002')).toMatchObject({ status: 'scored', favorite: true });
    // 生成したデータから銘柄リストを作り直すと、お気に入りも戻る
    expect([...favoriteCodes(universeCsvFromDataset(dataset)!)]).toEqual(['1002']);
  });
});

describe('universeRows', () => {
  const entries = readUniverseEntries(setFavorite(`${LIST}1004,追加銘柄,小売業,,\n`, '1003', true));
  const ranked = [{ code: '1001', rank: 1, theme: '半導体' }] as unknown as AnalyzedCandidate[];
  const rows = buildUniverseRows(entries, ranked, 6, [
    { code: '1001', name: '', sector: '', favorite: false, status: 'scored' },
    { code: '1002', name: '', sector: '', favorite: false, status: 'filtered' },
    { code: '1003', name: '', sector: '', favorite: true, status: 'no-prices' },
  ]);

  it('採点結果と突き合わせて状態を付ける', () => {
    expect(rows.map((r) => [r.code, r.status, r.favorite])).toEqual([
      ['1001', 'top', false],
      ['1002', 'filtered', false],
      ['1003', 'no-prices', true],
      ['1004', 'not-generated', false],
    ]);
  });

  it('順位順（未採点はリストの順で後ろ）・コード順・絞り込み', () => {
    const reversed = [...rows].reverse();
    expect(sortUniverseRows(reversed, 'rank').map((r) => r.code)).toEqual(['1001', '1002', '1003', '1004']);
    expect(sortUniverseRows(reversed, 'code').map((r) => r.code)).toEqual(['1001', '1002', '1003', '1004']);
    expect(filterUniverseRows(rows, '半導体').map((r) => r.code)).toEqual(['1001']);
    expect(filterUniverseRows(rows, '100 銀行').map((r) => r.code)).toEqual(['1003']);
    expect(filterUniverseRows(rows, '  ')).toHaveLength(4);
  });
});
