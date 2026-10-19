/**
 * ブラウザ内で raw-data 相当のCSV/JSONから Dataset を生成する。
 * サーバーへ保存はしない。生成したJSONをダウンロードして data/ に置く運用。
 *
 * - 銘柄リストの全銘柄を採点して残す（keep で上限を付けられる）
 * - お気に入り（favorite 列）は売買代金・株価の足切りをしない
 * - 採点できなかった銘柄も dataset.universe に状態つきで残す
 */
import { analyzeDataset, DEFAULT_ANALYSIS_OPTIONS } from './analysis';
import { computeHoldingWindow, findHoldingPattern } from './calendar';
import { buildComments } from './commentary';
import { csvToRecords } from './csv';
import { isFavoriteValue } from './universeCsv';
import { buildSnapshots, type DailyBar } from './indicators';
import { computeMetrics } from './metrics';
import { buildTradePlan, SETUP_LABELS } from './tradePlan';
import {
  SCHEMA_VERSION,
  type Candidate,
  type Dataset,
  type EarningsInfo,
  type ISODate,
  type MarginSnapshot,
  type MarketContext,
  type Sensitivity,
  type UniverseStatus,
} from '../types/dataset';

interface UniverseEntry {
  code: string;
  name: string;
  market?: string;
  sector: string;
  theme?: string;
  usdJpy?: number;
  beta?: number;
  fundamentalNote?: string;
  flags: string[];
  skipConditions: string[];
  pattern?: string;
  favorite: boolean;
}

export interface BrowserDatasetInput {
  asOf: ISODate;
  patternId: string;
  source: string;
  isSample?: boolean;
  universeCsv: string;
  marginCsv?: string;
  earningsCsv?: string;
  market: MarketContext;
  pricesByCode: Map<string, string>;
  keep: number;
  topN: number;
  minTurnoverOku: number;
  minPrice: number;
  lookbackDays: number;
}

export interface BrowserDatasetResult {
  dataset: Dataset;
  stats: {
    universe: number;
    withPrices: number;
    screened: number;
    missingPrices: string[];
  };
}

const EMPTY_SCORES = { total: 0, supplyDemand: 0, technical: 0, event: 0, risk: 0 };
const splitList = (value: string | undefined) =>
  (value ?? '')
    .split(/[|、;]/)
    .map((x) => x.trim())
    .filter(Boolean);

const num = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const n = Number(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

const numOrNull = (value: string | undefined): number | null => {
  const n = num(value);
  return n === undefined ? null : n;
};

function parseUniverse(csv: string): UniverseEntry[] {
  return csvToRecords(csv)
    .map((r) => {
      const sensitivity: Sensitivity = {};
      const usdJpy = num(r.usdJpy);
      const beta = num(r.beta);
      if (usdJpy !== undefined) sensitivity.usdJpy = usdJpy;
      if (beta !== undefined) sensitivity.beta = beta;
      return {
        code: r.code ?? r['コード'] ?? '',
        name: r.name ?? r['銘柄名'] ?? '',
        market: r.market ?? r['市場'] ?? undefined,
        sector: r.sector ?? r['業種'] ?? '',
        theme: r.theme ?? r['テーマ'] ?? undefined,
        usdJpy: sensitivity.usdJpy,
        beta: sensitivity.beta,
        fundamentalNote: r.fundamentalNote || undefined,
        flags: splitList(r.flags),
        skipConditions: splitList(r.skipConditions),
        pattern: r.pattern || undefined,
        favorite: isFavoriteValue(r.favorite ?? r['お気に入り']),
      };
    })
    .filter((e) => e.code && e.name && e.sector);
}

function parsePrices(csv: string, asOf: ISODate, lookbackDays: number): DailyBar[] {
  return csvToRecords(csv)
    .map((r) => ({
      date: (r.Date ?? r.date ?? '').slice(0, 10),
      open: Number(r.Open ?? r.open),
      high: Number(r.High ?? r.high),
      low: Number(r.Low ?? r.low),
      close: Number(r.Close ?? r.close),
      volume: Number(r.Volume ?? r.volume),
    }))
    .filter((b) => b.date && b.date <= asOf && Number.isFinite(b.close) && b.volume > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-lookbackDays);
}

function parseMargins(csv: string | undefined, codes: string[], asOf: ISODate): Map<string, MarginSnapshot> {
  const out = new Map<string, MarginSnapshot>();
  if (!csv?.trim()) return out;
  const wanted = new Set(codes);
  for (const r of csvToRecords(csv)) {
    const code = r.code ?? r['コード'] ?? '';
    if (!wanted.has(code)) continue;
    const buyBalance = numOrNull(r.buyBalance ?? r['買残']);
    const sellBalance = numOrNull(r.sellBalance ?? r['売残']);
    const buyBalancePrev = numOrNull(r.buyBalancePrev ?? r['前週買残']);
    const sellBalancePrev = numOrNull(r.sellBalancePrev ?? r['前週売残']);
    if (buyBalance === null || sellBalance === null || buyBalancePrev === null || sellBalancePrev === null) continue;
    out.set(code, { asOf: r.asOf ?? r['基準日'] ?? asOf, buyBalance, sellBalance, buyBalancePrev, sellBalancePrev });
  }
  return out;
}

function parseEarnings(csv: string | undefined, codes: string[]): Map<string, EarningsInfo> {
  const records = csv?.trim() ? csvToRecords(csv) : [];
  const byCode = new Map(records.map((r) => [r.code ?? '', r]));
  return new Map(
    codes.map((code) => {
      const r = byCode.get(code);
      const timing = r?.timing === 'pre-market' || r?.timing === 'intraday' || r?.timing === 'after-close' ? r.timing : 'unknown';
      return [code, r?.date ? { nextDate: r.date, timing, period: r.period || undefined } : { nextDate: null, timing: 'unknown' }];
    }),
  );
}

export function buildDatasetInBrowser(input: BrowserDatasetInput): BrowserDatasetResult {
  const pattern = findHoldingPattern(input.patternId);
  const window = computeHoldingWindow(input.asOf, pattern);
  const universe = parseUniverse(input.universeCsv);
  const codes = universe.map((u) => u.code);
  const margins = parseMargins(input.marginCsv, codes, input.asOf);
  const earnings = parseEarnings(input.earningsCsv, codes);
  const missingPrices: string[] = [];
  let withPrices = 0;
  const status = new Map<string, UniverseStatus>();

  const screened: { entry: UniverseEntry; snap: ReturnType<typeof buildSnapshots> }[] = [];
  for (const entry of universe) {
    const priceCsv = input.pricesByCode.get(entry.code);
    if (!priceCsv) {
      missingPrices.push(entry.code);
      status.set(entry.code, 'no-prices');
      continue;
    }
    const bars = parsePrices(priceCsv, input.asOf, input.lookbackDays);
    // 基準日の足が無い（取得が古い・売買停止など）も「日足なし」扱い
    if (bars.length < 27 || bars[bars.length - 1]?.date !== input.asOf) {
      missingPrices.push(entry.code);
      status.set(entry.code, 'no-prices');
      continue;
    }
    withPrices++;
    const snap = buildSnapshots(bars);
    // お気に入りは足切りしない（監視したい銘柄なので必ず採点する）
    if (!entry.favorite && (snap.volume.turnoverOku < input.minTurnoverOku || snap.price.close < input.minPrice)) {
      status.set(entry.code, 'filtered');
      continue;
    }
    status.set(entry.code, 'scored');
    screened.push({ entry, snap });
  }

  const drafts: Candidate[] = screened.map(({ entry, snap }) => {
    const draft: Candidate = {
      rank: 0,
      code: entry.code,
      name: entry.name,
      market: entry.market,
      sector: entry.sector,
      theme: entry.theme ?? entry.sector,
      favorite: entry.favorite || undefined,
      scores: EMPTY_SCORES,
      ...snap,
      margin: margins.get(entry.code) ?? null,
      earnings: earnings.get(entry.code) ?? { nextDate: null, timing: 'unknown' },
      sensitivity: entry.usdJpy !== undefined || entry.beta !== undefined ? { usdJpy: entry.usdJpy, beta: entry.beta } : undefined,
      catalysts: [],
      comments: { supplyDemand: '', technical: '', fundamental: '' },
      entryPlan: { method: '' },
      stopLoss: { price: 0, rule: '' },
      takeProfit: { targets: [], rule: '' },
      risks: { flags: entry.flags, skipConditions: [] },
    };
    const metrics = computeMetrics(draft, window);
    const plan = buildTradePlan(draft, metrics, input.market, window);
    const comments = buildComments(draft, metrics, entry.fundamentalNote);
    return {
      ...draft,
      technical: { ...draft.technical, pattern: entry.pattern ?? SETUP_LABELS[plan.setup] },
      comments,
      entryPlan: plan.entryPlan,
      stopLoss: plan.stopLoss,
      takeProfit: plan.takeProfit,
      risks: { ...draft.risks, skipConditions: [...entry.skipConditions, ...plan.skipConditions] },
    };
  });

  const dataset: Dataset = {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      source: input.source,
      isSample: input.isSample ?? false,
    },
    asOf: input.asOf,
    marketContext: input.market,
    candidates: drafts,
    universe: universe.map((u) => ({
      code: u.code,
      name: u.name,
      sector: u.sector,
      market: u.market,
      theme: u.theme,
      favorite: u.favorite,
      status: status.get(u.code) ?? 'no-prices',
    })),
  };

  const analysis = analyzeDataset(dataset, { ...DEFAULT_ANALYSIS_OPTIONS, pattern, topN: input.topN });
  dataset.candidates = analysis.ranked.slice(0, input.keep).map((c) => {
    const { metrics: _m, warnings: _w, scores, ...rest } = c;
    const { factors: _f, ...summary } = scores;
    return { ...rest, scores: summary };
  });

  return { dataset, stats: { universe: universe.length, withPrices, screened: screened.length, missingPrices } };
}
