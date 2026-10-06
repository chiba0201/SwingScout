/**
 * ChatGPT 等で作った市況メモ Markdown から data/today-market.json を作る。
 *
 * 使い方:
 *   npm run today:from-memo -- --memo raw-data/today.md --as-of 2026-10-06
 */
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { parseMarketMemo } from '../src/lib/marketMemo';
import type { Importance, MarketEventCategory, Quote, QuotePolarity } from '../src/types/dataset';
import { TODAY_SCHEMA_VERSION, type TodayEvent, type TodayMarket } from '../src/types/today';

interface QuoteSpec {
  id: string;
  label: string;
  patterns: RegExp[];
  polarity: QuotePolarity;
  decimals?: number;
  unit?: string;
}

const SPECS: QuoteSpec[] = [
  { id: 'dow', label: 'NYダウ', patterns: [/NYダウ/i, /ダウ/i], polarity: 'up-good', decimals: 1 },
  { id: 'nasdaq', label: 'NASDAQ', patterns: [/NASDAQ/i, /ナスダック/i], polarity: 'up-good', decimals: 1 },
  { id: 'sp500', label: 'S&P500', patterns: [/S&P\s*500/i, /SP500/i], polarity: 'up-good', decimals: 1 },
  { id: 'sox', label: 'SOX指数', patterns: [/SOX/i, /フィラデルフィア半導体/i], polarity: 'up-good', decimals: 1 },
  { id: 'vix', label: 'VIX', patterns: [/VIX/i], polarity: 'up-bad', decimals: 2 },
  { id: 'nikkeiFuture', label: '日経先物', patterns: [/CME日経先物/i, /日経先物/i, /日経平均先物/i], polarity: 'up-good', decimals: 0 },
  { id: 'usdjpy', label: 'ドル円', patterns: [/ドル円/i, /USD\/?JPY/i], polarity: 'neutral', decimals: 2, unit: '円' },
  { id: 'us10y', label: '米10年債', patterns: [/米10年債/i, /米長期金利/i, /10年債/i], polarity: 'neutral', decimals: 2, unit: '%' },
];

const toNum = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = Number(s.replace(/[,+％%円]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const strip = (s: string) => s.replace(/\*\*/g, '').replace(/`/g, '').trim();

function specFor(label: string): QuoteSpec | null {
  return SPECS.find((s) => s.patterns.some((p) => p.test(label))) ?? null;
}

function quoteFromParts(spec: QuoteSpec, valueText: string | undefined, pctText: string | undefined): Quote | null {
  const value = toNum(valueText);
  const changePct = toNum(pctText);
  if (value === null && changePct === null) return null;
  return {
    id: spec.id,
    label: spec.label,
    value: value ?? 0,
    change: 0,
    changePct: changePct ?? 0,
    decimals: spec.decimals,
    unit: spec.unit,
    polarity: spec.polarity,
  };
}

function extractQuotes(raw: string): Quote[] {
  const found = new Map<string, Quote>();
  const memo = parseMarketMemo(raw, { source: 'pasted' });

  for (const table of memo.tables) {
    const headers = table.headers.map((h) => h.toLowerCase());
    const valueIndex = headers.findIndex((h) => /終値|値|指標値|価格|水準/.test(h));
    const pctIndex = headers.findIndex((h) => /前日比|騰落|change|比/.test(h));
    for (const row of table.rows) {
      const spec = specFor(row[0] ?? '');
      if (!spec) continue;
      const q = quoteFromParts(spec, row[valueIndex >= 0 ? valueIndex : 1], row[pctIndex >= 0 ? pctIndex : 2]);
      if (q) found.set(q.id, q);
    }
  }

  for (const line of raw.split(/\r?\n/)) {
    const plain = strip(line);
    for (const spec of SPECS) {
      if (found.has(spec.id) || !spec.patterns.some((p) => p.test(plain))) continue;
      const pct = plain.match(/[＋+\-−▲▼]?\s*\d+(?:\.\d+)?\s*%/)?.[0];
      const value = plain.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:円|付近|台|%)/)?.[0];
      const q = quoteFromParts(spec, value, pct);
      if (q) found.set(q.id, q);
    }
  }
  return SPECS.map((s) => found.get(s.id)).filter((q): q is Quote => Boolean(q));
}

function stanceFromHeadline(headline: string | null): TodayMarket['stance'] {
  const h = headline ?? '';
  if (/リスクオフ|全面安|見送り|弱い|警戒/.test(h)) return '様子見';
  if (/買い目線|上昇継続|強い|追い風/.test(h) && !/飛びつ|追わない|追い禁止|寄り追い禁止|注意|警戒/.test(h)) return '買い目線';
  if (/押し目|飛びつ|追わない|寄り追い/.test(h)) return '押し目待ち';
  return '様子見';
}

function expectedOpenFromQuotes(quotes: Quote[]): TodayMarket['expectedOpen'] {
  const future = quotes.find((q) => q.id === 'nikkeiFuture');
  const gap = future?.changePct ?? 0;
  const label = gap >= 0.7 ? '大幅GU' : gap >= 0.2 ? 'ややGU' : gap <= -0.5 ? 'GD' : '横ばい';
  return {
    label,
    gapPct: Math.round(gap * 100) / 100,
    note: future ? `${future.label} ${gap >= 0 ? '+' : ''}${gap.toFixed(2)}% をもとに推定` : '先物の値は未抽出。寄り前に確認してください',
  };
}

function positionSizeFromQuotes(quotes: Quote[]): TodayMarket['positionSize'] {
  const vi = quotes.find((q) => q.id === 'nikkeiVI') ?? quotes.find((q) => q.id === 'vix');
  if (!vi) return { label: '通常の70〜100%', reason: 'ボラティリティ指標は未抽出。寄り前に確認してください' };
  if (vi.value >= 25) return { label: '通常の50%', reason: `${vi.label}が高く、寄り追いより待機を優先` };
  if (vi.value >= 20) return { label: '通常の70%', reason: `${vi.label}がやや高め。寄り追いより押し目待ちが優先` };
  return { label: '通常サイズ', reason: `${vi.label}は落ち着いた水準` };
}

function extractEvents(raw: string): TodayEvent[] {
  const out: TodayEvent[] = [];
  const eventPattern =
    /(?:(\d{1,2}:\d{2})\s*)?(米(?:雇用統計|CPI|PPI|小売売上高|ISM|JOLTS|貿易収支|新規失業保険申請件数)|日銀|CPI|雇用統計|貿易収支|FOMC|SQ|決算|JOLTS|ISM)[^。|\n]*/i;
  for (const line of raw.split(/\r?\n/)) {
    const m = strip(line).match(eventPattern);
    if (!m) continue;
    const label = m[0].replace(/^[-*・\s]+/, '').trim();
    if (/決算予定銘柄|ポジション調整|注意$/.test(label) && !m[1] && !/SQ/.test(label)) continue;
    if (out.some((e) => e.label === label)) continue;
    const category: MarketEventCategory = /米|CPI|雇用|FOMC|JOLTS|ISM/.test(label)
      ? 'us-macro'
      : /SQ/.test(label)
        ? 'sq'
        : /決算/.test(label)
          ? 'earnings'
          : 'other';
    const importance: Importance = /雇用統計|CPI|FOMC|SQ/.test(label) ? 'high' : 'medium';
    out.push({ time: m[1], label, importance, category, note: '市況メモから抽出' });
  }
  return out.slice(0, 8);
}

function domesticNotes(raw: string): string[] {
  const memo = parseMarketMemo(raw, { source: 'pasted' });
  const notes = memo.sections
    .filter((s) => /国内|材料|ニュース|プロ|視点|テクニカル|チャート/.test(s.heading))
    .flatMap((s) => (s.bullets.length ? s.bullets : [s.summary]))
    .filter(Boolean);
  return [...new Set(notes)].slice(0, 8);
}

async function main() {
  const { values } = parseArgs({
    options: {
      memo: { type: 'string', default: 'raw-data/today.md' },
      base: { type: 'string', default: 'data/today-market.json' },
      out: { type: 'string', default: 'data/today-market.json' },
      'as-of': { type: 'string' },
      session: { type: 'string', default: '寄り前' },
    },
  });

  const raw = await readFile(values.memo, 'utf8');
  const base = JSON.parse(await readFile(values.base, 'utf8')) as TodayMarket;
  const parsed = parseMarketMemo(raw, { source: 'pasted' });
  const quotes = extractQuotes(raw);
  const headline = (parsed.headline ?? parsed.excerpt).replace(/^結論\s*[:：]\s*/, '');
  const today: TodayMarket = {
    ...base,
    meta: {
      schemaVersion: TODAY_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      source: 'memo',
      isSample: false,
      notes: parsed.needsReview ? ['市況メモに未確認・要確認の記述があります。一次情報で確認してください。'] : undefined,
    },
    asOf: values['as-of'] ?? base.asOf,
    session: values.session,
    stance: stanceFromHeadline(headline),
    expectedOpen: expectedOpenFromQuotes(quotes),
    positionSize: positionSizeFromQuotes(quotes),
    headline,
    externalQuotes: quotes.length ? quotes : base.externalQuotes,
    events: extractEvents(raw),
    domesticNotes: domesticNotes(raw),
    memoMarkdown: raw,
  };

  await writeFile(values.out, `${JSON.stringify(today, null, 2)}\n`);
  console.log(`[today:from-memo] 書き出し: ${values.out}`);
  console.log(`[today:from-memo] headline: ${headline}`);
  console.log(`[today:from-memo] quotes: ${today.externalQuotes.map((q) => q.label).join(', ') || 'なし'}`);
}

main().catch((e: unknown) => {
  console.error(`[today:from-memo] 失敗: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
