/**
 * Today（当日の寄り前・場中判断）の分析。
 *
 *   TodayMarket（data/today-market.json）＋ スイング分析の上位候補 ＋ 市況メモ（任意）
 *     → 想定に近い寄り付きシナリオ・今日のイベント・監視銘柄の扱い
 *
 * 画面（TodayPage など）はここの結果を表示するだけにする。判定の閾値は TODAY_THRESHOLDS に集約。
 */
import type { Quote } from '../types/dataset';
import type { MemoPick, OpenScenario, PickRole, TodayEvent, TodayMarket } from '../types/today';
import type { AnalyzedCandidate, DatasetAnalysis } from './analysis';
import { formatDateJa, isBusinessDay, isWithinWindow, nextBusinessDay, prevBusinessDay, sqDate, toTime } from './calendar';
import { formatPct } from './format';
import { viRegime, type ViRegime } from './market';
import type { ParsedMarketMemo } from './marketMemo';
import { normalizeNumbers } from './memoBrief';
import { findQuote } from './scoring';
import { openGapLabel, upgradeScenarios } from './todayBuilder';
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
  /** 市況メモでの扱い（本線・待機など）。メモに無ければ undefined */
  memoRole?: PickRole;
  /** swing：スイングの上位候補 / memo：上位外だが市況メモで本線・確認後に挙がった銘柄 */
  origin: 'swing' | 'memo';
}

export const PICK_ROLE_LABELS: Record<PickRole, string> = {
  main: '本線',
  confirm: '確認後',
  wait: '待機',
  avoid: '避ける',
};

/** 市況メモの銘柄に、採点済みの候補（あれば）を対応づけたもの */
export interface MatchedPick extends MemoPick {
  candidate?: AnalyzedCandidate;
}

export type SwingDayRole = 'entry' | 'hold' | 'exit' | 'outside';

export interface TodayAnalysis {
  today: TodayMarket;
  /** 判定に使った日経VI（Today に無ければスイング側の前日終値）と、その水準の区分 */
  vi: { value: number; label: string; source: 'today' | 'swing'; regime: ViRegime } | null;
  /** 寄り付きに最も近いシナリオの id（実際の寄りがあればそれ、無ければ想定寄りで判定） */
  likelyScenarioId: OpenScenario['id'] | null;
  /** 想定寄りに近いシナリオの id（実際の寄りと違えば「想定」の印を出す） */
  expectedScenarioId: OpenScenario['id'] | null;
  /** 判定に使った寄り付き。actual：実際の寄り / expected：想定寄り / unknown：想定寄りが未確認で、まだ寄っていない */
  open: { basis: 'actual' | 'expected' | 'unknown'; gapPct: number | null; label: string };
  /** 日経平均の前日終値（実際の寄りを金額で入れたときの％計算に使う）。分からなければ null */
  previousClose: number | null;
  /** 時刻順。SQ・休場・上位候補の決算を自動で追加済み */
  events: (TodayEvent & { auto?: boolean })[];
  watchlist: WatchItem[];
  /** スイングの保有ウィンドウから見た今日の位置づけ */
  swingRole: { role: SwingDayRole; label: string };
  /** データ鮮度などの注意 */
  notices: string[];
  /** 貼り付け（または JSON 同梱）の市況メモ。無ければ null */
  memo: ParsedMarketMemo | null;
  /** 市況メモの本線・確認後・待機・避ける銘柄（today.plan.picks に候補を対応づけたもの） */
  picks: MatchedPick[];
  /** 市況メモの「未確認」を、今日の判断に関わるもの（important）と参考（other）に分けたもの */
  unconfirmed: { important: string[]; other: string[] };
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
  // 寄った後に実際の寄りが入っていれば、想定寄りではなくそちらで判定する
  const actual = today.actualOpen;
  const gap = actual?.gapPct ?? (today.expectedOpen.unconfirmed ? null : today.expectedOpen.gapPct);
  const openWord = actual ? '寄り' : '想定寄り';
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
    origin: 'swing',
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
  if (gap === null) waits.push('想定寄りが未確認。寄り付きを見てから判断');
  else if (gap > rules.gapUpAllowedPct) waits.push(`${openWord}${formatPct(gap)}が許容（+${rules.gapUpAllowedPct}%）超`);
  if (gap !== null && gap <= TODAY_THRESHOLDS.gapDownPct) {
    waits.push(actual ? 'GDで寄り付き。先物の下げ止まり確認まで待機' : 'GD想定。先物の下げ止まり確認まで待機');
  }
  if (vi !== null && vi >= TODAY_THRESHOLDS.viNoChase) waits.push(`日経VI ${vi.toFixed(1)}と高めで寄り追いは控える`);
  if (today.stance !== '買い目線') waits.push(`今日のスタンスが「${today.stance}」`);
  if (setup === 'pullback' || setup === 'rebound') waits.push(`${SETUP_LABELS[setup]}の形で、引きつけて拾う想定`);
  if (waits.length > 0) return result('wait-pullback', waits);

  // 3. 寄り追いOK
  return result('chase-ok', [
    actual ? `${SETUP_LABELS[setup]}。寄りは許容内。VWAP付近で打診可` : `${SETUP_LABELS[setup]}。想定寄りが許容内なら寄りから打診可`,
  ]);
}

// ---------------------------------------------------------------------------
// 実際の寄り
// ---------------------------------------------------------------------------

/**
 * 日経平均の前日終値。実際の寄りを金額で入れたときの％計算に使う。
 *   1. 市況メモの節目の「前日終値・昨日終値」
 *   2. スイング候補の基準日が前営業日なら、その地合いの日経平均（＝前日の引け）
 *   3. Today の日経平均（寄り前のメモなら前日終値）
 */
export function previousClose(today: TodayMarket, swing: DatasetAnalysis | null): number | null {
  const level = today.levels?.find((l) => /前日終値|昨日終値/.test(l.label));
  if (level) return level.price;
  if (swing && swing.dataset.asOf === prevBusinessDay(today.asOf)) {
    const q = findQuote(swing.dataset.marketContext, 'nikkei225');
    if (q) return q.value;
  }
  return today.externalQuotes.find((q) => q.id === 'nikkei225')?.value ?? null;
}

export type ActualOpenInput =
  | { kind: 'price' | 'pct'; gapPct: number; price?: number; basePrice?: number }
  | { error: string };

/** 日経平均の金額か％（以下）と見なす境目。これ以上の数は金額、未満は％ */
const PRICE_MIN = 1000;

/**
 * 「実際の寄り」の入力を読む。金額（71,250）でも％（+0.8% / 0.8）でもよい。
 * 金額なら前日終値から％を、％なら前日終値から金額（目安）を計算する。
 */
export function parseActualOpen(text: string, prevClose: number | null): ActualOpenInput {
  const t = normalizeNumbers(text).replace(/[\s,円]/g, '');
  const m = t.match(/^([+-]?\d+(?:\.\d+)?)(%?)$/);
  if (!m) return { error: '金額（例：71250）か％（例：+0.8%）で入力してください' };
  const n = Number(m[1]);
  const isPct = m[2] === '%' || Math.abs(n) < PRICE_MIN;
  if (isPct) {
    if (Math.abs(n) > 20) return { error: '前日比が大きすぎます。％の値を確認してください' };
    return { kind: 'pct', gapPct: n, ...(prevClose ? { price: Math.round(prevClose * (1 + n / 100)), basePrice: prevClose } : {}) };
  }
  if (!prevClose) return { error: '前日終値が分からないため、％で入力してください' };
  const gapPct = Math.round((n / prevClose - 1) * 10000) / 100;
  if (Math.abs(gapPct) > 20) return { error: `前日終値（${prevClose.toLocaleString('ja-JP')}）から離れすぎています。金額を確認してください` };
  return { kind: 'price', gapPct, price: n, basePrice: prevClose };
}

// ---------------------------------------------------------------------------
// 市況メモの銘柄
// ---------------------------------------------------------------------------

const normalizeName = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/ホールディングス|HD|グループ|株式会社|\(株\)/gi, '')
    .toLowerCase();

/** メモの銘柄を採点済みの候補に対応づける。コードが一致すればそれ、無ければ名前の前方一致 */
export function matchPick(pick: MemoPick, ranked: AnalyzedCandidate[]): AnalyzedCandidate | undefined {
  if (pick.code) return ranked.find((c) => c.code === pick.code);
  const name = normalizeName(pick.name);
  if (name.length < 2) return undefined;
  return ranked.find((c) => {
    const n = normalizeName(c.name);
    return n.startsWith(name) || name.startsWith(n);
  });
}

/** メモでの扱いを、監視銘柄の判定に重ねる（メモの「待機」「避ける」は判定より優先） */
export function applyMemoRole(item: WatchItem, role: PickRole | undefined): WatchItem {
  if (!role) return item;
  const label = PICK_ROLE_LABELS[role];
  const withReason = (action: WatchAction, reason: string) => ({
    ...item,
    action,
    reason: [reason, item.reason].filter(Boolean).join('。'),
    memoRole: role,
  });
  switch (role) {
    case 'avoid':
      return withReason('skip', `市況メモで「${label}」`);
    case 'wait':
      return withReason(item.action === 'skip' ? 'skip' : 'wait-pullback', `市況メモで「${label}」`);
    case 'confirm':
      return withReason(item.action === 'chase-ok' ? 'wait-pullback' : item.action, '市況メモで「確認後」。寄り後の強さを確かめてから');
    case 'main':
      return withReason(item.action, '市況メモの本線');
  }
}

// ---------------------------------------------------------------------------
// 未確認の項目
// ---------------------------------------------------------------------------

/**
 * 今日の判断に関わる未確認とみなす語。
 * 想定寄り（先物・CFD・気配）、サイズ（VI）、半導体の地合い（SOX）、ADR、重要イベント。
 * それ以外（騰落レシオ・空売り比率・開示PDFの照合・新規上場など）は参考として畳む。
 */
export const IMPORTANT_UNCONFIRMED = /想定寄り|寄り付き|気配|先物|CFD|SOX|半導体指数|日経VI|VIX|ADR|FOMC|日銀|雇用統計|CPI|SQ/i;

/** 未確認の項目を、判断に関わるもの（上の語、またはメモの銘柄・上位候補に触れるもの）と参考に分ける */
export function classifyUnconfirmed(items: string[], stocks: { code?: string; name: string }[]): TodayAnalysis['unconfirmed'] {
  const names = stocks.flatMap((s) => [s.code, normalizeName(s.name).length >= 2 ? s.name : undefined]).filter((x): x is string => Boolean(x));
  const important: string[] = [];
  const other: string[] = [];
  for (const item of items) {
    const aboutStock = names.some((n) => item.includes(n));
    (IMPORTANT_UNCONFIRMED.test(item) || aboutStock ? important : other).push(item);
  }
  return { important, other };
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
  // 当日 → 翌日以降の順、同じ日は時刻順（時刻なしは末尾）
  const key = (e: TodayEvent) => `${e.date ?? today.asOf} ${e.time ?? '99:99'}`;
  return events.sort((a, b) => key(a).localeCompare(key(b)));
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
  input: TodayMarket,
  swing: DatasetAnalysis,
  memo: ParsedMarketMemo | null = null,
): TodayAnalysis {
  // ブラウザに保存済みの Today は以前の既定文言のことがあるので、表示前に直す
  const today = { ...input, scenarios: upgradeScenarios(input.scenarios) };
  const actual = today.actualOpen;
  const open = actual
    ? { basis: 'actual' as const, gapPct: actual.gapPct, label: openGapLabel(actual.gapPct) }
    : today.expectedOpen.unconfirmed
      ? { basis: 'unknown' as const, gapPct: null, label: '未確認' }
      : { basis: 'expected' as const, gapPct: today.expectedOpen.gapPct, label: today.expectedOpen.label };
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

  const picks: MatchedPick[] = (today.plan?.picks ?? []).map((p) => ({ ...p, candidate: matchPick(p, swing.ranked) }));
  const roleOf = (code: string) => picks.find((p) => p.candidate?.code === code)?.role;
  const ctx = { today, vi: vi?.value ?? null };
  const topCodes = new Set(swing.top.map((c) => c.code));
  // 上位候補 ＋ 上位外でもメモで本線・確認後に挙がった採点済みの銘柄
  const fromMemo = picks
    .filter((p) => p.candidate && !topCodes.has(p.candidate.code) && (p.role === 'main' || p.role === 'confirm'))
    .map((p) => ({ ...judgeWatchItem(p.candidate!, ctx), origin: 'memo' as const }));

  return {
    today,
    vi,
    likelyScenarioId: open.gapPct === null ? null : likelyScenarioId(open.gapPct),
    expectedScenarioId: today.expectedOpen.unconfirmed ? null : likelyScenarioId(today.expectedOpen.gapPct),
    open,
    previousClose: previousClose(today, swing),
    events: buildTodayEvents(today, swing),
    watchlist: [...swing.top.map((c) => judgeWatchItem(c, ctx)), ...fromMemo].map((w) => applyMemoRole(w, roleOf(w.candidate.code))),
    swingRole: swingRoleOf(today.asOf, swing),
    notices,
    memo,
    picks,
    unconfirmed: classifyUnconfirmed(today.unconfirmed ?? [], [...picks, ...swing.top]),
  };
}
