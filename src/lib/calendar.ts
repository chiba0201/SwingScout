/**
 * 取引カレンダー関連のユーティリティ。
 * 日付は 'YYYY-MM-DD' 文字列のまま扱い、計算は UTC で行う（タイムゾーン起因のずれを避けるため）。
 */
import type { ISODate } from '../types/dataset';

const DAY_MS = 86_400_000;
const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/**
 * 東証の休場日（土日以外）。
 * TODO: JPX の「休業日一覧」から年1回更新する。将来は data/market-calendar.json に外出ししてもよい。
 */
export const JP_MARKET_HOLIDAYS: Readonly<Record<ISODate, string>> = {
  '2025-01-01': '元日',
  '2025-01-02': '年始休場',
  '2025-01-03': '年始休場',
  '2025-01-13': '成人の日',
  '2025-02-11': '建国記念の日',
  '2025-02-24': '振替休日',
  '2025-03-20': '春分の日',
  '2025-04-29': '昭和の日',
  '2025-05-05': 'こどもの日',
  '2025-05-06': '振替休日',
  '2025-07-21': '海の日',
  '2025-08-11': '山の日',
  '2025-09-15': '敬老の日',
  '2025-09-23': '秋分の日',
  '2025-10-13': 'スポーツの日',
  '2025-11-03': '文化の日',
  '2025-11-24': '振替休日',
  '2025-12-31': '年末休場',
  '2026-01-01': '元日',
  '2026-01-02': '年始休場',
  '2026-01-12': '成人の日',
  '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日',
  '2026-04-29': '昭和の日',
  '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日',
  '2026-05-06': '振替休日',
  '2026-07-20': '海の日',
  '2026-08-11': '山の日',
  '2026-09-21': '敬老の日',
  '2026-09-22': '国民の休日',
  '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日',
  '2026-11-23': '勤労感謝の日',
  '2026-12-31': '年末休場',
  '2027-01-01': '元日',
  '2027-01-11': '成人の日',
  '2027-02-11': '建国記念の日',
  '2027-02-23': '天皇誕生日',
  '2027-03-22': '振替休日',
  '2027-04-29': '昭和の日',
  '2027-05-03': '憲法記念日',
  '2027-05-04': 'みどりの日',
  '2027-05-05': 'こどもの日',
  '2027-07-19': '海の日',
  '2027-08-11': '山の日',
  '2027-09-20': '敬老の日',
  '2027-09-23': '秋分の日',
  '2027-10-11': 'スポーツの日',
  '2027-11-03': '文化の日',
  '2027-11-23': '勤労感謝の日',
  '2027-12-31': '年末休場',
};

// ---------------------------------------------------------------------------
// 基本操作
// ---------------------------------------------------------------------------

export function toTime(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function fromTime(time: number): ISODate {
  return new Date(time).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromTime(toTime(date) + days * DAY_MS);
}

/** 0=日 … 6=土 */
export function weekday(date: ISODate): number {
  return new Date(toTime(date)).getUTCDay();
}

export function weekdayJa(date: ISODate): string {
  return WEEKDAY_JA[weekday(date)] ?? '';
}

/** '10/6(火)' 形式 */
export function formatDateJa(date: ISODate, withWeekday = true): string {
  const [, m, d] = date.split('-').map(Number);
  return withWeekday ? `${m}/${d}(${weekdayJa(date)})` : `${m}/${d}`;
}

export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toTime(to) - toTime(from)) / DAY_MS);
}

export function holidayName(date: ISODate): string | undefined {
  return JP_MARKET_HOLIDAYS[date];
}

export function isBusinessDay(date: ISODate): boolean {
  const wd = weekday(date);
  return wd !== 0 && wd !== 6 && !holidayName(date);
}

export function nextBusinessDay(date: ISODate): ISODate {
  let d = addDays(date, 1);
  while (!isBusinessDay(d)) d = addDays(d, 1);
  return d;
}

export function prevBusinessDay(date: ISODate): ISODate {
  let d = addDays(date, -1);
  while (!isBusinessDay(d)) d = addDays(d, -1);
  return d;
}

/** n 営業日後（n<0 なら前）。date 自体が休場でも可 */
export function addBusinessDays(date: ISODate, n: number): ISODate {
  let d = date;
  for (let i = 0; i < Math.abs(n); i++) d = n > 0 ? nextBusinessDay(d) : prevBusinessDay(d);
  return d;
}

/**
 * from から to までの営業日数（from は含まず to は含む）。to が過去なら負数。
 */
export function businessDaysBetween(from: ISODate, to: ISODate): number {
  if (from === to) return 0;
  const sign = toTime(to) > toTime(from) ? 1 : -1;
  let count = 0;
  let d = from;
  while (d !== to) {
    d = addDays(d, sign);
    if (isBusinessDay(d)) count += sign;
  }
  return count;
}

/** from〜to（両端含む）の営業日一覧 */
export function businessDaysInRange(from: ISODate, to: ISODate): ISODate[] {
  const days: ISODate[] = [];
  for (let d = from; toTime(d) <= toTime(to); d = addDays(d, 1)) {
    if (isBusinessDay(d)) days.push(d);
  }
  return days;
}

// ---------------------------------------------------------------------------
// SQ
// ---------------------------------------------------------------------------

/**
 * その月のSQ日（第2金曜。休場なら前営業日）。
 * 3・6・9・12月はメジャーSQ、それ以外はミニSQ（日経225mini・オプション）。
 */
export function sqDate(year: number, month: number): { date: ISODate; major: boolean } {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const offsetToFriday = (5 - weekday(first) + 7) % 7;
  let date = addDays(first, offsetToFriday + 7);
  if (!isBusinessDay(date)) date = prevBusinessDay(date);
  return { date, major: month % 3 === 0 };
}

// ---------------------------------------------------------------------------
// 保有ウィンドウ
// ---------------------------------------------------------------------------

export interface HoldingPattern {
  id: string;
  /** '火曜In金曜out' */
  label: string;
  /** 0=日 … 6=土 */
  entryWeekday: number;
  exitWeekday: number;
}

export const HOLDING_PATTERNS: readonly HoldingPattern[] = [
  { id: 'tue-fri', label: '火曜In金曜out', entryWeekday: 2, exitWeekday: 5 },
  { id: 'mon-fri', label: '月曜In金曜out', entryWeekday: 1, exitWeekday: 5 },
  { id: 'tue-thu', label: '火曜In木曜out', entryWeekday: 2, exitWeekday: 4 },
];

export const DEFAULT_HOLDING_PATTERN: HoldingPattern = HOLDING_PATTERNS[0]!;

export function findHoldingPattern(id: string | undefined): HoldingPattern {
  return HOLDING_PATTERNS.find((p) => p.id === id) ?? DEFAULT_HOLDING_PATTERN;
}

export interface HoldingWindow {
  pattern: HoldingPattern;
  asOf: ISODate;
  entryDate: ISODate;
  exitDate: ISODate;
  /** 保有期間の営業日（entry〜exit 両端含む） */
  holdingDays: ISODate[];
  /** その週の月〜金（作戦ボード表示用） */
  weekDays: ISODate[];
  /** exit の次の営業日 */
  nextOpenAfterExit: ISODate;
  /** exit 後、次の営業日までの休場日数（通常の週末なら2） */
  closedDaysAfterExit: number;
}

/**
 * 基準日の後に来る最初の「エントリー曜日」を起点に保有ウィンドウを決める。
 * エントリー日が休場なら翌営業日へ、エグジット日が休場なら前営業日へずらす。
 */
export function computeHoldingWindow(
  asOf: ISODate,
  pattern: HoldingPattern = DEFAULT_HOLDING_PATTERN,
): HoldingWindow {
  let candidate = addDays(asOf, 1);
  for (let guard = 0; guard < 8; guard++) {
    while (weekday(candidate) !== pattern.entryWeekday) candidate = addDays(candidate, 1);

    const monday = addDays(candidate, 1 - weekday(candidate));
    const plannedExit = addDays(monday, pattern.exitWeekday - 1);
    const entryDate = isBusinessDay(candidate) ? candidate : nextBusinessDay(candidate);
    const exitDate = isBusinessDay(plannedExit) ? plannedExit : prevBusinessDay(plannedExit);

    if (toTime(entryDate) <= toTime(exitDate)) {
      const nextOpenAfterExit = nextBusinessDay(exitDate);
      return {
        pattern,
        asOf,
        entryDate,
        exitDate,
        holdingDays: businessDaysInRange(entryDate, exitDate),
        weekDays: [0, 1, 2, 3, 4].map((i) => addDays(monday, i)),
        nextOpenAfterExit,
        closedDaysAfterExit: diffDays(exitDate, nextOpenAfterExit) - 1,
      };
    }
    // 週の大半が休場でエントリーできない場合は翌週へ
    candidate = addDays(candidate, 1);
  }
  throw new Error(`保有ウィンドウを決定できません（asOf=${asOf}）`);
}

/** date が保有期間内（entry〜exit 両端含む）か */
export function isWithinWindow(date: ISODate, window: HoldingWindow): boolean {
  const t = toTime(date);
  return t >= toTime(window.entryDate) && t <= toTime(window.exitDate);
}
