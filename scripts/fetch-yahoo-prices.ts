/**
 * Yahoo Finance の chart エンドポイントから日足CSVを raw-data/prices/ に保存する補助CLI。
 *
 * これは非公式エンドポイントを使う任意ツール。失敗してもアプリ本体は外部通信なしで動く。
 *
 * 使い方:
 *   npm run prices:yahoo -- --codes 6857,8035 --years 2
 *   npm run prices:yahoo                 # raw-data/watchlist.csv の code 列を使う
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { csvToRecords } from './lib/csv';

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

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function toYahooSymbol(code: string) {
  const trimmed = code.trim();
  if (!trimmed) return '';
  if (trimmed.includes('.')) return trimmed;
  return `${trimmed}.T`;
}

function ymdFromUnixSeconds(sec: number) {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

async function codesFromWatchlist(path: string) {
  const records = csvToRecords(await readFile(path, 'utf8'));
  return records
    .map((r) => r.code ?? r['コード'] ?? '')
    .map((x) => x.trim())
    .filter(Boolean);
}

async function fetchOne(code: string, years: number) {
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

async function main() {
  const { values } = parseArgs({
    options: {
      codes: { type: 'string' },
      years: { type: 'string', default: '2' },
      out: { type: 'string', default: 'raw-data/prices' },
      watchlist: { type: 'string', default: 'raw-data/watchlist.csv' },
      delay: { type: 'string', default: '250' },
    },
  });

  const codes = values.codes
    ? values.codes.split(',').map((x) => x.trim()).filter(Boolean)
    : await codesFromWatchlist(resolve(values.watchlist));
  if (codes.length === 0) throw new Error('取得するコードがありません。--codes か raw-data/watchlist.csv を指定してください。');

  const years = Number(values.years);
  const outDir = resolve(values.out);
  const delay = Number(values.delay);
  await mkdir(outDir, { recursive: true });

  let ok = 0;
  for (const code of codes) {
    try {
      const csv = await fetchOne(code, years);
      await writeFile(resolve(outDir, `${code}.csv`), csv);
      ok++;
      console.log(`[prices:yahoo] ${code}.csv`);
    } catch (e) {
      console.warn(`[prices:yahoo] ${code}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (delay > 0) await sleep(delay);
  }
  console.log(`[prices:yahoo] 完了 ${ok}/${codes.length}`);
}

main().catch((e: unknown) => {
  console.error(`[prices:yahoo] 失敗: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
