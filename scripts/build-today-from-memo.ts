/**
 * ChatGPT 等で作った市況メモ Markdown から data/today-market.json を作る。
 *
 * 使い方:
 *   npm run today:from-memo -- --memo raw-data/today.md --as-of 2026-10-06
 */
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { buildTodayFromMemo } from '../src/lib/todayBuilder';
import type { TodayMarket } from '../src/types/today';

async function main() {
  const { values } = parseArgs({
    options: {
      memo: { type: 'string', default: 'raw-data/today.md' },
      base: { type: 'string', default: 'data/today-market.json' },
      out: { type: 'string', default: 'data/today-market.json' },
      'as-of': { type: 'string' },
      session: { type: 'string', default: '寄り前' },
    },
  });

  const raw = await readFile(values.memo, 'utf8');
  const base = JSON.parse(await readFile(values.base, 'utf8')) as TodayMarket;
  const today = buildTodayFromMemo(base, raw, { asOf: values['as-of'], session: values.session });

  await writeFile(values.out, `${JSON.stringify(today, null, 2)}\n`);
  console.log(`[today:from-memo] 書き出し: ${values.out}`);
  console.log(`[today:from-memo] headline: ${today.headline}`);
  console.log(`[today:from-memo] quotes: ${today.externalQuotes.map((q) => q.label).join(', ') || 'なし'}`);
}

main().catch((e: unknown) => {
  console.error(`[today:from-memo] 失敗: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
