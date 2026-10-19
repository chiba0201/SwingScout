/**
 * 日足CSV（Date,Open,High,Low,Close,Volume）の要約。データ更新画面の「基準日」表示と取得計画に使う。
 */
import type { ISODate } from '../types/dataset';

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/** 日足CSVの最後の日付（Date 列の最大値）。読めなければ null */
export function lastBarDate(csv: string): ISODate | null {
  let last: string | null = null;
  for (const line of csv.split('\n')) {
    const head = line.trimStart().replace(/^"/, '').slice(0, 10);
    if (DATE_RE.test(head) && (last === null || head > last)) last = head;
  }
  return last;
}

export interface PriceDateSummary {
  /** 日足全体の基準日（いちばん新しい日足の日付） */
  latest: ISODate | null;
  /** 基準日の足まである銘柄数 */
  upToDate: number;
  /** 基準日より前で止まっている銘柄（売買停止・取得漏れなど） */
  stale: string[];
}

export function summarizePriceDates(codes: readonly string[], pricesByCode: ReadonlyMap<string, string>): PriceDateSummary {
  const lastByCode = new Map<string, ISODate>();
  for (const code of codes) {
    const csv = pricesByCode.get(code);
    const last = csv ? lastBarDate(csv) : null;
    if (last) lastByCode.set(code, last);
  }
  let latest: ISODate | null = null;
  for (const d of lastByCode.values()) if (latest === null || d > latest) latest = d;
  const stale = [...lastByCode].filter(([, d]) => d !== latest).map(([code]) => code);
  return { latest, upToDate: lastByCode.size - stale.length, stale };
}

/** 取得をこの件数ずつに分けて進捗を出す */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
