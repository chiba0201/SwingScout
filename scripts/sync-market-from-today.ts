/**
 * data/today-market.json の外部指標・市況コメントから raw-data/market.json を更新する。
 *
 * Today を毎朝実市況に更新したあと、週次スイング側の marketContext も同じ値に寄せるための補助。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { marketContextFromToday } from '../src/lib/marketContextFromToday';
import type { MarketContext } from '../src/types/dataset';
import type { TodayMarket } from '../src/types/today';

async function main() {
  const { values } = parseArgs({
    options: {
      today: { type: 'string', default: 'data/today-market.json' },
      out: { type: 'string', default: 'raw-data/market.json' },
      stance: { type: 'string' },
    },
  });

  const today = JSON.parse(await readFile(resolve(values.today), 'utf8')) as TodayMarket;
  const stance =
    values.stance === 'bullish' || values.stance === 'bearish' || values.stance === 'neutral'
      ? values.stance
      : undefined;
  const market: MarketContext = marketContextFromToday(today, stance);

  const out = resolve(values.out);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(market, null, 2)}\n`);
  console.log(`[market:from-today] 書き出し: ${values.out}`);
}

main().catch((e: unknown) => {
  console.error(`[market:from-today] 失敗: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
