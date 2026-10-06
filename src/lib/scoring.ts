/**
 * スコアリング。
 *
 * 構成:
 *   ファクター（指標1つ = 0〜100点）→ カテゴリ（需給 / テクニカル / イベント / リスク）→ 総合
 *
 *   総合 = 加点カテゴリの加重平均 − リスク × riskPenalty   （0〜100にクリップ）
 *
 * 指標を追加するときは `FACTORS` に1エントリ足すだけでよい。
 * 必要なデータが無いときは evaluate が null を返し、そのファクターは平均から除外される。
 */
import type {
  Candidate,
  FactorScore,
  MarketContext,
  ScoreCategory,
  ScoreSummary,
} from '../types/dataset';
import type { HoldingWindow } from './calendar';
import type { DerivedMetrics } from './metrics';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

export interface ScoringContext {
  market: MarketContext;
  window: HoldingWindow;
  /**
   * 自分より上位にいる「同一セクター or 同一テーマ」の銘柄数（code → 件数）。
   * 順位が決まらないと計算できないため、rankCandidates の2パス目でのみ設定される。
   */
  higherRankedPeers?: ReadonlyMap<string, number>;
}

export interface FactorInput {
  candidate: Candidate;
  metrics: DerivedMetrics;
  ctx: ScoringContext;
}

export interface FactorEvaluation {
  /** 0〜100（リスクカテゴリは高いほど危険） */
  score: number;
  /** 表示用の生値 */
  value?: string;
  note?: string;
}

export interface ScoreFactor {
  id: string;
  label: string;
  category: ScoreCategory;
  /** カテゴリ内の重み */
  weight: number;
  description: string;
  evaluate(input: FactorInput): FactorEvaluation | null;
}

export interface ScoringConfig {
  /** 加点カテゴリの重み（合計は任意。内部で正規化する） */
  categoryWeights: { supplyDemand: number; technical: number; event: number };
  /** リスク1点あたりの減点（0.3 ならリスク100で -30点） */
  riskPenalty: number;
  /** ファクター単位の重み上書き（factor.id → weight） */
  factorWeights?: Readonly<Record<string, number>>;
  disabledFactors?: readonly string[];
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  categoryWeights: { supplyDemand: 35, technical: 35, event: 30 },
  riskPenalty: 0.3,
};

export const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  supplyDemand: '需給',
  technical: 'テクニカル',
  event: 'イベント',
  risk: 'リスク',
};

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

export const clamp = (x: number, min = 0, max = 100) => Math.min(max, Math.max(min, x));

/** 折れ線補間。points は x 昇順。範囲外は端の値で頭打ち */
export function interpolate(x: number, points: readonly (readonly [number, number])[]): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

const signed = (x: number, digits = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`;

export function findQuote(market: MarketContext, id: string) {
  return [...market.indices, ...market.volatility, ...market.fx, ...market.rates].find(
    (q) => q.id === id,
  );
}

// ---------------------------------------------------------------------------
// ファクター定義
// ---------------------------------------------------------------------------

export const FACTORS: readonly ScoreFactor[] = [
  // ---- 需給 ---------------------------------------------------------------
  {
    id: 'volumeSurge',
    label: '出来高増加',
    category: 'supplyDemand',
    weight: 3,
    description: '基準日出来高 / 20日平均。資金流入の初動を評価（極端な急増はやや減点）',
    evaluate: ({ metrics: m }) =>
      m.volumeRatio20d === null
        ? null
        : {
            score: interpolate(m.volumeRatio20d, [
              [0.5, 15], [1, 40], [1.5, 62], [2, 78], [3, 92], [5, 95], [8, 80],
            ]),
            value: `${m.volumeRatio20d.toFixed(1)}倍`,
            note: '20日平均比',
          },
  },
  {
    id: 'volumeTrend',
    label: '出来高トレンド',
    category: 'supplyDemand',
    weight: 1.5,
    description: '5日平均 / 20日平均。単日ではなく継続的に商いが増えているか',
    evaluate: ({ metrics: m }) =>
      m.volumeRatio5d === null
        ? null
        : {
            score: interpolate(m.volumeRatio5d, [[0.7, 25], [1, 45], [1.3, 65], [1.8, 85], [3, 90]]),
            value: `${m.volumeRatio5d.toFixed(2)}倍`,
            note: '5日平均 / 20日平均',
          },
  },
  {
    id: 'marginRatio',
    label: '信用倍率',
    category: 'supplyDemand',
    weight: 2,
    description: '買残 / 売残。低いほど将来の売り圧力が小さく、踏み上げ余地がある',
    evaluate: ({ metrics: m }) =>
      m.marginRatio === null
        ? null
        : {
            score: interpolate(m.marginRatio, [
              [0.5, 90], [1, 82], [2, 68], [4, 50], [8, 30], [15, 15],
            ]),
            value: `${m.marginRatio.toFixed(2)}倍`,
          },
  },
  {
    id: 'marginChange',
    label: '買残/売残変化',
    category: 'supplyDemand',
    weight: 2,
    description: '前週比。買残減少（整理）と売残増加（踏み上げ燃料）を評価',
    evaluate: ({ metrics: m }) => {
      if (m.buyChangePct === null || m.sellChangePct === null) return null;
      const score = 50 - clamp(m.buyChangePct, -30, 30) + clamp(m.sellChangePct, -40, 40) * 0.6;
      return {
        score: clamp(score),
        value: `買${signed(m.buyChangePct)}% / 売${signed(m.sellChangePct)}%`,
        note: '前週比',
      };
    },
  },
  {
    id: 'marginDays',
    label: '取組の重さ',
    category: 'supplyDemand',
    weight: 1,
    description: '買残が20日平均出来高の何日分か。多いほど戻り売りが出やすい',
    evaluate: ({ metrics: m }) =>
      m.marginDays === null
        ? null
        : {
            score: interpolate(m.marginDays, [[0.5, 85], [2, 70], [5, 50], [10, 30], [20, 15]]),
            value: `${m.marginDays.toFixed(1)}日分`,
          },
  },

  // ---- テクニカル ----------------------------------------------------------
  {
    id: 'maTrend',
    label: '5日/25日移動平均',
    category: 'technical',
    weight: 3,
    description: '終値と5日線・25日線の位置関係、移動平均の並び',
    evaluate: ({ candidate: c, metrics: m }) => {
      if (m.maDeviation5 === null || m.maDeviation25 === null) return null;
      let score = 0;
      if (m.maDeviation25 > 0) score += 35;
      if (m.maDeviation5 > 0) score += 25;
      if (c.technical.ma5 > c.technical.ma25) score += 25;
      if (m.maDeviation25 >= 0 && m.maDeviation25 <= 8) score += 15;
      return {
        score,
        value: `5日線${signed(m.maDeviation5)}% / 25日線${signed(m.maDeviation25)}%`,
        note: m.maAlignment === 'bullish' ? '上昇配列' : m.maAlignment === 'bearish' ? '下降配列' : '混在',
      };
    },
  },
  {
    id: 'newHigh',
    label: '高値更新',
    category: 'technical',
    weight: 2.5,
    description: '直近20日高値・52週高値の更新、または高値までの距離',
    evaluate: ({ metrics: m }) => {
      if (m.isNewHigh52w) return { score: 100, value: '52週高値更新' };
      if (m.isNewHigh20d) return { score: 88, value: '20日高値更新' };
      if (m.distanceToHigh20dPct === null) return null;
      return {
        score: interpolate(m.distanceToHigh20dPct, [[-15, 15], [-8, 35], [-4, 55], [-2, 68], [0, 80]]),
        value: `20日高値まで${signed(m.distanceToHigh20dPct)}%`,
      };
    },
  },
  {
    id: 'rsiZone',
    label: 'RSI(14)',
    category: 'technical',
    weight: 1.5,
    description: '50〜65を最良とし、過熱（75超）と弱さ（40未満）を減点',
    evaluate: ({ candidate: c }) => {
      const rsi = c.technical.rsi14;
      if (rsi === undefined) return null;
      return {
        score: interpolate(rsi, [
          [20, 40], [30, 45], [45, 60], [55, 78], [65, 80], [72, 60], [80, 30], [90, 15],
        ]),
        value: rsi.toFixed(0),
      };
    },
  },

  // ---- イベント -----------------------------------------------------------
  {
    id: 'earningsSetup',
    label: '決算日までの日数',
    category: 'event',
    weight: 2,
    description: '保有期間の直後に決算がある場合は先回り需要として加点、期間中は減点',
    evaluate: ({ metrics: m }) => {
      const value = m.daysToEarnings === null ? '未定' : `${m.daysToEarnings}営業日後`;
      const scoreByTiming: Record<DerivedMetrics['earningsTiming'], number> = {
        unknown: 50,
        'before-entry': 50,
        'in-window': 35,
        'exit-day': 45,
        'after-window-near': 72,
        'after-window': 55,
      };
      return { score: scoreByTiming[m.earningsTiming], value };
    },
  },
  {
    id: 'earningsMomentum',
    label: '業績モメンタム',
    category: 'event',
    weight: 1.5,
    description: '前回決算のサプライズと通期計画に対する進捗率',
    evaluate: ({ candidate: c }) => {
      const { lastSurprise, progressRate } = c.earnings;
      if (!lastSurprise && progressRate === undefined) return null;
      const base = lastSurprise === 'beat' ? 75 : lastSurprise === 'miss' ? 25 : 55;
      const adj = progressRate === undefined ? 0 : clamp((progressRate - 50) * 0.4, -15, 15);
      const surpriseLabel = { beat: '上振れ', inline: '概ね計画通り', miss: '下振れ' };
      return {
        score: clamp(base + adj),
        value: [
          lastSurprise ? surpriseLabel[lastSurprise] : null,
          progressRate !== undefined ? `進捗${progressRate.toFixed(0)}%` : null,
        ]
          .filter(Boolean)
          .join(' / '),
      };
    },
  },
  {
    id: 'catalysts',
    label: '材料',
    category: 'event',
    weight: 2,
    description: '開示・ニュース等の材料（ポジティブ/ネガティブの件数）',
    evaluate: ({ candidate: c }) => {
      if (!c.catalysts) return null;
      const pos = c.catalysts.filter((x) => x.impact === 'positive').length;
      const neg = c.catalysts.filter((x) => x.impact === 'negative').length;
      return {
        score: clamp(45 + pos * 18 - neg * 22, 5, 95),
        value: `好材料${pos} / 悪材料${neg}`,
      };
    },
  },
  {
    id: 'fxTailwind',
    label: '為替感応度',
    category: 'event',
    weight: 1.5,
    description: '銘柄の円安感応度 × ドル円の週間変化。追い風なら加点',
    evaluate: ({ candidate: c, ctx }) => {
      const sens = c.sensitivity?.usdJpy;
      const usdjpy = findQuote(ctx.market, 'usdjpy');
      if (sens === undefined || !usdjpy) return null;
      const move = usdjpy.weekChangePct ?? usdjpy.changePct;
      return {
        score: clamp(50 + sens * move * 20, 10, 90),
        value: `感応度${signed(sens)} × ドル円${signed(move, 2)}%`,
      };
    },
  },

  // ---- リスク（高いほど危険） ------------------------------------------------
  {
    id: 'earningsInWindow',
    label: '決算またぎ',
    category: 'risk',
    weight: 3,
    description: '保有期間中に決算発表がある場合の値幅リスク',
    evaluate: ({ candidate: c, metrics: m }) => {
      if (m.earningsTiming === 'in-window') return { score: 100, value: '保有期間中に発表' };
      if (m.earningsTiming === 'exit-day') {
        const afterClose = c.earnings.timing === 'after-close';
        return { score: afterClose ? 25 : 55, value: afterClose ? 'OUT日の引け後' : 'OUT日に発表' };
      }
      return { score: 0, value: m.earningsTiming === 'unknown' ? '日程未定' : '期間外' };
    },
  },
  {
    id: 'postSurge',
    label: '急騰翌日',
    category: 'risk',
    weight: 2,
    description: '基準日に大きく上昇した銘柄は翌日の利食い売り・寄り天リスク',
    evaluate: ({ candidate: c }) => {
      const chg = c.price.changePct;
      return {
        score: chg < 3 ? 0 : interpolate(chg, [[3, 0], [5, 35], [7, 60], [10, 85], [15, 100]]),
        value: `前日比${signed(chg)}%`,
      };
    },
  },
  {
    id: 'overheated',
    label: '25日線乖離（過熱）',
    category: 'risk',
    weight: 1.5,
    description: '25日線から上に離れすぎていると押しが深くなりやすい',
    evaluate: ({ metrics: m }) =>
      m.maDeviation25 === null
        ? null
        : {
            score: interpolate(m.maDeviation25, [[5, 0], [8, 30], [12, 60], [18, 90]]),
            value: `${signed(m.maDeviation25)}%`,
          },
  },
  {
    id: 'peerConcentration',
    label: 'セクター/テーマ集中',
    category: 'risk',
    weight: 1.5,
    description: '自分より上位に同一セクター・同一テーマの候補が何件あるか（相関リスク）',
    evaluate: ({ candidate: c, ctx }) => {
      const peers = ctx.higherRankedPeers?.get(c.code);
      if (peers === undefined) return null;
      return {
        score: peers === 0 ? 0 : peers === 1 ? 50 : 85,
        value: peers === 0 ? 'なし' : `上位に${peers}件`,
      };
    },
  },
  {
    id: 'marketVolatility',
    label: '日経VI',
    category: 'risk',
    weight: 1,
    description: '日経VIの水準 × 銘柄のβ。地合い悪化時の振れ幅リスク',
    evaluate: ({ candidate: c, ctx }) => {
      const vi = findQuote(ctx.market, 'nikkeiVI');
      if (!vi) return null;
      const beta = c.sensitivity?.beta ?? 1;
      const base = interpolate(vi.value, [[15, 5], [18, 15], [22, 35], [26, 60], [30, 80], [35, 95]]);
      return {
        score: clamp(base * beta),
        value: `VI ${vi.value.toFixed(1)} × β${beta.toFixed(1)}`,
      };
    },
  },
  {
    id: 'liquidity',
    label: '流動性',
    category: 'risk',
    weight: 1.5,
    description: '売買代金が小さいと滑り・板の薄さによる損切り遅れのリスク',
    evaluate: ({ candidate: c }) => ({
      score: interpolate(c.volume.turnoverOku, [[0.5, 95], [1, 80], [3, 50], [10, 20], [30, 5]]),
      value: `売買代金${c.volume.turnoverOku.toFixed(1)}億円`,
    }),
  },
  {
    id: 'dailyRange',
    label: '値幅（ATR）',
    category: 'risk',
    weight: 1,
    description: 'ATR(14) / 終値。値幅が大きいほど損切り幅も広がる',
    evaluate: ({ metrics: m }) =>
      m.atrPct === null
        ? null
        : {
            score: interpolate(m.atrPct, [[1.5, 10], [3, 35], [5, 65], [8, 90]]),
            value: `${m.atrPct.toFixed(1)}%`,
          },
  },
];

// ---------------------------------------------------------------------------
// 集計
// ---------------------------------------------------------------------------

const round1 = (x: number) => Math.round(x * 10) / 10;

function weightedMean(items: FactorScore[]): number | null {
  const valid = items.filter((f): f is FactorScore & { score: number } => f.score !== null);
  const totalWeight = valid.reduce((s, f) => s + f.weight, 0);
  if (totalWeight === 0) return null;
  return valid.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight;
}

/**
 * リスクは平均だと「決算またぎ」のような単発の大きなリスクが薄まるため、
 * 最大値と加重平均を半々でブレンドする。
 */
function riskAggregate(items: FactorScore[]): number {
  const valid = items.filter((f) => f.score !== null).map((f) => f.score as number);
  if (valid.length === 0) return 0;
  return 0.5 * Math.max(...valid) + 0.5 * (weightedMean(items) ?? 0);
}

export function evaluateFactors(
  input: FactorInput,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): FactorScore[] {
  return FACTORS.filter((f) => !config.disabledFactors?.includes(f.id)).map((f) => {
    const result = f.evaluate(input);
    return {
      id: f.id,
      label: f.label,
      category: f.category,
      weight: config.factorWeights?.[f.id] ?? f.weight,
      score: result ? round1(clamp(result.score)) : null,
      value: result?.value,
      note: result?.note,
    };
  });
}

export function summarizeScores(
  factors: FactorScore[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoreSummary {
  const of = (cat: ScoreCategory) => factors.filter((f) => f.category === cat);
  const supplyDemand = weightedMean(of('supplyDemand')) ?? 50;
  const technical = weightedMean(of('technical')) ?? 50;
  const event = weightedMean(of('event')) ?? 50;
  const risk = riskAggregate(of('risk'));

  const w = config.categoryWeights;
  const wSum = w.supplyDemand + w.technical + w.event || 1;
  const positive = (supplyDemand * w.supplyDemand + technical * w.technical + event * w.event) / wSum;

  return {
    total: round1(clamp(positive - risk * config.riskPenalty)),
    supplyDemand: round1(supplyDemand),
    technical: round1(technical),
    event: round1(event),
    risk: round1(risk),
    factors,
  };
}

export function scoreCandidate(
  input: FactorInput,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoreSummary {
  return summarizeScores(evaluateFactors(input, config), config);
}

// ---------------------------------------------------------------------------
// ランキング
// ---------------------------------------------------------------------------

export interface ScoredItem {
  candidate: Candidate;
  metrics: DerivedMetrics;
  scores: ScoreSummary;
}

const byTotalDesc = (a: ScoredItem, b: ScoredItem) =>
  b.scores.total - a.scores.total || a.candidate.code.localeCompare(b.candidate.code);

/**
 * 2パスで順位付けする。
 *   1パス目: 集中度を除いてスコア → 仮順位
 *   2パス目: 仮順位で「上位にいる同セクター/同テーマ数」を数え、集中リスクを入れて再スコア
 */
export function rankCandidates(
  items: { candidate: Candidate; metrics: DerivedMetrics }[],
  baseCtx: ScoringContext,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoredItem[] {
  const pass1 = items
    .map((i) => ({ ...i, scores: scoreCandidate({ ...i, ctx: baseCtx }, config) }))
    .sort(byTotalDesc);

  const peers = new Map<string, number>();
  pass1.forEach((item, idx) => {
    const { sector, theme } = item.candidate;
    const count = pass1
      .slice(0, idx)
      .filter((o) => o.candidate.sector === sector || o.candidate.theme === theme).length;
    peers.set(item.candidate.code, count);
  });

  const ctx: ScoringContext = { ...baseCtx, higherRankedPeers: peers };
  return items
    .map((i) => ({ ...i, scores: scoreCandidate({ ...i, ctx }, config) }))
    .sort(byTotalDesc);
}
