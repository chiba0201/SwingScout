/**
 * 市況メモ（ChatGPT 等で作った Markdown）の軽量パーサー。
 *
 * 外部通信・AI API は使わず、行単位の正規表現だけで「拾える範囲」を拾う。
 * 抽出できなくても原文（raw）は必ず保持し、画面やレポートでは原文も確認できるようにする。
 *
 *   headline     … 冒頭の太字文、なければ最初の本文
 *   sections     … ## / ### / #### 見出しごとの本文
 *   tables       … Markdown テーブル
 *   sources      … Markdown リンク（と裸の URL）
 *   needsReview  … 「未確認」「確認が必要」「取得できない」などの語があれば true
 */

export interface MemoSection {
  heading: string;
  /** 見出しレベル（2〜4） */
  level: number;
  /** 見出し配下の Markdown 原文（テーブル含む） */
  body: string;
  /** 箇条書きの項目（プレーンテキスト） */
  bullets: string[];
  /** 一覧表示用の短い要約（箇条書き先頭 or 最初の文） */
  summary: string;
}

export interface MemoTable {
  /** テーブルが属する見出し（見出しより前なら null） */
  section: string | null;
  headers: string[];
  rows: string[][];
  /** 原文の Markdown（レポートにそのまま差し込む用） */
  markdown: string;
}

export interface MemoSource {
  label: string;
  url: string;
}

export interface ReviewHit {
  term: string;
  /** 該当した行（プレーンテキスト、長い場合は省略） */
  line: string;
}

export interface ParsedMarketMemo {
  raw: string;
  /** 'pasted': 画面で貼り付け（ブラウザ保存） / 'json': today-market.json の memoMarkdown */
  source: 'pasted' | 'json';
  savedAt?: string;
  /** 最初の # 見出し */
  title: string | null;
  headline: string | null;
  sections: MemoSection[];
  tables: MemoTable[];
  sources: MemoSource[];
  needsReview: boolean;
  reviewHits: ReviewHit[];
  /** 見出しもテーブルも取れなかった（原文の要約を併記すべき） */
  sparse: boolean;
  /** 原文先頭のプレーンテキスト（約300字） */
  excerpt: string;
}

/** 要確認とみなす語（活用形も拾うため正規表現）。運用しながら足す */
export const REVIEW_PATTERN =
  /未確認|要確認|確認が必要|確認(?:でき|出来)(?:な|ず|ませ|てい(?:な|ませ))|取得(?:でき|出来)(?:な|ず|ませ|てい(?:な|ませ))|未取得|不明|データなし|情報なし/;

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const QUOTE = /^\s*>\s?/;

/** インラインの Markdown 記法を外してプレーンテキストにする */
export function stripInline(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => stripInline(cell.replace(/\\\|/g, '|')));
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function firstSentences(text: string, count: number, max: number): string {
  const parts = text.match(/[^。！？!?]+[。！？!?]?/g) ?? [];
  return clip(parts.slice(0, count).join('').trim(), max);
}

/** 「**結論**：〜」のような短いラベル付き太字は、ラベルの後ろを見出しにする */
function headlineFromLine(line: string): string | null {
  const content = line.replace(QUOTE, '').replace(LIST_ITEM, '$1').trim();
  const bold = content.match(/^(?:\*\*|__)(.+?)(?:\*\*|__)\s*[:：]?\s*(.*)$/);
  if (!bold) return null;
  const [, strong = '', rest = ''] = bold;
  if (strong.replace(/[:：]$/, '').length <= 8 && rest.trim()) return stripInline(rest);
  return stripInline(strong.replace(/[:：]$/, ''));
}

function extractSources(text: string): MemoSource[] {
  const seen = new Map<string, MemoSource>();
  for (const m of text.matchAll(/(?<!!)\[([^\]]+)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const url = m[2]!;
    if (!seen.has(url)) seen.set(url, { label: stripInline(m[1]!), url });
  }
  // リンク記法になっていない裸の URL
  const withoutLinks = text.replace(/!?\[[^\]]*\]\([^)]*\)/g, '');
  for (const m of withoutLinks.matchAll(/https?:\/\/[^\s<>)\]）」』、。]+/g)) {
    const url = m[0];
    if (!seen.has(url)) seen.set(url, { label: url, url });
  }
  return [...seen.values()];
}

export function parseMarketMemo(
  raw: string,
  origin: { source: ParsedMarketMemo['source']; savedAt?: string } = { source: 'pasted' },
): ParsedMarketMemo {
  const text = raw.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');

  let title: string | null = null;
  const sections: MemoSection[] = [];
  const tables: MemoTable[] = [];
  const preamble: string[] = [];
  const contentLines: string[] = []; // 見出し・表・区切り以外の本文行（headline 用）
  let current: { heading: string; level: number; lines: string[] } | null = null;
  let inFence = false;

  const flush = () => {
    if (!current) return;
    const body = current.lines.join('\n').trim();
    const bullets = current.lines
      .filter((l) => !TABLE_ROW.test(l))
      .map((l) => l.match(LIST_ITEM)?.[1])
      .filter((b): b is string => Boolean(b))
      .map(stripInline)
      .filter(Boolean);
    const prose = stripInline(
      current.lines.filter((l) => !TABLE_ROW.test(l) && !LIST_ITEM.test(l) && !HR.test(l)).join(' '),
    );
    sections.push({
      heading: current.heading,
      level: current.level,
      body,
      bullets,
      summary: bullets.length > 0 ? clip(bullets.slice(0, 3).join(' / '), 160) : firstSentences(prose, 2, 160),
    });
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (FENCE.test(line)) inFence = !inFence;

    const heading = !inFence ? line.match(HEADING) : null;
    if (heading) {
      const level = heading[1]!.length;
      const label = stripInline(heading[2]!);
      if (level === 1 && title === null && sections.length === 0 && !current) {
        title = label;
        continue;
      }
      flush();
      current = { heading: label, level: Math.max(2, Math.min(level, 4)), lines: [] };
      continue;
    }

    // テーブル：ヘッダー行の次が区切り行
    if (!inFence && TABLE_ROW.test(line) && TABLE_SEPARATOR.test(lines[i + 1] ?? '')) {
      const block = [line, lines[i + 1]!];
      let j = i + 2;
      while (j < lines.length && TABLE_ROW.test(lines[j]!)) block.push(lines[j++]!);
      tables.push({
        section: current?.heading ?? null,
        headers: splitRow(line),
        rows: block.slice(2).map(splitRow),
        markdown: block.join('\n'),
      });
      (current?.lines ?? preamble).push(...block);
      i = j - 1;
      continue;
    }

    (current?.lines ?? preamble).push(line);
    if (!inFence && line.trim() && !HR.test(line) && !FENCE.test(line)) contentLines.push(line);
  }
  flush();

  // headline：冒頭6行以内の太字文 → なければ最初の本文
  let headline: string | null = null;
  for (const line of contentLines.slice(0, 6)) {
    headline = headlineFromLine(line);
    if (headline) break;
  }
  if (!headline && contentLines[0]) {
    headline = clip(stripInline(contentLines[0].replace(QUOTE, '').replace(LIST_ITEM, '$1')), 140) || null;
  }

  // 要確認の語
  const reviewHits: ReviewHit[] = [];
  for (const line of lines) {
    const plain = stripInline(line.replace(QUOTE, '').replace(LIST_ITEM, '$1').replace(/^#+\s*/, '').replace(/\|/g, ' '));
    const matched = plain.match(REVIEW_PATTERN)?.[0];
    // 活用形の揺れ（「取得できていな」等）は表示用にまとめる
    const term = matched?.replace(/^(取得|確認)(?:でき|出来).*$/, '$1できない');
    if (term && !reviewHits.some((h) => h.line === clip(plain, 100))) reviewHits.push({ term, line: clip(plain, 100) });
  }

  const plainAll = stripInline(
    lines
      .filter((l) => !TABLE_ROW.test(l) && !HR.test(l) && !FENCE.test(l))
      .map((l) => l.replace(/^#+\s*/, '').replace(QUOTE, '').replace(LIST_ITEM, '$1'))
      .join(' '),
  );

  return {
    raw: text,
    source: origin.source,
    savedAt: origin.savedAt,
    title,
    headline,
    sections,
    tables,
    sources: extractSources(text),
    needsReview: reviewHits.length > 0,
    reviewHits,
    sparse: sections.length === 0 && tables.length === 0,
    excerpt: clip(plainAll, 300),
  };
}
