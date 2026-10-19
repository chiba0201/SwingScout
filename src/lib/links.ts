/**
 * 外部サイトへのリンク先（画面に置くリンクの URL を組み立てるだけ。アプリから通信はしない）。
 */

/** 東証の銘柄コード（4桁。2桁目・4桁目に英字を使う新形式 例: 130A も可） */
const TSE_CODE = /^\d[0-9A-Z]\d[0-9A-Z]$/;

export function isTseCode(code: string): boolean {
  return TSE_CODE.test(code.trim().toUpperCase());
}

/** Yahoo!ファイナンスの銘柄ページ。東証の銘柄コードでなければ null（サンプルの架空コードなど） */
export function yahooFinanceUrl(code: string): string | null {
  const c = code.trim().toUpperCase();
  return isTseCode(c) ? `https://finance.yahoo.co.jp/quote/${c}.T` : null;
}
