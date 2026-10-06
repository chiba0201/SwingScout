/**
 * SNS投稿モード（X / Threads 向けのプレーンテキスト）。
 *
 * 詳細レポート（reportGenerator.ts）とは別に、上位銘柄を1位〜N位で短く紹介し、
 * 運用上の注意を最後に話し言葉でまとめる。文言はこのファイルに集約してあるので、
 * 手元の投稿サンプルに合わせて調整するときはここだけ触ればよい。
 */
import type { AnalyzedCandidate, DatasetAnalysis } from './analysis';
import { formatDateJa, toTime, weekdayJa } from './calendar';
import { formatPrice } from './format';
import { viRegime } from './market';
import { findQuote } from './scoring';
import { classifySetup, type SetupType } from './tradePlan';

export interface SnsPostOptions {
  /** 未指定なら「今週の作戦｜火曜In金曜out」 */
  title?: string;
  /** 損切り・利確の価格を入れる */
  includeLevels: boolean;
  emoji: boolean;
  /** 末尾のハッシュタグ。空なら付けない */
  hashtags: string;
  /** single: 1つの長文投稿 / thread: X の文字数上限に合わせて分割 */
  layout: 'single' | 'thread';
}

export const DEFAULT_SNS_OPTIONS: SnsPostOptions = {
  includeLevels: true,
  emoji: true,
  hashtags: '#日本株 #スイングトレード',
  layout: 'single',
};

/** スレッド分割時の区切り行（テキストエリア上で投稿の境目になる） */
export const THREAD_SEPARATOR = '-----';
const SEPARATOR_PATTERN = /\n-{5,}\n/;

/** X の上限（重み付き文字数。全角は2、半角は1として数える） */
export const X_WEIGHTED_LIMIT = 280;

// ---------------------------------------------------------------------------
// 文字数
// ---------------------------------------------------------------------------

/**
 * X の重み付き文字数の目安（twitter-text の範囲定義に準拠。URL短縮・絵文字の合字は簡略化）。
 */
export function countXWeight(text: string): number {
  let weight = 0;
  for (const ch of text.replace(/[︀-️]/g, '')) {
    const cp = ch.codePointAt(0) ?? 0;
    const light =
      cp <= 0x10ff || (cp >= 0x2000 && cp <= 0x200d) || (cp >= 0x2010 && cp <= 0x201f) || (cp >= 0x2032 && cp <= 0x2037);
    weight += light ? 1 : 2;
  }
  return weight;
}

export function splitThread(text: string): string[] {
  return text
    .split(SEPARATOR_PATTERN)
    .map((p) => p.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// 文言パーツ
// ---------------------------------------------------------------------------

interface Icons {
  title: string;
  memo: string;
  warn: string;
  thanks: string;
}
const ICONS_ON: Icons = { title: '📝', memo: '📌', warn: '⚠️', thanks: '🙏' };
const ICONS_OFF: Icons = { title: '', memo: '', warn: '※', thanks: '' };

/**
 * 同じ言い回しが続くと定型文っぽくなるので、使うたびに次の候補へ回す。
 * 1回の生成ごとに new するので、出力は決定的（同じ入力なら同じ文）。
 */
class Variety {
  private used = new Map<string, number>();
  pick(key: string, variants: readonly string[]): string {
    const n = this.used.get(key) ?? 0;
    this.used.set(key, n + 1);
    return variants[n % variants.length]!;
  }
}

const ACTION: Record<SetupType, readonly string[]> = {
  breakout: ['寄り後の押しを拾いたい', '寄りは様子見、押したところで', 'ブレイク水準を割らなければ押し目で'],
  pullback: ['25日線あたりまで引きつけて拾う', '下ヒゲを確認してから入りたい'],
  'post-surge': ['初日は追わず、押してきたら', '利食いが一巡するまで待ちたい'],
  trend: ['前日終値近辺で打診、5日線で買い増し', '5日線タッチで拾っていく'],
  rebound: ['反発を確認してから小さく', '戻りを確認してから少しだけ'],
};

const TIMING = { 'pre-market': '寄り前', intraday: '場中', 'after-close': '引け後', unknown: '' } as const;

const sentence = (s: string) => (/[。！？!?]$/.test(s) ? s : `${s}。`);

function setupPhrase(c: AnalyzedCandidate, setup: SetupType): string {
  const m = c.metrics;
  const vr = (m.volumeRatio20d ?? 1).toFixed(1);
  switch (setup) {
    case 'breakout':
      return m.isNewHigh52w ? `出来高${vr}倍で52週高値を更新` : `出来高${vr}倍で20日高値をブレイク`;
    case 'post-surge':
      return `前日+${c.price.changePct.toFixed(1)}%の急伸（出来高${vr}倍）`;
    case 'pullback':
      return '上昇トレンド中の押し目で、25日線付近まで調整';
    case 'trend':
      return m.isNewHigh20d ? '上昇トレンドが続き、20日高値も更新' : '5日線＞25日線の上昇トレンドが継続';
    case 'rebound':
      return '下げ一服からの反発狙い';
  }
}

/** 需給 → 材料 → 為替の順で、効いているポイントを1つ選ぶ */
function supportPhrase(c: AnalyzedCandidate, a: DatasetAnalysis, v: Variety): string | null {
  const m = c.metrics;
  if (m.marginRatio !== null && m.marginRatio < 1) return `信用倍率${m.marginRatio.toFixed(2)}倍の売り長で、踏み上げ余地あり`;
  if ((m.sellChangePct ?? 0) >= 15) {
    return v.pick('sell-up', ['売残が増えていて、踏み上げ余地あり', '売り方の買い戻しも期待できる形', '売残増で需給は悪くない']);
  }
  if ((m.buyChangePct ?? 0) <= -8) return v.pick('buy-down', ['買残の整理が進んでいて上値は軽め', '買残が減って需給は軽くなってきた']);
  if ((m.marginRatio ?? 0) >= 8 || (m.marginDays ?? 0) >= 8) return 'ただ買残が重く、戻り売りには注意';
  const positive = c.catalysts?.find((x) => x.impact === 'positive');
  if (positive) return `材料は「${positive.label}」`;
  const usdjpy = findQuote(a.dataset.marketContext, 'usdjpy');
  if ((c.sensitivity?.usdJpy ?? 0) >= 0.5 && (usdjpy?.weekChangePct ?? 0) >= 0.5) return '円安も追い風';
  if ((m.volumeRatio20d ?? 1) < 0.8) return '商いは細めなので板の薄さに注意';
  return null;
}

function pickBlock(c: AnalyzedCandidate, a: DatasetAnalysis, o: SnsPostOptions, icons: Icons, v: Variety): string {
  const setup = classifySetup(c, c.metrics);
  const support = supportPhrase(c, a, v);
  const lines = [
    `${c.rank}位｜${c.name}(${c.code})`,
    `${sentence(setupPhrase(c, setup))}${support ? sentence(support) : ''}`,
    `→ ${v.pick(setup, ACTION[setup])}`,
  ];
  if (o.includeLevels) {
    const tp = c.takeProfit.targets.map((t) => formatPrice(t.price)).join('→');
    lines.push(`損切り${formatPrice(c.stopLoss.price)}／利確${tp}`);
  }
  const warnings = c.warnings.filter((w) => w.severity !== 'low').map((w) => w.label);
  if (warnings.length > 0) lines.push(`${icons.warn}${warnings.join('・')}`);
  return lines.join('\n');
}

function headerBlock(a: DatasetAnalysis, o: SnsPostOptions, icons: Icons): string {
  const w = a.window;
  const title = o.title?.trim() || `今週の作戦｜${w.pattern.label}`;
  const lines = [`${icons.title}【${title}】`, `${formatDateJa(w.entryDate)}寄り → ${formatDateJa(w.exitDate)}大引けまで`];
  if (a.dataset.meta.isSample) lines.push('※架空の銘柄・数値を使ったサンプルです（実在銘柄ではありません）');
  return lines.join('\n');
}

const STANCE_CASUAL = { bullish: '強気', neutral: '中立', bearish: '弱気' } as const;

function marketBlock(a: DatasetAnalysis): string {
  const mc = a.dataset.marketContext;
  const parts = [`地合いは「${STANCE_CASUAL[mc.stance]}」。`, sentence(mc.headline)];
  const vi = findQuote(mc, 'nikkeiVI');
  if (vi) {
    const v = vi.value.toFixed(1);
    const r = viRegime(vi.value);
    const name = mc.headline.includes('VI') ? 'VI' : '日経VI'; // 見出しで既に触れていれば短く
    const sizing: Record<typeof r.level, string> = {
      calm: `${name}は${v}と落ち着いているので、サイズは通常どおりで。`,
      normal: `${name}は${v}と平常運転なので、サイズは通常どおりで。`,
      caution: `${name}は${v}とやや高めなので、サイズは普段の${Math.round(r.sizeFactor * 10)}割くらいに抑えめで。`,
      alert: `${name}が${v}まで上がっているので、サイズは半分・銘柄数も絞り気味で。`,
      panic: `${name}が${v}とかなり高いので、新規は最小サイズか見送りも考えたいところ。`,
    };
    parts.push(sizing[r.level]);
  }
  return parts.join('');
}

/** 運用上の注意を話し言葉の文の並びにする */
export function operationSentences(a: DatasetAnalysis, o: SnsPostOptions): string[] {
  const { window: w, top } = a;
  const nameOf = (code: string) => top.find((c) => c.code === code)?.name ?? code;
  const out: string[] = [];

  for (const g of a.concentration) {
    const subject = g.kind === 'sector' ? g.key : `「${g.key}」テーマ`;
    out.push(
      `${subject}が${g.codes.length}銘柄（${g.codes.map(nameOf).join('・')}）かぶっているので、同時に持つなら合わせて1.5銘柄分くらいまでに。`,
    );
  }

  for (const c of top) {
    const date = c.earnings.nextDate ? `${formatDateJa(c.earnings.nextDate)}${TIMING[c.earnings.timing ?? 'unknown']}` : '期間中';
    if (c.metrics.earningsTiming === 'in-window') {
      out.push(`${c.name}は${date}に決算があるので、またぐならサイズは小さめで。避けるなら前日までに降りておく。`);
    } else if (c.metrics.earningsTiming === 'exit-day') {
      out.push(`${c.name}はOUT日に決算なので、発表前に必ず手仕舞い。`);
    }
  }

  const surged = top.filter((c) => c.warnings.some((x) => x.id === 'post-surge')).map((c) => c.name);
  if (surged.length > 0) out.push(`${surged.join('・')}は急騰の翌日なので、寄りで飛びつかず押しを待ちたいところ。`);

  out.push('寄りで大きくGUしたら無理に追いかけず、押してきたところを拾うくらいの気持ちで。');

  const weekStart = toTime(w.weekDays[0] ?? w.entryDate);
  const macro = a.events.filter(
    (e) =>
      (e.category === 'us-macro' || e.category === 'central-bank') &&
      e.importance === 'high' &&
      toTime(e.date) >= weekStart &&
      toTime(e.date) <= toTime(w.exitDate),
  );
  if (macro.length > 0) {
    const list = macro.map((e) => `${formatDateJa(e.date)}${e.time ? ` ${e.time}` : ''}の${e.label}`).join('や');
    out.push(`${list}も控えているので、その前日は持ち高を軽めに。`);
  }

  const sqOnExit = a.events.find((e) => e.category === 'sq' && e.date === w.exitDate);
  if (sqOnExit) {
    out.push(`${weekdayJa(w.exitDate)}曜は${sqOnExit.label}で寄りが荒れやすいので、決済は指値で落ち着いて。`);
  }
  if (w.closedDaysAfterExit > 2) {
    out.push(`翌週は${w.closedDaysAfterExit}連休明けなので、${weekdayJa(w.exitDate)}曜のうちに全部手仕舞って持ち越さない方針で。`);
  }

  out.push(`損切りの逆指値は入ったらすぐ置いておく。${top.length}銘柄全部に入る必要はなく、条件が合ったものだけで十分。`);
  if (!o.includeLevels) out.push('具体的な損切り・利確ラインは各自の資金量に合わせて。');
  return out;
}

function disclaimer(icons: Icons): string {
  return `※個人的な分析メモで、特定の銘柄の売買をおすすめするものではありません。最終判断はご自身でお願いします${icons.thanks}`;
}

// ---------------------------------------------------------------------------
// 組み立て
// ---------------------------------------------------------------------------

/** 文を上限内に収まるよう投稿単位に詰める */
function pack(sentences: string[], firstPrefix: string, limit: number): string[] {
  const posts: string[] = [];
  let current = firstPrefix;
  for (const s of sentences) {
    const next = current + s;
    if (current && countXWeight(next) > limit) {
      posts.push(current.trim());
      current = s;
    } else {
      current = next;
    }
  }
  if (current.trim()) posts.push(current.trim());
  return posts;
}

export function generateSnsPost(analysis: DatasetAnalysis, options: SnsPostOptions = DEFAULT_SNS_OPTIONS): string {
  const icons = options.emoji ? ICONS_ON : ICONS_OFF;
  const header = headerBlock(analysis, options, icons);
  const market = marketBlock(analysis);
  const variety = new Variety();
  const picks = analysis.top.map((c) => pickBlock(c, analysis, options, icons, variety));
  const ops = operationSentences(analysis, options);
  const memoTitle = `${icons.memo}${options.emoji ? '運用メモ' : '【運用メモ】'}`;
  const tags = options.hashtags.trim();

  if (options.layout === 'single') {
    return [header, market, ...picks, `${memoTitle}\n${ops.join('')}`, disclaimer(icons), ...(tags ? [tags] : [])]
      .join('\n\n')
      .concat('\n');
  }

  // スレッド：見出し＋地合い → 1銘柄ずつ → 運用メモ（上限で分割）→ 注意書き・タグ
  const reserve = 8; // 末尾の「(10/10)」の分
  const limit = X_WEIGHTED_LIMIT - reserve;
  const note = '※個人の分析メモです（売買のおすすめではありません）';
  const opening = `${header}\n\n${market}\n${note}`;
  // 見出し＋地合いが長ければ2投稿に分ける（注意書きは必ず1投稿目に残す）
  const openingPosts = countXWeight(opening) <= limit ? [opening] : [`${header}\n${note}`, market];
  const posts = [...openingPosts, ...picks, ...pack(ops, `${memoTitle}\n`, limit)];
  const closing = [disclaimer(icons), tags].filter(Boolean).join('\n\n');
  const last = posts[posts.length - 1]!;
  if (countXWeight(`${last}\n\n${closing}`) <= limit) posts[posts.length - 1] = `${last}\n\n${closing}`;
  else posts.push(closing);

  const total = posts.length;
  return `${posts.map((p, i) => `${p}\n(${i + 1}/${total})`).join(`\n${THREAD_SEPARATOR}\n`)}\n`;
}
