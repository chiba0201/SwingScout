/**
 * 「今週の作戦」レポート。
 *
 * - build*() … レポートの中身（文章・グループ分け）を構造化データで返す。画面（レポート閲覧）が使う
 * - render*() / generateWeeklyReport() … 同じ中身を Markdown にする（.md 保存・CLI）
 * 文体の調整やセクション追加はこのファイル内で完結する。入力は analyzeDataset() の結果。
 */
import { provisionalPlanMessage, type DatasetAnalysis, type AnalyzedCandidate, type CalendarEvent } from './analysis';
import { formatDateJa, isWithinWindow, toTime } from './calendar';
import { formatDateTime, formatNumber, formatPct, formatPrice, formatScore, formatSigned, pctFrom } from './format';
import { STANCE_LABELS, viRegime } from './market';
import { findQuote } from './scoring';
import type { Quote, SectorMove } from '../types/dataset';
import { renderTodaySection, type TodaySectionInput } from './todayReportGenerator';

export interface ReportSections {
  /** 今日の市況（Today）。ヘッダー直後に入る */
  today: boolean;
  market: boolean;
  events: boolean;
  picks: boolean;
  operations: boolean;
  table: boolean;
}

export interface ReportOptions {
  /** 未指定なら「今週の作戦（火曜In金曜out）」 */
  title?: string;
  /** full: 銘柄ごとに全項目 / compact: 1銘柄数行 */
  detail: 'full' | 'compact';
  sections: ReportSections;
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  detail: 'full',
  sections: { today: false, market: true, events: true, picks: true, operations: true, table: true },
};

export const DISCLAIMER =
  '本レポートは公開情報等をもとにした分析補助のメモであり、特定銘柄の売買を推奨・助言するものではありません。数値や日程は必ず一次情報で確認し、投資判断はご自身の責任で行ってください。';

const IMPORTANCE_STARS = { high: '★★★', medium: '★★', low: '★' } as const;

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** 表セル用のエスケープ */
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** 指数は騰落率、VI・為替・金利は値幅で表示する */
const quoteText = (q: Quote | undefined, change: 'pct' | 'points' = 'pct') => {
  if (!q) return null;
  const digits = q.decimals ?? 0;
  const value = `${formatNumber(q.value, digits)}${q.unit ?? ''}`;
  const delta = change === 'pct' ? formatPct(q.changePct) : formatSigned(q.change, Math.max(digits, 1));
  return `${q.label} ${value}（${delta}）`;
};

const priceWithPct = (price: number, close: number) =>
  `${formatPrice(price)}円（${formatPct(pctFrom(price, close))}）`;

const warningText = (c: AnalyzedCandidate) =>
  c.warnings.length === 0 ? '' : c.warnings.map((w) => `⚠${w.label}`).join(' ');

const eventDate = (e: CalendarEvent) => `${formatDateJa(e.date)}${e.time ? ` ${e.time}` : ''}`;

// ---------------------------------------------------------------------------
// 構造化データ（画面と Markdown で共通）
// ---------------------------------------------------------------------------

export function reportTitle(a: DatasetAnalysis, title?: string): string {
  return title?.trim() || `今週の作戦（${a.window.pattern.label}）`;
}

export type EventPhase = 'IN前' | '保有中' | 'OUT後';

/** イベントが保有期間のどこにあるか */
export function eventPhase(e: CalendarEvent, a: DatasetAnalysis): EventPhase {
  if (isWithinWindow(e.date, a.window)) return '保有中';
  return toTime(e.date) < toTime(a.window.entryDate) ? 'IN前' : 'OUT後';
}

/** 基準日の騰落率で、強い業種・弱い業種（各最大3つ） */
export function sectorHighlights(a: DatasetAnalysis): { strong: SectorMove[]; weak: SectorMove[] } {
  const sorted = [...a.dataset.marketContext.sectors].sort((x, y) => y.changePct - x.changePct);
  return {
    strong: sorted.filter((s) => s.changePct > 0).slice(0, 3),
    weak: sorted.filter((s) => s.changePct < 0).slice(-3).reverse(),
  };
}

export interface ReportNote {
  /** 「SQ」「決算」など、行頭の見出し（無い行もある） */
  label?: string;
  text: string;
}

export interface ReportNoteGroup {
  id: 'correlation' | 'gap' | 'calendar' | 'position';
  title: string;
  notes: ReportNote[];
}

/** 運用上の注意（相関リスク・GU時の入り方・SQ/決算/米指標・ポジション管理） */
export function buildOperationNotes(a: DatasetAnalysis): ReportNoteGroup[] {
  const { window: w, top, events, concentration } = a;
  const mc = a.dataset.marketContext;

  // 相関リスク
  const correlation: ReportNote[] = [];
  if (concentration.length === 0) {
    correlation.push({ text: `上位${top.length}銘柄に同一セクター・同一テーマの重複はなし。` });
  } else {
    for (const g of concentration) {
      const kind = g.kind === 'sector' ? '業種' : 'テーマ';
      correlation.push({
        text: `${kind}「${g.key}」が${g.codes.length}銘柄（${g.codes.join(', ')}）。同時に持つなら合計で1.5銘柄分程度までに抑える。`,
      });
    }
  }
  const highBeta = top.filter((c) => (c.sensitivity?.beta ?? 1) >= 1.3).map((c) => c.code);
  if (highBeta.length >= 2) {
    correlation.push({ text: `高β銘柄（${highBeta.join(', ')}）は指数が崩れると同時に下げやすい。指数連動の逆指値も意識。` });
  }

  // GU
  const gap: ReportNote[] = [
    { text: '銘柄ごとの許容GU幅（各銘柄の「GU時」参照）までは寄りで追わず、5分足でVWAPを回復してからの押しを待つ。' },
    { text: '許容幅の2倍を超えるGUは見送り。無理に入らず翌日以降の押しを待つか、その週はパス。' },
  ];
  const surged = top.filter((c) => c.warnings.some((x) => x.id === 'post-surge')).map((c) => c.code);
  if (surged.length) gap.push({ text: `急騰翌日の銘柄（${surged.join(', ')}）は初日の寄りで飛びつかない。` });

  // SQ・決算・米指標
  const calendar: ReportNote[] = [];
  const relevant = events.filter(
    (e) => toTime(e.date) >= toTime(w.weekDays[0] ?? w.entryDate) && toTime(e.date) <= toTime(w.nextOpenAfterExit),
  );
  for (const e of relevant.filter((x) => x.category === 'sq')) {
    const onExit = e.date === w.exitDate;
    calendar.push({
      label: 'SQ',
      text: `${formatDateJa(e.date)} ${e.label}。${onExit ? 'OUT日と重なるため寄りの板が荒れやすい。寄りで決済する場合は指値で、ザラ場の手仕舞いも選択肢。' : '前後は先物主導で振れやすい。'}`,
    });
  }
  const inWindowEarnings = top.filter((c) => c.metrics.earningsTiming === 'in-window');
  const exitDayEarnings = top.filter((c) => c.metrics.earningsTiming === 'exit-day');
  for (const c of inWindowEarnings) {
    calendar.push({
      label: '決算',
      text: `${c.code} ${c.name} は ${c.earnings.nextDate ? formatDateJa(c.earnings.nextDate) : '期間中'}${c.earnings.timing === 'after-close' ? '引け後' : ''}に発表（保有期間中）。またぐならサイズ半分以下、避けるなら発表前に手仕舞い。`,
    });
  }
  for (const c of exitDayEarnings) {
    calendar.push({ label: '決算', text: `${c.code} ${c.name} はOUT日に発表。発表前に必ず決済。` });
  }
  if (inWindowEarnings.length + exitDayEarnings.length === 0) {
    calendar.push({ label: '決算', text: `上位${top.length}銘柄に保有期間中の決算予定はなし。` });
  }
  const macro = relevant.filter((e) => e.category === 'us-macro' || e.category === 'central-bank');
  if (macro.length) {
    const list = macro.map((e) => `${eventDate(e)} ${e.label}`).join('、');
    calendar.push({ label: '米指標・金融政策', text: `${list}。日本時間の夜間〜早朝に出るものは翌朝の寄りでGU/GDしやすい。` });
  } else {
    calendar.push({ label: '米指標', text: '期間中に重要指標の登録なし（念のため経済カレンダーで確認）。' });
  }
  if (w.closedDaysAfterExit > 2) {
    calendar.push({
      label: '連休',
      text: `OUT日の翌営業日は${formatDateJa(w.nextOpenAfterExit)}（${w.closedDaysAfterExit}日間休場）。連休前に全決済し、持ち越さない。`,
    });
  }

  // ポジション管理
  const position: ReportNote[] = [];
  const vi = findQuote(mc, 'nikkeiVI');
  if (vi) {
    const regime = viRegime(vi.value);
    position.push({ text: `日経VI ${vi.value.toFixed(1)}（${regime.label}）→ ${regime.guidance}。` });
  }
  position.push(
    { text: '損切りの逆指値はエントリーと同時に入れる。' },
    { text: `${top.length}銘柄すべてに入る必要はない。入り方の条件を満たしたものだけ。` },
  );

  return [
    { id: 'correlation', title: '相関リスク', notes: correlation },
    { id: 'gap', title: 'GU時の入り方', notes: gap },
    { id: 'calendar', title: 'SQ・決算・米指標', notes: calendar },
    { id: 'position', title: 'ポジション管理', notes: position },
  ];
}

// ---------------------------------------------------------------------------
// セクション（Markdown）
// ---------------------------------------------------------------------------

export function renderHeader(a: DatasetAnalysis, options: ReportOptions): string {
  const { window: w, dataset } = a;
  const lines = [
    `# ${reportTitle(a, options.title)}`,
    '',
    `> **想定**: ${formatDateJa(w.entryDate)} 寄りIn → ${formatDateJa(w.exitDate)} 大引けまでにOut（${w.holdingDays.length}営業日）  `,
    `> **データ基準日**: ${formatDateJa(dataset.asOf)} 引け ／ 生成: ${formatDateTime(dataset.meta.generatedAt)}`,
  ];
  if (dataset.meta.isSample) {
    lines.push('>', '> ⚠ **サンプルデータ**です。銘柄・数値・日程はすべて架空で、実在銘柄の推奨ではありません。');
  }
  const provisional = provisionalPlanMessage(a);
  if (provisional) lines.push('>', `> ⚠ **暫定**：${provisional}`);
  return lines.join('\n');
}

export function renderMarket(a: DatasetAnalysis): string {
  const mc = a.dataset.marketContext;
  const q = (id: string) => quoteText(findQuote(mc, id), 'points');
  const vi = findQuote(mc, 'nikkeiVI');
  const lines = [
    '## 地合い',
    '',
    `**スタンス: ${STANCE_LABELS[mc.stance]}** — ${mc.headline}`,
    '',
    // Today から作った地合いは「前日」が一言と同じ文になるので省く。今週の見通しが無ければ省く
    ...(mc.summaryToday && mc.summaryToday !== mc.headline ? [`- 前日: ${mc.summaryToday}`] : []),
    ...(mc.summaryWeek ? [`- 今週: ${mc.summaryWeek}`] : []),
  ];
  const idx = mc.indices.map((x) => quoteText(x)).filter(Boolean).join(' ／ ');
  if (idx) lines.push(`- 指数: ${idx}`);
  const macro = [q('nikkeiVI'), q('usdjpy'), q('us10y')].filter(Boolean).join(' ／ ');
  if (macro) lines.push(`- ボラ・為替・金利: ${macro}`);
  if (vi) {
    const regime = viRegime(vi.value);
    lines.push(`- 日経VI ${vi.value.toFixed(1)}は「${regime.label}」水準 → ${regime.guidance}。`);
  }

  if (mc.sectors.length > 0) {
    const fmt = (s: SectorMove) => `${s.sector} ${formatPct(s.changePct)}`;
    const { strong, weak } = sectorHighlights(a);
    if (strong.length) lines.push(`- 強い業種: ${strong.map(fmt).join('、')}`);
    if (weak.length) lines.push(`- 弱い業種: ${weak.map(fmt).join('、')}`);
  }
  for (const note of mc.riskNotes) lines.push(`- 注意: ${note}`);
  return lines.join('\n');
}

export function renderEvents(a: DatasetAnalysis): string {
  const lines = ['## 今週のイベント', ''];
  if (a.events.length === 0) return [...lines, '期間内に登録されたイベントはありません。'].join('\n');
  lines.push('| 日時 | イベント | 重要度 | 保有期間 | メモ |', '|---|---|---|---|---|');
  for (const e of a.events) {
    lines.push(
      `| ${eventDate(e)} | ${cell(e.label)} | ${IMPORTANCE_STARS[e.importance]} | ${eventPhase(e, a)} | ${cell(e.note ?? '')} |`,
    );
  }
  return lines.join('\n');
}

function renderPickFull(c: AnalyzedCandidate): string {
  const s = c.scores;
  const close = c.price.close;
  const targets = c.takeProfit.targets
    .map((t) => `${priceWithPct(t.price, close)}で${t.label}`)
    .join(' → ');
  const lines = [
    `### ${c.rank}. ${c.code} ${c.name}｜${c.sector}・${c.theme}｜総合 ${formatScore(s.total)}`,
    '',
    `終値 ${formatPrice(close)}円（${formatPct(c.price.changePct)}）　需給 ${formatScore(s.supplyDemand)} ／ テク ${formatScore(s.technical)} ／ イベント ${formatScore(s.event)} ／ リスク ${formatScore(s.risk)}${c.warnings.length ? `　${warningText(c)}` : ''}`,
    '',
    `- **需給**: ${c.comments.supplyDemand}`,
    `- **テクニカル**: ${c.comments.technical}`,
    `- **ファンダ/イベント**: ${c.comments.fundamental}`,
    '- **入り方**',
    `  - 通常時: ${c.entryPlan.method}`,
  ];
  if (c.entryPlan.gapUpRule) lines.push(`  - GU時: ${c.entryPlan.gapUpRule}`);
  if (c.entryPlan.gapDownRule) lines.push(`  - GD時: ${c.entryPlan.gapDownRule}`);
  lines.push(
    `- **損切り**: ${priceWithPct(c.stopLoss.price, close)} — ${c.stopLoss.rule}`,
    `- **利確**: ${targets}。${c.takeProfit.rule}`,
    `- **見送り条件**: ${c.risks.skipConditions.join(' ／ ')}`,
  );
  return lines.join('\n');
}

function renderPickCompact(c: AnalyzedCandidate): string {
  const close = c.price.close;
  const zone =
    c.entryPlan.zoneLow !== undefined && c.entryPlan.zoneHigh !== undefined
      ? `${formatPrice(c.entryPlan.zoneLow)}〜${formatPrice(c.entryPlan.zoneHigh)}円`
      : '計画参照';
  const tp = c.takeProfit.targets.map((t) => formatPrice(t.price)).join('→');
  return [
    `**${c.rank}. ${c.code} ${c.name}**（${c.sector}・${c.theme}）総合${formatScore(c.scores.total)} ${warningText(c)}`,
    `- ${c.technical.pattern ?? ''}${c.technical.pattern ? '：' : ''}入り ${zone} ／ 損切り ${priceWithPct(c.stopLoss.price, close)} ／ 利確 ${tp}円`,
    `- 見送り: ${c.risks.skipConditions.slice(0, 2).join(' ／ ')}`,
  ].join('\n');
}

export function renderPicks(a: DatasetAnalysis, options: ReportOptions): string {
  const body = a.top.map((c) => (options.detail === 'full' ? renderPickFull(c) : renderPickCompact(c)));
  return [`## 上位${a.top.length}銘柄`, '', body.join('\n\n')].join('\n');
}

export function renderOperations(a: DatasetAnalysis): string {
  const lines = ['## 運用上の注意', ''];
  buildOperationNotes(a).forEach((g, i) => {
    if (i > 0) lines.push('');
    lines.push(`### ${g.title}`, ...g.notes.map((n) => (n.label ? `- **${n.label}**: ${n.text}` : `- ${n.text}`)));
  });
  return lines.join('\n');
}

export function renderSummaryTable(a: DatasetAnalysis): string {
  const lines = [
    '## 一覧',
    '',
    '| # | コード | 銘柄 | 業種 | 総合 | 需給 | テク | イベ | リスク | 損切り | 第1利確 | 警告 |',
    '|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|',
  ];
  for (const c of a.top) {
    const s = c.scores;
    const t1 = c.takeProfit.targets[0];
    lines.push(
      `| ${c.rank} | ${c.code} | ${cell(c.name)} | ${cell(c.sector)} | ${formatScore(s.total)} | ${formatScore(s.supplyDemand)} | ${formatScore(s.technical)} | ${formatScore(s.event)} | ${formatScore(s.risk)} | ${formatPrice(c.stopLoss.price)} | ${t1 ? formatPrice(t1.price) : '—'} | ${cell(c.warnings.map((w) => w.label).join('・'))} |`,
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/** 週次レポート以外のデータ源（Today など）。sections.today が true のときに使う */
export type ReportExtras = Partial<TodaySectionInput>;

export function generateWeeklyReport(
  analysis: DatasetAnalysis,
  options: ReportOptions = DEFAULT_REPORT_OPTIONS,
  extras: ReportExtras = {},
): string {
  const { sections } = options;
  const blocks = [renderHeader(analysis, options)];
  if (sections.today) blocks.push(renderTodaySection({ today: extras.today ?? null, memo: extras.memo }));
  if (sections.market) blocks.push(renderMarket(analysis));
  if (sections.events) blocks.push(renderEvents(analysis));
  if (sections.picks) blocks.push(renderPicks(analysis, options));
  if (sections.operations) blocks.push(renderOperations(analysis));
  if (sections.table) blocks.push(renderSummaryTable(analysis));
  blocks.push(`---\n\n※${DISCLAIMER}`);
  return `${blocks.join('\n\n')}\n`;
}
