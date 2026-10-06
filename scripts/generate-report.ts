/**
 * レポート生成CLI（UIの「レポート」画面と同じロジック）。
 *
 *   npm run report                                 … manifest の既定データセットから生成
 *   npm run report -- --dataset 2026-10-05.json --detail compact
 *
 * 出力: reports/<基準日>-<保有パターン>.md / .html / -sns.txt
 *   --sns-layout thread で SNS投稿をスレッド分割（X向け）にする
 *   --today で data/today-market.json（と同梱の市況メモ）を「今日の市況」として冒頭に入れる
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { analyzeDataset, DEFAULT_ANALYSIS_OPTIONS } from '../src/lib/analysis';
import { findHoldingPattern } from '../src/lib/calendar';
import { validateDataset, validateTodayMarket } from '../src/lib/validate';
import { parseMarketMemo } from '../src/lib/marketMemo';
import { analyzeToday } from '../src/lib/todayAnalysis';
import { buildStandaloneHtml, extractTitle } from '../src/lib/markdown';
import { DEFAULT_REPORT_OPTIONS, generateWeeklyReport } from '../src/lib/reportGenerator';
import { DEFAULT_SNS_OPTIONS, generateSnsPost } from '../src/lib/snsPostGenerator';
import { DATA_DIR, readManifest } from './lib/manifest';

async function main() {
  const { values } = parseArgs({
    options: {
      dataset: { type: 'string' },
      'out-dir': { type: 'string', default: 'reports' },
      detail: { type: 'string', default: 'full' },
      pattern: { type: 'string', default: 'tue-fri' },
      top: { type: 'string', default: '6' },
      title: { type: 'string' },
      'sns-layout': { type: 'string', default: 'single' },
      today: { type: 'boolean', default: false },
    },
  });

  const file = values.dataset ?? (await readManifest())?.default;
  if (!file) throw new Error('データセットが見つかりません。先に npm run data:mock を実行してください。');
  const dataset = validateDataset(JSON.parse(await readFile(resolve(DATA_DIR, file), 'utf8')), file);

  const pattern = findHoldingPattern(values.pattern);
  const analysis = analyzeDataset(dataset, { ...DEFAULT_ANALYSIS_OPTIONS, pattern, topN: Number(values.top) });
  let todayAnalysis = null;
  if (values.today) {
    const today = validateTodayMarket(JSON.parse(await readFile(resolve(DATA_DIR, 'today-market.json'), 'utf8')));
    const memo = today.memoMarkdown?.trim() ? parseMarketMemo(today.memoMarkdown, { source: 'json' }) : null;
    todayAnalysis = analyzeToday(today, analysis, memo);
  }
  const markdown = generateWeeklyReport(
    analysis,
    {
      ...DEFAULT_REPORT_OPTIONS,
      title: values.title,
      detail: values.detail === 'compact' ? 'compact' : 'full',
      sections: { ...DEFAULT_REPORT_OPTIONS.sections, today: values.today },
    },
    { today: todayAnalysis },
  );

  const outDir = resolve(values['out-dir']);
  await mkdir(outDir, { recursive: true });
  const base = resolve(outDir, `${dataset.asOf}-${pattern.id}`);
  await writeFile(`${base}.md`, markdown);
  await writeFile(`${base}.html`, buildStandaloneHtml(extractTitle(markdown), markdown));
  const sns = generateSnsPost(analysis, {
    ...DEFAULT_SNS_OPTIONS,
    layout: values['sns-layout'] === 'thread' ? 'thread' : 'single',
  });
  await writeFile(`${base}-sns.txt`, sns);
  console.log(`[report] ${relative(process.cwd(), base)}.md / .html / -sns.txt を出力しました`);
}

main().catch((e: unknown) => {
  console.error(`[report] 失敗: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
