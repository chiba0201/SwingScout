interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string };
  };
}

export const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

export function toYahooSymbol(code: string) {
  const trimmed = code.trim();
  if (!trimmed) return '';
  if (trimmed.includes('.')) return trimmed;
  return `${trimmed}.T`;
}

function ymdFromUnixSeconds(sec: number) {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

export async function fetchYahooDailyCsv(code: string, years: number) {
  const symbol = toYahooSymbol(code);
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - Math.ceil(years * 366 * 24 * 60 * 60);
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set('period1', String(period1));
  url.searchParams.set('period2', String(period2));
  url.searchParams.set('interval', '1d');
  url.searchParams.set('events', 'history');

  const response = await fetch(url);
  if (!response.ok) throw new Error(`${symbol}: HTTP ${response.status}`);
  const json = (await response.json()) as YahooChartResponse;
  const result = json.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result?.timestamp || !quote) {
    throw new Error(`${symbol}: ${json.chart?.error?.description ?? '日足を取得できませんでした'}`);
  }

  const rows = ['Date,Open,High,Low,Close,Volume'];
  for (let i = 0; i < result.timestamp.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];
    if ([open, high, low, close, volume].some((x) => x === null || x === undefined)) continue;
    rows.push([ymdFromUnixSeconds(result.timestamp[i]!), open, high, low, close, volume].join(','));
  }
  if (rows.length < 30) throw new Error(`${symbol}: 有効な日足が少なすぎます`);
  return `${rows.join('\n')}\n`;
}
