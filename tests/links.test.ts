import { describe, expect, it } from 'vitest';
import { isTseCode, yahooFinanceUrl } from '../src/lib/links';

describe('yahooFinanceUrl', () => {
  it('東証の銘柄コードを Yahoo!ファイナンスの銘柄ページにする', () => {
    expect(yahooFinanceUrl('6501')).toBe('https://finance.yahoo.co.jp/quote/6501.T');
    expect(yahooFinanceUrl(' 130a ')).toBe('https://finance.yahoo.co.jp/quote/130A.T');
  });

  it('サンプルの架空コードや形式違いはリンクにしない', () => {
    expect(yahooFinanceUrl('S101')).toBeNull();
    expect(yahooFinanceUrl('12345')).toBeNull();
    expect(yahooFinanceUrl('')).toBeNull();
    expect(isTseCode('A130')).toBe(false);
  });
});
