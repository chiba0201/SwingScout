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
import { fetchYahooDailyCsv, sleep } from './lib/yahooPrices';

async function codesFromWatchlist(path: string) {
  const records = csvToRecords(await readFile(path, 'utf8'));
  return records
    .map((r) => r.code ?? r['コード'] ?? '')
    .map((x) => x.trim())
    .filter(Boolean);
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
      const csv = await fetchYahooDailyCsv(code, years);
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
