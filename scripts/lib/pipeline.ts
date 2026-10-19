/**
 * データ生成パイプライン。
 *
 *   universe → 日足 → スナップショット(indicators) → 足切り
 *     → 信用残 / 決算 / 材料 / 手書き補足 をマージ
 *     → 入り方・損切り・利確（tradePlan） → コメント（commentary）
 *     → スコア・順位（analysis） → Dataset
 */
import { analyzeDataset, DEFAULT_ANALYSIS_OPTIONS } from '../../src/lib/analysis';
import { addDays, computeHoldingWindow, findHoldingPattern } from '../../src/lib/calendar';
import { buildComments } from '../../src/lib/commentary';
import { buildSnapshots } from '../../src/lib/indicators';
import { computeMetrics } from '../../src/lib/metrics';
import { buildTradePlan, SETUP_LABELS } from '../../src/lib/tradePlan';
import {
  SCHEMA_VERSION,
  type Candidate,
  type Dataset,
  type ISODate,
  type UniverseStatus,
} from '../../src/types/dataset';
import type { ProviderSet } from '../providers/types';

export interface PipelineOptions {
  asOf: ISODate;
  patternId?: string;
  /** JSON に残す候補数 */
  keep: number;
  /** 「今週の候補」件数（集中度判定に使う） */
  topN: number;
  /** 足切り：売買代金（億円）の下限 */
  minTurnoverOku: number;
  /** 足切り：株価の下限 */
  minPrice: number;
  /** 日足の取得本数（52週高値のため245本以上を推奨） */
  lookbackDays: number;
}

export const DEFAULT_PIPELINE_OPTIONS: Omit<PipelineOptions, 'asOf'> = {
  keep: 12,
  topN: 6,
  minTurnoverOku: 1,
  minPrice: 200,
  lookbackDays: 260,
};

const EMPTY_SCORES = { total: 0, supplyDemand: 0, technical: 0, event: 0, risk: 0 };

export async function runPipeline(providers: ProviderSet, options: PipelineOptions): Promise<Dataset> {
  const { asOf } = options;
  const pattern = findHoldingPattern(options.patternId);
  const window = computeHoldingWindow(asOf, pattern);
  const log = (msg: string) => console.log(`  ${msg}`);

  const [universe, market] = await Promise.all([
    providers.universe.getUniverse(asOf),
    providers.market.getMarketContext(asOf),
  ]);
  log(`ユニバース ${universe.length}銘柄`);

  // 日足 → スナップショット → 足切り（お気に入りは足切りしない）
  const status = new Map<string, UniverseStatus>();
  const screened: { entry: (typeof universe)[number]; snap: ReturnType<typeof buildSnapshots> }[] = [];
  for (const entry of universe) {
    const bars = await providers.prices.getDailyBars(entry.code, asOf, options.lookbackDays);
    // 日足が無い・基準日の足が無い（売買停止など）
    if (!bars || bars.length < 27 || bars[bars.length - 1]!.date !== asOf) {
      status.set(entry.code, 'no-prices');
      continue;
    }
    const snap = buildSnapshots(bars);
    if (!entry.favorite && (snap.volume.turnoverOku < options.minTurnoverOku || snap.price.close < options.minPrice)) {
      status.set(entry.code, 'filtered');
      continue;
    }
    status.set(entry.code, 'scored');
    screened.push({ entry, snap });
  }
  log(`足切り通過 ${screened.length}銘柄（売買代金${options.minTurnoverOku}億円以上・株価${options.minPrice}円以上）`);

  const codes = screened.map((s) => s.entry.code);
  const [margins, earnings, catalysts, annotations] = await Promise.all([
    providers.margin.getMarginBalances(codes, asOf),
    providers.earnings.getEarnings(codes, asOf),
    providers.disclosures.getCatalysts(codes, addDays(asOf, -7), window.exitDate),
    providers.annotations?.getAnnotations(codes) ?? Promise.resolve(new Map()),
  ]);

  const drafts: Candidate[] = screened.map(({ entry, snap }) => {
    const ann = annotations.get(entry.code) ?? {};
    const draft: Candidate = {
      rank: 0,
      code: entry.code,
      name: entry.name,
      market: entry.market,
      sector: entry.sector,
      theme: ann.theme ?? entry.theme ?? entry.sector,
      favorite: entry.favorite || undefined,
      scores: EMPTY_SCORES,
      ...snap,
      margin: margins.get(entry.code) ?? null,
      earnings: earnings.get(entry.code) ?? { nextDate: null, timing: 'unknown' },
      sensitivity: ann.sensitivity,
      catalysts: catalysts.get(entry.code),
      comments: { supplyDemand: '', technical: '', fundamental: '' },
      entryPlan: { method: '' },
      stopLoss: { price: 0, rule: '' },
      takeProfit: { targets: [], rule: '' },
      risks: { flags: ann.flags ?? [], skipConditions: [] },
    };

    const metrics = computeMetrics(draft, window);
    const plan = buildTradePlan(draft, metrics, market, window);
    const comments = buildComments(draft, metrics, ann.fundamentalNote);
    return {
      ...draft,
      technical: { ...draft.technical, pattern: ann.pattern ?? SETUP_LABELS[plan.setup] },
      comments: { ...comments, ...ann.comments },
      entryPlan: ann.entryPlan ?? plan.entryPlan,
      stopLoss: ann.stopLoss ?? plan.stopLoss,
      takeProfit: ann.takeProfit ?? plan.takeProfit,
      risks: { ...draft.risks, skipConditions: [...(ann.skipConditions ?? []), ...plan.skipConditions] },
    };
  });

  const dataset: Dataset = {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      source: providers.id,
      isSample: providers.isSample,
      notes: providers.isSample
        ? ['サンプルデータ：銘柄・価格・需給・日程・コメントはすべて架空です。実在銘柄の推奨ではありません。']
        : undefined,
    },
    asOf,
    marketContext: market,
    candidates: drafts,
    universe: universe.map((u) => ({
      code: u.code,
      name: u.name,
      sector: u.sector,
      market: u.market,
      theme: u.theme,
      favorite: !!u.favorite,
      status: status.get(u.code) ?? 'no-prices',
    })),
  };

  // スコア・順位を付けて上位 keep 件だけ残す（factors 内訳は UI で再計算するので保存しない）
  const analysis = analyzeDataset(dataset, { ...DEFAULT_ANALYSIS_OPTIONS, pattern, topN: options.topN });
  dataset.candidates = analysis.ranked.slice(0, options.keep).map((c) => {
    const { metrics: _m, warnings: _w, scores, ...rest } = c;
    const { factors: _f, ...summary } = scores;
    return { ...rest, scores: summary };
  });
  log(`${dataset.candidates.length}銘柄を保存（銘柄リスト ${universe.length}銘柄）`);
  return dataset;
}
