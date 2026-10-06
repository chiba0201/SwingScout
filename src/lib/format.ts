/** 表示用フォーマッタ（UI・レポート共通） */

const nf = (digits: number) =>
  new Intl.NumberFormat('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return nf(digits).format(n);
}

/** 株価。小数があれば1桁まで */
export function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return formatNumber(n, Number.isInteger(n) ? 0 : 1);
}

/** 移動平均などの水準。1,000円以上は整数、未満は小数1桁 */
export function formatLevel(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Math.abs(n) >= 1000 ? formatNumber(Math.round(n)) : formatNumber(n, Number.isInteger(n) ? 0 : 1);
}

export function formatSigned(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const s = formatNumber(Math.abs(n), digits);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

export function formatPct(n: number | null | undefined, digits = 1, signed = true): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${signed ? formatSigned(n, digits) : formatNumber(n, digits)}%`;
}

/** 株数 → '1,234万株' / '1.23億株' */
export function formatShares(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1e8) return `${formatNumber(n / 1e8, 2)}億株`;
  if (n >= 1e4) return `${formatNumber(n / 1e4, 0)}万株`;
  return `${formatNumber(n)}株`;
}

export function formatOku(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${formatNumber(n, n < 10 ? 1 : 0)}億円`;
}

export function formatScore(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toString();
}

/** 価格 p の基準値 base からの変化率（%） */
export function pctFrom(p: number, base: number): number {
  return base === 0 ? 0 : (p / base - 1) * 100;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
}
