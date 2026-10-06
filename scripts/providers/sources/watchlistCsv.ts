/**
 * 最初の実データ運用向けのウォッチリストCSV。
 *
 * 置き場所: raw-data/watchlist.csv
 * 必須列: code, name, sector
 * 任意列: market, theme, usdJpy, beta, fundamentalNote, flags, skipConditions, pattern
 *
 * JPXの全銘柄一覧を整える前に、まず監視したい銘柄だけで実データセットを作るための入口。
 */
import { resolve } from 'node:path';
import type { CandidateComments, Sensitivity } from '../../../src/types/dataset';
import { readCsvRecords } from '../../lib/csv';
import type { Annotation, AnnotationSource, UniverseEntry, UniverseSource } from '../types';

const splitList = (value: string | undefined) =>
  (value ?? '')
    .split(/[|、;]/)
    .map((x) => x.trim())
    .filter(Boolean);

const num = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export class WatchlistCsvSource implements UniverseSource, AnnotationSource {
  readonly id = 'watchlist-csv';
  private cache: Promise<Record<string, string>[]> | null = null;

  constructor(private readonly path = resolve('raw-data/watchlist.csv')) {}

  private async records() {
    this.cache ??= readCsvRecords(this.path).then((records) => {
      if (!records) throw new Error(`${this.path} がありません。raw-data/watchlist.csv を用意してください。`);
      return records;
    });
    return this.cache;
  }

  async getUniverse(): Promise<UniverseEntry[]> {
    return (await this.records())
      .map((r) => ({
        code: r.code ?? r['コード'] ?? '',
        name: r.name ?? r['銘柄名'] ?? '',
        market: r.market ?? r['市場'] ?? undefined,
        sector: r.sector ?? r['業種'] ?? '',
        theme: r.theme ?? r['テーマ'] ?? undefined,
      }))
      .filter((e) => e.code && e.name && e.sector);
  }

  async getAnnotations(codes: string[]): Promise<Map<string, Annotation>> {
    const wanted = new Set(codes);
    const out = new Map<string, Annotation>();
    for (const r of await this.records()) {
      const code = r.code ?? r['コード'] ?? '';
      if (!wanted.has(code)) continue;
      const sensitivity: Sensitivity = {};
      const usdJpy = num(r.usdJpy);
      const beta = num(r.beta);
      if (usdJpy !== undefined) sensitivity.usdJpy = usdJpy;
      if (beta !== undefined) sensitivity.beta = beta;

      const comments: Partial<CandidateComments> = {};
      if (r.supplyDemandComment) comments.supplyDemand = r.supplyDemandComment;
      if (r.technicalComment) comments.technical = r.technicalComment;
      if (r.fundamentalComment) comments.fundamental = r.fundamentalComment;

      out.set(code, {
        theme: r.theme ?? r['テーマ'] ?? undefined,
        sensitivity: Object.keys(sensitivity).length ? sensitivity : undefined,
        fundamentalNote: r.fundamentalNote || undefined,
        pattern: r.pattern || undefined,
        flags: splitList(r.flags),
        skipConditions: splitList(r.skipConditions),
        comments: Object.keys(comments).length ? comments : undefined,
      });
    }
    return out;
  }
}
