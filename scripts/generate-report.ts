/**
 * レポート生成CLI（UIの「レポート」画面と同じロジック）。
 *
 *   npm run report                                 … manifest の既定データセットから生成
 *   npm run report -- --dataset 2026-10-05.json --detail compact
 *
 * 出力: reports/<基準日>-<保有パターン>.md と .html
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { analyzeDataset, DEFAULT_ANALYSIS_OPTIONS } from '../src/lib/analysis';
import { findHoldingPattern } from '../src/lib/calendar';
import { validateDataset } from '../src/lib/validate';
import { buildStandaloneHtml, extractTitle } from '../src/lib/markdown';
import { DEFAULT_REPORT_OPTIONS, generateWeeklyReport } from '../src/lib/reportGenerator';
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
    },
  });

  const file = values.dataset ?? (await readManifest())?.default;
  if (!file) throw new Error('データセットが見つかりません。先に npm run data:mock を実行してください。');
  const dataset = validateDataset(JSON.parse(await readFile(resolve(DATA_DIR, file), 'utf8')), file);

  const pattern = findHoldingPattern(values.pattern);
  const analysis = analyzeDataset(dataset, { ...DEFAULT_ANALYSIS_OPTIONS, pattern, topN: Number(values.top) });
  const markdown = generateWeeklyReport(analysis, {
    ...DEFAULT_REPORT_OPTIONS,
    title: values.title,
    detail: values.detail === 'compact' ? 'compact' : 'full',
  });

  const outDir = resolve(values['out-dir']);
  await mkdir(outDir, { recursive: true });
  const base = resolve(outDir, `${dataset.asOf}-${pattern.id}`);
  await writeFile(`${base}.md`, markdown);
  await writeFile(`${base}.html`, buildStandaloneHtml(extractTitle(markdown), markdown));
  console.log(`[report] ${relative(process.cwd(), base)}.md / .html を出力しました`);
}

main().catch((e: unknown) => {
  console.error(`[report] 失敗: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
