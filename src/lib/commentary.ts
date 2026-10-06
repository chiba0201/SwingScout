/**
 * 指標からコメント文を組み立てる（ルールベース）。
 * CLI のパイプラインで、手書きコメントが無い項目に使う。
 * 文体を変えたい場合はこのファイルだけを触ればよい。
 */
import type { Candidate, CandidateComments } from '../types/dataset';
import { formatDateJa } from './calendar';
import { formatLevel, formatNumber, formatOku, formatPct } from './format';
import type { DerivedMetrics } from './metrics';

type CommentSource = Pick<
  Candidate,
  'price' | 'volume' | 'margin' | 'technical' | 'earnings' | 'catalysts'
>;

const TIMING = { 'pre-market': '寄り前', intraday: '場中', 'after-close': '引け後', unknown: '' } as const;

export function supplyDemandComment(c: CommentSource, m: DerivedMetrics): string {
  const parts: string[] = [];
  const vr = m.volumeRatio20d;
  const v5 = m.volumeRatio5d;
  if (vr !== null) {
    if (vr >= 1.5) {
      parts.push(`出来高は20日平均の${vr.toFixed(1)}倍${v5 !== null && v5 >= 1.2 ? `（5日平均でも${v5.toFixed(1)}倍）` : ''}と商いを伴う。`);
    } else if (vr < 0.8) {
      parts.push(`出来高は20日平均の${vr.toFixed(1)}倍と細り、資金流入は限定的。`);
    } else {
      parts.push(`出来高は20日平均並み（${vr.toFixed(1)}倍）。`);
    }
  }

  if (!c.margin || m.marginRatio === null) {
    parts.push('信用残は取得できていない。');
  } else {
    const r = m.marginRatio;
    const ratioText = r < 1 ? `信用倍率${r.toFixed(2)}倍の売り長` : `信用倍率${r.toFixed(1)}倍`;
    const buy = m.buyChangePct ?? 0;
    const sell = m.sellChangePct ?? 0;
    const buyTrend =
      buy <= -5 ? '整理が進む' : buy < -2 ? 'やや減少' : buy >= 10 ? '積み上がった' : buy > 2 ? 'やや増加' : '横ばい';
    const buyText = `買残は前週比${formatPct(buy, 0)}と${buyTrend}。`;
    const sellText =
      sell >= 10
        ? `売残は${formatPct(sell, 0)}と増え、踏み上げ余地あり。`
        : sell <= -10
          ? `売残は${formatPct(sell, 0)}と買い戻しが進んだ。`
          : '';
    parts.push(`${ratioText}。${buyText}${sellText}`);
    if (m.marginDays !== null && m.marginDays >= 8) {
      parts.push(`買残は出来高${m.marginDays.toFixed(0)}日分と重く、戻り売りに注意。`);
    }
  }

  parts.push(
    c.volume.turnoverOku < 2
      ? `売買代金${formatOku(c.volume.turnoverOku)}と薄く、成行・逆指値の滑りに注意。`
      : `売買代金${formatOku(c.volume.turnoverOku)}。`,
  );
  return parts.join('');
}

export function technicalComment(c: CommentSource, m: DerivedMetrics): string {
  const { ma5, ma25, rsi14, atr14 } = c.technical;
  const parts: string[] = [];

  if (m.maAlignment === 'bullish') {
    parts.push(`5日線（${formatLevel(ma5)}）＞25日線（${formatLevel(ma25)}）の上昇配列で、終値は両線の上。`);
  } else if (m.maAlignment === 'bearish') {
    parts.push(`5日線（${formatLevel(ma5)}）・25日線（${formatLevel(ma25)}）とも上値にあり、戻り待ちの形。`);
  } else if ((m.maDeviation25 ?? 0) > 0) {
    parts.push(`25日線（${formatLevel(ma25)}）の上は維持しつつ、5日線（${formatLevel(ma5)}）近辺で短期調整中。`);
  } else {
    parts.push(`25日線（${formatLevel(ma25)}）を下回り、トレンドは未確認。`);
  }

  if (m.isNewHigh52w) parts.push('52週高値を更新。');
  else if (m.isNewHigh20d) parts.push(`直近20日高値（${formatLevel(c.price.high20d)}）を終値で上抜け。`);
  else if (m.distanceToHigh20dPct !== null) parts.push(`20日高値まで${formatPct(-m.distanceToHigh20dPct)}。`);

  const dev = m.maDeviation25;
  if (dev !== null) parts.push(`25日線乖離${formatPct(dev)}${dev >= 12 ? 'とやや過熱' : ''}。`);
  if (rsi14 !== undefined) parts.push(`RSI ${rsi14.toFixed(0)}。`);
  parts.push(`ATR ${formatNumber(atr14, atr14 < 100 ? 1 : 0)}円（${(m.atrPct ?? 0).toFixed(1)}%）。`);
  return parts.join('');
}

export function fundamentalComment(c: CommentSource, m: DerivedMetrics, note?: string): string {
  const parts: string[] = [];
  if (note) parts.push(note.endsWith('。') ? note : `${note}。`);

  const e = c.earnings;
  if (e.nextDate) {
    const when = `${formatDateJa(e.nextDate)}${TIMING[e.timing ?? 'unknown']}`;
    const where =
      m.earningsTiming === 'in-window'
        ? '保有期間中＝決算またぎ'
        : m.earningsTiming === 'exit-day'
          ? 'OUT日当日'
          : m.earningsTiming === 'after-window-near'
            ? '保有期間の直後'
            : '保有期間外';
    parts.push(`次回決算${e.period ? `（${e.period}）` : ''}は${when}予定（${where}）。`);
  } else {
    parts.push('次回決算日は未発表。');
  }
  if (e.progressRate !== undefined) parts.push(`通期計画に対する進捗率${e.progressRate.toFixed(0)}%。`);

  const cats = c.catalysts ?? [];
  if (cats.length > 0) {
    const mark = { positive: '＋', negative: '－', neutral: '・' } as const;
    parts.push(`材料: ${cats.map((x) => `${mark[x.impact]}${x.label}`).join(' ')}`);
  }
  return parts.join('');
}

export function buildComments(
  c: CommentSource,
  m: DerivedMetrics,
  fundamentalNote?: string,
): CandidateComments {
  return {
    supplyDemand: supplyDemandComment(c, m),
    technical: technicalComment(c, m),
    fundamental: fundamentalComment(c, m, fundamentalNote),
  };
}
