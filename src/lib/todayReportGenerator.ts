/**
 * Today（今日の市況）の Markdown 生成。
 *
 * - renderTodaySection(): 週次レポート（reportGenerator.ts）の冒頭付近に差し込むセクション
 * - generateTodayReport(): Today 単体のレポート（見出し・注意書き付き）
 * 構造化データ（today-market.json）と市況メモ（貼り付け Markdown）のどちらか一方だけでも出力できる。
 */
import type { Quote } from '../types/dataset';
import { formatDateJa } from './calendar';
import { formatDateTime, formatNumber, formatPct, formatSigned, inferDecimals } from './format';
import type { ParsedMarketMemo } from './marketMemo';
import { PICK_ROLE_LABELS, WATCH_ACTION_LABELS, type TodayAnalysis } from './todayAnalysis';

const IMPORTANCE_STARS = { high: '★★★', medium: '★★', low: '★' } as const;

/** 表セル用のエスケープ */
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const SECTOR_LABELS = { priority: '優先', select: '選別', caution: '慎重' } as const;

function quoteRow(q: Quote): string {
  const digits = q.decimals ?? inferDecimals(q.value);
  const change = q.changeUnknown
    ? '—'
    : q.change === 0 && q.changePct !== 0
      ? formatPct(q.changePct, 2)
      : q.unit === '%'
        ? formatSigned(q.change, 2)
        : `${formatSigned(q.change, Math.max(digits, 1))}（${formatPct(q.changePct, 2)}）`;
  return `| ${cell(q.label)}${q.note ? `（${cell(q.note)}）` : ''} | ${formatNumber(q.value, digits)}${q.unit ?? ''} | ${change} |`;
}

/** 市況メモのまとめから取れた売買方針・セクター・節目（無ければ空） */
function renderPlan(t: TodayAnalysis, h: string): string[] {
  const d = t.today;
  const lines: string[] = [];
  const roles = (['main', 'confirm', 'wait', 'avoid'] as const)
    .map((role) => ({ role, picks: t.picks.filter((p) => p.role === role) }))
    .filter((g) => g.picks.length > 0);
  if (roles.length > 0 || d.plan?.entry || d.plan?.invalidation || d.plan?.stopLoss || d.sectorStances?.length) {
    lines.push('', `${h} 今日の売買方針`, '');
    for (const { role, picks } of roles) {
      const names = picks.map((p) => `${p.name}${p.code ? `（${p.code}）` : ''}${p.candidate ? ` ${p.candidate.rank}位` : ''}`);
      lines.push(`- **${PICK_ROLE_LABELS[role]}**: ${names.join('、')}`);
    }
    if (d.plan?.entry) lines.push(`- **入る条件**: ${d.plan.entry}`);
    if (d.plan?.invalidation) lines.push(`- **撤回条件**: ${d.plan.invalidation}`);
    if (d.plan?.stopLoss) lines.push(`- **損切り**: ${d.plan.stopLoss}`);
    for (const kind of ['priority', 'select', 'caution'] as const) {
      const sectors = (d.sectorStances ?? []).filter((s) => s.stance === kind).map((s) => s.sector);
      if (sectors.length) lines.push(`- **セクター（${SECTOR_LABELS[kind]}）**: ${sectors.join('、')}`);
    }
  }
  if (d.levels?.length) {
    lines.push('', `${h} 日経の節目`, '', ...d.levels.map((l) => `- ${formatNumber(l.price, l.price % 1 === 0 ? 0 : 2)}：${l.label}`));
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 構造化データ（today-market.json）
// ---------------------------------------------------------------------------

function renderStructured(t: TodayAnalysis, h: string): string[] {
  const d = t.today;
  const lines: string[] = [
    `> **スタンス: ${d.stance}** — ${d.headline}`,
    '',
    ...(t.open.basis === 'actual' ? [`- 実際の寄り: ${t.open.label}（${formatPct(t.open.gapPct, 2)}）`] : []),
    d.expectedOpen.unconfirmed
      ? `- 想定寄り: 未確認${d.expectedOpen.note ? ` — ${d.expectedOpen.note}` : ''}`
      : `- 想定寄り: ${d.expectedOpen.label}（${formatPct(d.expectedOpen.gapPct)}）${d.expectedOpen.note ? ` — ${d.expectedOpen.note}` : ''}`,
    `- サイズ目安: ${d.positionSize.label}${d.positionSize.reason ? ` — ${d.positionSize.reason}` : ''}`,
    `- スイング: ${t.swingRole.label}`,
  ];
  if (t.vi) lines.push(`- ${t.vi.label}: ${t.vi.value.toFixed(2)}（${t.vi.source === 'today' ? '当日' : '前日終値'}）`);
  if (d.checkedAt) lines.push(`- 情報確認: ${d.checkedAt}`);
  const { important, other } = t.unconfirmed;
  if (important.length || other.length) {
    lines.push(`- 未確認: ${important.length ? important.join('、') : 'なし'}（一次情報で確認）${other.length ? `。ほかに参考の未確認${other.length}件` : ''}`);
  }
  for (const n of t.notices) lines.push(`- 注意: ${n}`);

  lines.push(...renderPlan(t, h));

  if (d.externalQuotes.length > 0) {
    lines.push('', `${h} 外部指標`, '', '| 指標 | 値 | 前日比 |', '|---|---:|---:|', ...d.externalQuotes.map(quoteRow));
  }

  if (d.scenarios.length > 0) {
    lines.push('', `${h} 寄り付きシナリオ`, '', '| シナリオ | 条件 | 動き方 | リスク |', '|---|---|---|---|');
    for (const s of d.scenarios) {
      const mark = s.id === t.likelyScenarioId ? '（想定）' : '';
      lines.push(`| ${cell(s.label)}${mark} | ${cell(s.condition)} | ${cell(s.action)} | ${cell(s.risk ?? '')} |`);
    }
  }

  lines.push('', `${h} 今日のイベント`, '');
  if (t.events.length === 0) {
    lines.push('登録されたイベントはありません。');
  } else {
    lines.push('| 時刻 | イベント | 重要度 | メモ |', '|---|---|---|---|');
    for (const e of t.events) {
      const when = `${e.date && e.date !== d.asOf ? `${formatDateJa(e.date)} ` : ''}${e.time ?? '—'}`;
      lines.push(`| ${when} | ${cell(e.label)} | ${IMPORTANCE_STARS[e.importance]} | ${cell(e.note ?? '')} |`);
    }
  }

  if (d.domesticNotes.length > 0) {
    lines.push('', `${h} 国内材料・ニュースメモ`, '', ...d.domesticNotes.map((n) => `- ${n}`));
  }

  if (t.watchlist.length > 0) {
    lines.push(
      '',
      `${h} 今日の監視銘柄`,
      '',
      '| コード | 銘柄 | 今日の扱い | 理由 | 注意点 |',
      '|---|---|---|---|---|',
      ...t.watchlist.map(
        (w) =>
          `| ${w.candidate.code} | ${cell(w.candidate.name)} | ${WATCH_ACTION_LABELS[w.action]} | ${cell(w.reason)} | ${cell(w.cautions.join(' ／ '))} |`,
      ),
    );
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 市況メモ（貼り付け Markdown）
// ---------------------------------------------------------------------------

export function renderMemoSummary(memo: ParsedMarketMemo, h: string): string[] {
  const origin = memo.source === 'pasted' ? '貼り付けた市況メモ' : 'today-market.json の市況メモ';
  const lines = [`${h} 市況メモの要点`, '', `_${origin}から自動抽出${memo.savedAt ? `（保存 ${formatDateTime(memo.savedAt)}）` : ''}_`, ''];

  if (memo.needsReview) {
    const terms = [...new Set(memo.reviewHits.map((r) => r.term))].map((t) => `「${t}」`).join('');
    lines.push(
      `> ⚠ **要確認**：原文に${terms}などの記載があります（${memo.reviewHits.length}箇所）。数値・日程は一次情報で確認してください。`,
      '',
    );
  }
  if (memo.headline) lines.push(`**${memo.headline}**`, '');

  if (memo.sections.length > 0) {
    for (const s of memo.sections) if (s.summary) lines.push(`- **${s.heading}**: ${s.summary}`);
    lines.push('');
  }
  for (const t of memo.tables) {
    if (t.section) lines.push(`（${t.section}）`, '');
    lines.push(t.markdown, '');
  }
  // 見出しも表も取れないメモは原文の冒頭を要約として載せる
  if (memo.sparse && memo.excerpt) lines.push(`原文の要約: ${memo.excerpt}`, '');

  if (memo.sources.length > 0) {
    lines.push('参照元:', ...memo.sources.map((s) => `- [${s.label.replace(/[[\]]/g, '')}](${s.url})`), '');
  }
  return lines.slice(0, lines[lines.length - 1] === '' ? -1 : undefined);
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export interface TodaySectionInput {
  today: TodayAnalysis | null;
  /** 未指定なら today.memo を使う */
  memo?: ParsedMarketMemo | null;
}

/**
 * 週次レポートに差し込む「今日の市況」セクション（## 見出し付き）。
 * 構造化データもメモも無い場合は、その旨の1行だけを返す。
 */
export function renderTodaySection({ today, memo = today?.memo ?? null }: TodaySectionInput): string {
  const d = today?.today;
  const when = d ? `${formatDateJa(d.asOf)} ${d.session}・${formatDateTime(d.meta.generatedAt)}時点` : '';
  const lines = [`## 今日の市況${when ? `（${when}）` : ''}`, ''];

  if (!today && !memo) {
    lines.push('今日の市況データ（data/today-market.json）と市況メモがありません。');
    return lines.join('\n');
  }
  if (d?.meta.isSample) lines.push('> ⚠ 今日の市況はサンプルデータです（数値・ニュースは架空）。', '');
  if (today) lines.push(...renderStructured(today, '###'));
  else lines.push('今日の市況データ（data/today-market.json）は読み込めていません。市況メモのみ掲載します。');
  if (memo) lines.push('', ...renderMemoSummary(memo, '###'));
  return lines.join('\n');
}

/** Today 単体のレポート */
export function generateTodayReport(input: TodaySectionInput, disclaimer: string): string {
  const d = input.today?.today;
  const title = d ? `# 今日の市況（${formatDateJa(d.asOf)}）` : '# 今日の市況';
  const body = renderTodaySection(input).replace(/^## 今日の市況.*\n\n/, '');
  return `${title}\n\n${body}\n\n---\n\n※${disclaimer}\n`;
}
