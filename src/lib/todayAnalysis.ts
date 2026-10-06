/**
 * Today（当日の寄り前・場中判断）の分析。
 *
 *   TodayMarket（data/today-market.json）＋ スイング分析の上位候補 ＋ 市況メモ（任意）
 *     → 想定に近い寄り付きシナリオ・今日のイベント・監視銘柄の扱い
 *
 * 画面（TodayPage など）はここの結果を表示するだけにする。判定の閾値は TODAY_THRESHOLDS に集約。
 */
import type { Quote } from '../types/dataset';
import type { OpenScenario, TodayEvent, TodayMarket } from '../types/today';
import type { AnalyzedCandidate, DatasetAnalysis } from './analysis';
import { formatDateJa, isBusinessDay, isWithinWindow, nextBusinessDay, sqDate, toTime } from './calendar';
import { formatPct } from './format';
import { viRegime, type ViRegime } from './market';
import type { ParsedMarketMemo } from './marketMemo';
import { findQuote } from './scoring';
import { classifySetup, gapUpTolerancePct, SETUP_LABELS } from './tradePlan';

export const TODAY_THRESHOLDS = {
  /** 想定ギャップ（%）がこれ以上なら「大幅GU」シナリオ */
  largeGapUpPct: 0.7,
  /** 想定ギャップ（%）がこれ以下なら「GD」シナリオ */
  gapDownPct: -0.5,
  /** 日経VIがこれ以上なら寄り追いしない */
  viNoChase: 22,
} as const;

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

export type WatchAction = 'chase-ok' | 'wait-pullback' | 'skip';

export const WATCH_ACTION_LABELS: Record<WatchAction, string> = {
  'chase-ok': '寄り追いOK',
  'wait-pullback': '押し目待ち',
  skip: '見送り',
};

export interface WatchItem {
  candidate: AnalyzedCandidate;
  action: WatchAction;
  /** 判定の主な理由 */
  reason: string;
  /** 注意点（警告タグ・決算・GU許容幅など） */
  cautions: string[];
}

export type SwingDayRole = 'entry' | 'hold' | 'exit' | 'outside';

export interface TodayAnalysis {
  today: TodayMarket;
  /** 判定に使った日経VI（Today に無ければスイング側の前日終値）と、その水準の区分 */
  vi: { value: number; label: string; source: 'today' | 'swing'; regime: ViRegime } | null;
  /** 想定ギャップに最も近いシナリオの id */
  likelyScenarioId: OpenScenario['id'] | null;
  /** 時刻順。SQ・休場・上位候補の決算を自動で追加済み */
  events: (TodayEvent & { auto?: boolean })[];
  watchlist: WatchItem[];
  /** スイングの保有ウィンドウから見た今日の位置づけ */
  swingRole: { role: SwingDayRole; label: string };
  /** データ鮮度などの注意 */
  notices: string[];
  /** 貼り付け（または JSON 同梱）の市況メモ。無ければ null */
  memo: ParsedMarketMemo | null;
}

// ---------------------------------------------------------------------------
// 判定
// ---------------------------------------------------------------------------

export function likelyScenarioId(gapPct: number): OpenScenario['id'] {
  if (gapPct >= TODAY_THRESHOLDS.largeGapUpPct) return 'large-gap-up';
  if (gapPct <= TODAY_THRESHOLDS.gapDownPct) return 'gap-down';
  return 'flat-small-gap';
}

export interface WatchContext {
  today: TodayMarket;
  vi: number | null;
}

/**
 * 監視銘柄の「今日の扱い」を簡易判定する。
 *   1. 見送り：リスクオフ / リスクスコアが基準超 / 本日決算
 *   2. 押し目待ち：急騰翌日・想定GUが許容超・GD想定・VI高め・スタンス・押し目型のいずれか
 *   3. それ以外は寄り追いOK
 */
export function judgeWatchItem(c: AnalyzedCandidate, ctx: WatchContext): WatchItem {
  const { today, vi } = ctx;
  const rules = today.watchlistRules;
  const gap = today.expectedOpen.gapPct;
  const setup = classifySetup(c, c.metrics);

  const cautions = c.warnings.filter((w) => w.severity !== 'low').map((w) => `${w.label}（${w.detail}）`);
  if (c.earnings.nextDate === nextBusinessDay(today.asOf)) {
    cautions.push(`翌営業日（${formatDateJa(c.earnings.nextDate)}）に決算。引け前のポジション調整に注意`);
  }
  cautions.push(`寄りで+${gapUpTolerancePct(c.metrics.atrPct)}%超なら追わない`);

  const result = (action: WatchAction, reasons: string[]): WatchItem => ({
    candidate: c,
    action,
    reason: reasons.slice(0, 2).join('。'),
    cautions,
  });

  // 1. 見送り
  if (today.stance === 'リスクオフ') return result('skip', ['地合いがリスクオフのため新規は見送り']);
  if (c.scores.risk > rules.avoidIfRiskScoreOver) {
    return result('skip', [`リスクスコア${Math.round(c.scores.risk)}が基準（${rules.avoidIfRiskScoreOver}）超`]);
  }
  if (c.earnings.nextDate === today.asOf) return result('skip', ['本日決算発表のため、発表前の新規は見送り']);

  // 2. 押し目待ち
  const waits: string[] = [];
  if (c.warnings.some((w) => w.id === 'post-surge')) waits.push('急騰翌日で寄りは利食いが出やすい');
  if (gap > rules.gapUpAllowedPct) waits.push(`想定寄り${formatPct(gap)}が許容（+${rules.gapUpAllowedPct}%）超`);
  if (gap <= TODAY_THRESHOLDS.gapDownPct) waits.push('GD想定。先物の下げ止まり確認まで待機');
  if (vi !== null && vi >= TODAY_THRESHOLDS.viNoChase) waits.push(`日経VI ${vi.toFixed(1)}と高めで寄り追いは控える`);
  if (today.stance !== '買い目線') waits.push(`今日のスタンスが「${today.stance}」`);
  if (setup === 'pullback' || setup === 'rebound') waits.push(`${SETUP_LABELS[setup]}の形で、引きつけて拾う想定`);
  if (waits.length > 0) return result('wait-pullback', waits);

  // 3. 寄り追いOK
  return result('chase-ok', [`${SETUP_LABELS[setup]}。想定寄りが許容内なら寄りから打診可`]);
}

// ---------------------------------------------------------------------------
// イベント
// ---------------------------------------------------------------------------

function buildTodayEvents(today: TodayMarket, swing: DatasetAnalysis): TodayAnalysis['events'] {
  const events: TodayAnalysis['events'] = [...today.events];
  const has = (pattern: RegExp) => events.some((e) => pattern.test(e.label));
  const [y, m] = today.asOf.split('-').map(Number);

  const sq = sqDate(y ?? 0, m ?? 0);
  if (sq.date === today.asOf && !has(/SQ/)) {
    events.push({
      time: '09:00',
      label: sq.major ? 'メジャーSQ' : 'ミニSQ',
      importance: sq.major ? 'high' : 'medium',
      category: 'sq',
      note: '寄り付きでSQ値算出。寄りの板が荒れやすい',
      auto: true,
    });
  }
  if (!isBusinessDay(today.asOf)) {
    events.push({ label: '休場日', importance: 'high', category: 'holiday', note: '国内市場は休場', auto: true });
  }
  for (const c of swing.top) {
    if (c.earnings.nextDate === today.asOf && !has(new RegExp(c.code))) {
      events.push({
        time: c.earnings.timing === 'after-close' ? '15:30' : c.earnings.timing === 'pre-market' ? '08:00' : undefined,
        label: `${c.code} ${c.name} 決算`,
        importance: 'high',
        category: 'earnings',
        note: '監視銘柄の決算発表',
        auto: true,
      });
    }
  }
  // 時刻なしは末尾
  return events.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

function swingRoleOf(date: string, swing: DatasetAnalysis): TodayAnalysis['swingRole'] {
  const w = swing.window;
  if (date === w.entryDate) return { role: 'entry', label: `IN日（${w.pattern.label}）` };
  if (date === w.exitDate) return { role: 'exit', label: 'OUT日（大引けまでに手仕舞い）' };
  if (isWithinWindow(date, w)) {
    const n = w.holdingDays.indexOf(date) + 1;
    return { role: 'hold', label: `保有${n}日目（OUTは${formatDateJa(w.exitDate)}）` };
  }
  return { role: 'outside', label: '保有期間外' };
}

export function analyzeToday(
  today: TodayMarket,
  swing: DatasetAnalysis,
  memo: ParsedMarketMemo | null = null,
): TodayAnalysis {
  const own = today.externalQuotes.find((q: Quote) => q.id === 'nikkeiVI') ?? today.externalQuotes.find((q: Quote) => q.id === 'vix');
  const swingVi = findQuote(swing.dataset.marketContext, 'nikkeiVI');
  const viSource = own
    ? { value: own.value, label: own.label, source: 'today' as const }
    : swingVi
      ? { value: swingVi.value, label: swingVi.label, source: 'swing' as const }
      : null;
  const vi = viSource ? { ...viSource, regime: viRegime(viSource.value) } : null;

  const notices: string[] = [];
  if (toTime(today.asOf) < toTime(swing.dataset.asOf)) {
    notices.push(
      `Todayデータの日付（${formatDateJa(today.asOf)}）がスイング候補の基準日（${formatDateJa(swing.dataset.asOf)}）より前です。today-market.json が更新されているか確認してください。`,
    );
  }
  if (!isBusinessDay(today.asOf)) notices.push(`${formatDateJa(today.asOf)}は休場日です。`);

  return {
    today,
    vi,
    likelyScenarioId: likelyScenarioId(today.expectedOpen.gapPct),
    events: buildTodayEvents(today, swing),
    watchlist: swing.top.map((c) => judgeWatchItem(c, { today, vi: vi?.value ?? null })),
    swingRole: swingRoleOf(today.asOf, swing),
    notices,
    memo,
  };
}
