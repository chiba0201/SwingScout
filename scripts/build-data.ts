/**
 * データセット生成CLI。
 *
 *   npm run data:mock                         … サンプル（架空銘柄）を data/mock-candidates.json に生成
 *   npm run data:build -- --provider local    … raw-data/ のローカルファイルから data/<基準日>.json を生成
 *
 * オプション:
 *   --provider mock|local   データ源（既定 mock）
 *   --as-of YYYY-MM-DD      基準日（既定: mock は 2026-10-05、local は直近の営業日）
 *   --out <path>            出力先（既定 data/<基準日>.json）
 *   --pattern tue-fri       保有パターン（tue-fri / mon-fri / tue-thu / wed-fri / thu-fri）
 *   --keep 12 --top 6       保存件数（universe は既定で全銘柄）/ 今週の候補件数
 *   --label <text>          manifest に表示する名前
 *   --no-manifest           data/ に出力しても manifest を更新しない
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fromTime, isBusinessDay, prevBusinessDay } from '../src/lib/calendar';
import { createProviderSet, PROVIDER_IDS, type ProviderId } from './providers';
import { upsertManifest } from './lib/manifest';
import { DEFAULT_PIPELINE_OPTIONS, runPipeline } from './lib/pipeline';

/** 固定の基準日にしてサンプルJSONの差分が毎回出ないようにする */
const MOCK_AS_OF = '2026-10-05';

/** 日本時間で引け後（16時以降）なら当日、それ以外は前営業日 */
function latestTradingDay(): string {
  const jst = new Date(Date.now() + 9 * 3_600_000);
  const today = fromTime(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
  return isBusinessDay(today) && jst.getUTCHours() >= 16 ? today : prevBusinessDay(today);
}

async function main() {
  const { values } = parseArgs({
    options: {
      provider: { type: 'string', default: 'mock' },
      'as-of': { type: 'string' },
      out: { type: 'string' },
      pattern: { type: 'string', default: 'tue-fri' },
      keep: { type: 'string' },
      top: { type: 'string' },
      label: { type: 'string' },
      'no-manifest': { type: 'boolean', default: false },
    },
  });

  const provider = values.provider as ProviderId;
  if (!PROVIDER_IDS.includes(provider)) {
    throw new Error(`--provider は ${PROVIDER_IDS.join(' / ')} のいずれか（指定値: ${values.provider}）`);
  }
  const asOf = values['as-of'] ?? (provider === 'mock' ? MOCK_AS_OF : latestTradingDay());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`--as-of は YYYY-MM-DD 形式で指定してください（${asOf}）`);
  const out = resolve(values.out ?? `data/${asOf}.json`);

  console.log(`[build-data] provider=${provider} asOf=${asOf} pattern=${values.pattern}`);
  const providers = createProviderSet(provider, values.pattern);
  const dataset = await runPipeline(providers, {
    ...DEFAULT_PIPELINE_OPTIONS,
    asOf,
    patternId: values.pattern,
    // 代表銘柄スクリーニングは全銘柄を残す（候補一覧の「全銘柄」とお気に入りに使う）
    keep: values.keep ? Number(values.keep) : provider === 'universe' ? Number.POSITIVE_INFINITY : DEFAULT_PIPELINE_OPTIONS.keep,
    topN: values.top ? Number(values.top) : DEFAULT_PIPELINE_OPTIONS.topN,
  });

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(dataset, null, 2)}\n`);
  console.log(`[build-data] 書き出し: ${relative(process.cwd(), out)}`);

  if (values['no-manifest']) {
    console.log('[build-data] --no-manifest 指定のため manifest は更新しません');
  } else if (dirname(out) === resolve('data')) {
    const label = values.label ?? (dataset.meta.isSample ? 'サンプルデータ（架空銘柄）' : `${asOf} 引け`);
    const manifest = await upsertManifest(out, dataset, label);
    console.log(`[build-data] manifest 更新（既定: ${manifest.default}）`);
  } else {
    console.log('[build-data] data/ 外への出力のため manifest は更新しません');
  }
}

main().catch((e: unknown) => {
  console.error(`[build-data] 失敗: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
