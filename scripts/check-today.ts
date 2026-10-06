/**
 * data/today-market.json の検証CLI（朝の更新後、アップロード前に実行する想定）。
 *
 *   npm run today:check
 *
 * 形式チェック → スイング候補と組み合わせた判定結果（想定シナリオ・監視銘柄の扱い）を表示する。
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyzeDataset } from '../src/lib/analysis';
import { formatDateJa } from '../src/lib/calendar';
import { parseMarketMemo } from '../src/lib/marketMemo';
import { analyzeToday, WATCH_ACTION_LABELS } from '../src/lib/todayAnalysis';
import { validateDataset, validateTodayMarket } from '../src/lib/validate';
import { DATA_DIR, readManifest } from './lib/manifest';

async function main() {
  const today = validateTodayMarket(JSON.parse(await readFile(resolve(DATA_DIR, 'today-market.json'), 'utf8')));
  const file = (await readManifest())?.default;
  if (!file) throw new Error('スイング用データセットがありません（npm run data:mock）');
  const swing = analyzeDataset(validateDataset(JSON.parse(await readFile(resolve(DATA_DIR, file), 'utf8')), file));
  const memo = today.memoMarkdown?.trim() ? parseMarketMemo(today.memoMarkdown, { source: 'json' }) : null;
  const t = analyzeToday(today, swing, memo);

  console.log(`[today] OK: ${formatDateJa(today.asOf)} ${today.session} / スタンス ${today.stance}${today.meta.isSample ? '（サンプル）' : ''}`);
  console.log(`  想定寄り ${today.expectedOpen.label}（${today.expectedOpen.gapPct}%）→ シナリオ ${t.likelyScenarioId} / スイング ${t.swingRole.label}`);
  for (const n of t.notices) console.log(`  注意: ${n}`);
  for (const w of t.watchlist) {
    console.log(`  ${w.candidate.code} ${w.candidate.name}: ${WATCH_ACTION_LABELS[w.action]} — ${w.reason}`);
  }
  if (memo) {
    console.log(`  市況メモ: 見出し${memo.sections.length} / 表${memo.tables.length} / 参照${memo.sources.length}${memo.needsReview ? ' / 要確認あり' : ''}`);
  }
}

main().catch((e: unknown) => {
  console.error(`[today] 失敗: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
