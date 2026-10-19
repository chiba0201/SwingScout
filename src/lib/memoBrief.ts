/**
 * 市況メモ末尾の「SwingScout用まとめ」（ChatGPT に決まった形で書いてもらうブロック）の読み取り。
 *
 *   【SwingScout】
 *   結論：…
 *   本線：フジクラ(5803)、古河電工(5801)
 *   指標：ダウ｜51521.28｜+0.49%
 *   …
 *   【SwingScout ここまで】
 *
 * 書式は examples/chatgpt-prompt-addon.md（ChatGPT に渡す指示文）と対になっている。変えるときは両方直す。
 * 本文（自由な文章）の読み取りは marketMemo.ts / todayBuilder.ts。こちらは決まった形なので確実に取れる。
 */
import type { Importance, Quote, QuotePolarity } from '../types/dataset';
import type {
  MemoPick,
  PickRole,
  PriceLevel,
  PtsQuote,
  RelatedStock,
  SectorStance,
  SectorStanceKind,
  StockCatalyst,
  TodayEvent,
} from '../types/today';

// ---------------------------------------------------------------------------
// 文字の正規化（全角の数字・記号を半角に）
// ---------------------------------------------------------------------------

/** 全角数字・全角記号（＋−％，．）を半角にする。数値の読み取り前に通す */
export function normalizeNumbers(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[＋]/g, '+')
    .replace(/[−－‐‑–—]/g, '-')
    .replace(/[％]/g, '%')
    .replace(/[，]/g, ',')
    .replace(/[．]/g, '.');
}

/** '51,521.28円' → 51521.28。数値が無ければ null */
export function firstNumber(s: string | undefined): number | null {
  const m = normalizeNumbers(s ?? '').match(/[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[+-]?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** '+0.49%' や '＋253.38・＋0.49％' から % の値 */
export function percentIn(s: string | undefined): number | null {
  const m = normalizeNumbers(s ?? '').match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// 外部指標（本文の読み取りと共通）
// ---------------------------------------------------------------------------

export interface QuoteSpec {
  id: string;
  label: string;
  patterns: RegExp[];
  polarity: QuotePolarity;
  decimals?: number;
  unit?: string;
  /** 金利のように値そのものが % の指標（前日比は bp・差で書かれる） */
  rate?: boolean;
}

/** 並び順がそのまま Today の外部指標の表示順。先物は日経平均より先に判定する */
export const QUOTE_SPECS: QuoteSpec[] = [
  { id: 'nikkeiFuture', label: '日経先物', patterns: [/CME.*日経/i, /日経(?:225|平均)?先物/, /大取.*先物/], polarity: 'up-good', decimals: 0 },
  { id: 'nikkei225', label: '日経平均', patterns: [/日経平均(?!先物)/, /日経225(?!先物)/], polarity: 'up-good', decimals: 2 },
  { id: 'topix', label: 'TOPIX', patterns: [/TOPIX/i], polarity: 'up-good', decimals: 2 },
  { id: 'dow', label: 'NYダウ', patterns: [/NYダウ/i, /ダウ/], polarity: 'up-good', decimals: 1 },
  { id: 'sp500', label: 'S&P500', patterns: [/S&P\s*500/i, /SP500/i], polarity: 'up-good', decimals: 1 },
  { id: 'nasdaq', label: 'NASDAQ', patterns: [/NASDAQ/i, /ナスダック/], polarity: 'up-good', decimals: 1 },
  { id: 'sox', label: 'SOX指数', patterns: [/SOX/i, /フィラデルフィア半導体/], polarity: 'up-good', decimals: 1 },
  { id: 'nikkeiVI', label: '日経VI', patterns: [/日経VI/i, /日経平均VI/i], polarity: 'up-bad', decimals: 2 },
  { id: 'vix', label: 'VIX', patterns: [/VIX/i], polarity: 'up-bad', decimals: 2 },
  { id: 'usdjpy', label: 'ドル円', patterns: [/ドル円/, /USD\/?JPY/i], polarity: 'neutral', decimals: 2, unit: '円' },
  { id: 'us10y', label: '米10年金利', patterns: [/米(?:国)?10年/, /米長期金利/, /US\s*10Y/i], polarity: 'neutral', decimals: 3, unit: '%', rate: true },
  { id: 'jp10y', label: '日本10年金利', patterns: [/日本10年/, /日10年/, /国内10年/, /JGB/i], polarity: 'neutral', decimals: 3, unit: '%', rate: true },
  { id: 'wti', label: 'WTI原油', patterns: [/WTI/i, /原油/], polarity: 'neutral', decimals: 2, unit: 'ドル' },
];

export function quoteSpecFor(label: string): QuoteSpec | null {
  return QUOTE_SPECS.find((s) => s.patterns.some((p) => p.test(label))) ?? null;
}

/**
 * 値と「前日比の書き方」から Quote を作る。
 *   '+0.49%' → 騰落率 / '-4.0bp' → 金利の差 / '+221.02円' '-0.46ポイント' → 値幅（騰落率は計算）
 */
export function buildQuote(spec: QuoteSpec, value: number, changeText: string | undefined, note?: string): Quote {
  const text = normalizeNumbers(changeText ?? '');
  let change = 0;
  let changePct = 0;
  let known = true;
  const pct = spec.rate ? null : percentIn(text);
  const bp = text.match(/([+-]?\d+(?:\.\d+)?)\s*bp/i);
  const diff = text.match(/([+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[+-]?\d+(?:\.\d+)?)\s*(?:円|ドル|ポイント|pt|銭)?/);
  if (pct !== null) {
    // 値幅は書かれていないので 0（表示は騰落率だけになる。% からの逆算は丸めでずれるため使わない）
    changePct = pct;
  } else if (bp) {
    change = Number(bp[1]) / 100;
    changePct = (change / (value - change)) * 100;
  } else if (diff && /[+-]/.test(diff[1]!)) {
    change = Number(diff[1]!.replace(/,/g, ''));
    changePct = (change / (value - change)) * 100;
  } else {
    known = false;
  }
  const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
  return {
    id: spec.id,
    label: spec.label,
    value,
    change: round(change, 4),
    changePct: round(changePct, 2),
    decimals: spec.decimals,
    unit: spec.unit,
    polarity: spec.polarity,
    ...(known ? {} : { changeUnknown: true }),
    ...(note ? { note } : {}),
  };
}

// ---------------------------------------------------------------------------
// まとめブロック
// ---------------------------------------------------------------------------

export interface MemoBrief {
  asOf?: string;
  checkedAt?: string;
  session?: string;
  headline?: string;
  stance?: string;
  expectedOpen?: { label: string; gapPct?: number };
  /** 今週（次の保有期間）にかけての見通し */
  weekOutlook?: string;
  /** 実際の寄り（前場以降のメモ）。日経平均の始値と前日終値比のどちらか・両方 */
  actualOpen?: { gapPct?: number; price?: number };
  positionSize?: { label: string; reason?: string };
  picks: MemoPick[];
  sectorStances: SectorStance[];
  entry?: string;
  invalidation?: string;
  stopLoss?: string;
  levels: PriceLevel[];
  quotes: Quote[];
  relatedStocks: RelatedStock[];
  pts: PtsQuote[];
  catalysts: StockCatalyst[];
  events: TodayEvent[];
  breadth?: string;
  unconfirmed: string[];
}

const START = /【\s*SwingScout\s*(?:用まとめ)?\s*】|\[\s*SwingScout\s*\]/i;
const END = /【\s*(?:\/\s*SwingScout|SwingScout\s*(?:ここまで|おわり|終わり|END))\s*】|\[\s*\/\s*SwingScout\s*\]/i;

/** 本文とまとめブロックを分ける。ブロックが無ければ block は null */
export function splitMemoBrief(raw: string): { body: string; block: string[] | null } {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((l) => START.test(l) && !END.test(l));
  if (start === -1) return { body: raw, block: null };
  let end = lines.findIndex((l, i) => i > start && END.test(l));
  if (end === -1) end = lines.length;
  // 直前・直後のコードフェンスも本文から外す
  const before = start > 0 && /^\s*(```|~~~)/.test(lines[start - 1]!) ? start - 1 : start;
  const after = end < lines.length - 1 && /^\s*(```|~~~)\s*$/.test(lines[end + 1]!) ? end + 1 : end;
  return {
    body: [...lines.slice(0, before), ...lines.slice(after + 1)].join('\n'),
    block: lines.slice(start + 1, end),
  };
}

const KEYS: Record<string, string[]> = {
  asOf: ['対象日', '日付'],
  checkedAt: ['確認時刻', '情報確認'],
  session: ['区分', 'セッション'],
  headline: ['結論', '一言'],
  stance: ['スタンス'],
  expectedOpen: ['想定寄り'],
  actualOpen: ['寄り付き', '実際の寄り', '始値'],
  weekOutlook: ['今週', '今週の見通し', '週間見通し'],
  positionSize: ['サイズ', 'ポジションサイズ'],
  main: ['本線'],
  confirm: ['確認後', '条件付き'],
  wait: ['待機'],
  avoid: ['避ける', '見送り'],
  priority: ['優先', '優先セクター', '優先監視'],
  select: ['選別', '選別セクター'],
  caution: ['慎重', '慎重セクター'],
  entry: ['入る条件', 'エントリー条件', 'エントリー'],
  invalidation: ['撤回条件', '反証'],
  stopLoss: ['損切り'],
  level: ['節目', '日経節目'],
  quote: ['指標'],
  related: ['関連株', '米関連株'],
  pts: ['PTS'],
  catalyst: ['材料', '個別材料'],
  event: ['イベント'],
  breadth: ['広がり', '市場'],
  unconfirmed: ['未確認'],
};

const KEY_OF = new Map(Object.entries(KEYS).flatMap(([k, names]) => names.map((n) => [n.toLowerCase(), k] as const)));

// 「/」は日付（10/6）の中では区切らない
const splitList = (s: string) =>
  s
    .split(/[,、，]|(?<!\d)[/／](?!\d)/)
    .map((x) => x.trim())
    .filter((x) => x && !/^(なし|無し|-|—|特になし)$/.test(x));

const splitFields = (s: string) => s.split(/[｜|]/).map((x) => x.trim());

const CODE = /[（(]\s*([0-9]{3}[0-9A-Z])\s*[)）]/;

/** 'フジクラ(5803)' / '5803 フジクラ' → { name, code } */
export function parseStockRef(s: string): { name: string; code?: string } {
  const t = normalizeNumbers(s).trim();
  const paren = t.match(CODE);
  if (paren) return { name: t.replace(CODE, '').trim(), code: paren[1] };
  const lead = t.match(/^([0-9]{3}[0-9A-Z])\s+(.+)$/);
  if (lead) return { name: lead[2]!.trim(), code: lead[1] };
  return { name: t };
}

function parseDate(s: string, year: number): string | undefined {
  const t = normalizeNumbers(s);
  const full = t.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (full) return `${full[1]}-${full[2]!.padStart(2, '0')}-${full[3]!.padStart(2, '0')}`;
  const md = t.match(/(\d{1,2})\/(\d{1,2})/);
  if (md) return `${year}-${md[1]!.padStart(2, '0')}-${md[2]!.padStart(2, '0')}`;
  return undefined;
}

function parseTime(s: string): string | undefined {
  const m = normalizeNumbers(s).match(/(\d{1,2})[:：時](\d{2})/);
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : undefined;
}

const IMPORTANCE: Record<string, Importance> = { 高: 'high', 中: 'medium', 低: 'low', high: 'high', medium: 'medium', low: 'low' };

/**
 * まとめブロックを読む。ブロックが無ければ null。
 * year は「10/8 03:00」のような年なしの日付に補う年（対象日の年）。
 */
export function parseMemoBrief(raw: string, year = new Date().getFullYear()): MemoBrief | null {
  const { block } = splitMemoBrief(raw);
  if (!block) return null;

  const brief: MemoBrief = {
    picks: [],
    sectorStances: [],
    levels: [],
    quotes: [],
    relatedStocks: [],
    pts: [],
    catalysts: [],
    events: [],
    unconfirmed: [],
  };

  for (const rawLine of block) {
    const line = rawLine
      .replace(/^\s*(?:[-*・]|\d+[.)])\s*/, '')
      .replace(/\*\*|__|`/g, '')
      .trim();
    const m = line.match(/^([^:：]{1,14})[:：]\s*(.*)$/);
    if (!m) continue;
    const key = KEY_OF.get(m[1]!.trim().toLowerCase());
    const value = m[2]!.trim();
    if (!key || !value) continue;

    switch (key) {
      case 'asOf':
        brief.asOf = parseDate(value, year);
        break;
      case 'checkedAt':
        brief.checkedAt = parseTime(value);
        break;
      case 'session':
        brief.session = value.replace(/（.*$|\(.*$/, '').trim();
        break;
      case 'headline':
        brief.headline = value;
        break;
      case 'stance':
        brief.stance = (['買い目線', '押し目待ち', '様子見', 'リスクオフ'].find((s) => value.includes(s)) ?? value).trim();
        break;
      case 'expectedOpen': {
        const gap = percentIn(value);
        const label = normalizeNumbers(value).replace(/[+-]?\d+(?:\.\d+)?\s*%/, '').replace(/[（()）]/g, ' ').trim();
        brief.expectedOpen = { label: label || value, gapPct: gap ?? undefined };
        break;
      }
      case 'weekOutlook':
        brief.weekOutlook = value;
        break;
      case 'actualOpen': {
        const t = normalizeNumbers(value);
        const gapPct = percentIn(t) ?? undefined;
        // 1000以上の数は日経平均の始値（％の数と区別する）
        const price = [...t.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)]
          .map((m) => Number(m[0].replace(/,/g, '')))
          .find((n) => n >= 1000);
        if (gapPct !== undefined || price !== undefined) brief.actualOpen = { gapPct, price };
        break;
      }
      case 'positionSize': {
        const [label, ...rest] = value.split(/[／/（(]/);
        brief.positionSize = { label: label!.trim(), reason: rest.join(' ').replace(/[)）]$/, '').trim() || undefined };
        break;
      }
      case 'main':
      case 'confirm':
      case 'wait':
      case 'avoid':
        for (const item of splitList(value)) brief.picks.push({ ...parseStockRef(item), role: key as PickRole });
        break;
      case 'priority':
      case 'select':
      case 'caution':
        for (const sector of splitList(value)) brief.sectorStances.push({ sector, stance: key as SectorStanceKind });
        break;
      case 'entry':
        brief.entry = value;
        break;
      case 'invalidation':
        brief.invalidation = value;
        break;
      case 'stopLoss':
        brief.stopLoss = value;
        break;
      case 'level': {
        const [price, label] = splitFields(value);
        const n = firstNumber(price);
        if (n !== null) brief.levels.push({ price: n, label: label ?? '' });
        break;
      }
      case 'quote': {
        const [name = '', val, change, note] = splitFields(value);
        // 値そのものが未確認・空のときだけ未確認扱い（補足欄の「限月未確認」などでは捨てない）
        if (!val || /^未確認/.test(val)) {
          brief.unconfirmed.push(name);
          break;
        }
        const n = firstNumber(val);
        if (n === null) break;
        const found = quoteSpecFor(name) ?? { id: 'memo', label: name, patterns: [], polarity: 'neutral' as const };
        // 同じ指標が複数行（大取とCMEの先物など）あれば、1行目を代表にし、2行目以降も別の枠で残す
        const same = brief.quotes.filter((q) => q.id === found.id || q.id.startsWith(`${found.id}-`)).length;
        const spec = same === 0 ? found : { ...found, id: `${found.id}-${same + 1}` };
        brief.quotes.push(buildQuote(spec, n, change, note || undefined));
        break;
      }
      case 'related': {
        const [group = '', name = '', change] = splitFields(value);
        const pct = percentIn(change);
        if (name && pct !== null) brief.relatedStocks.push({ group, name, changePct: pct });
        break;
      }
      case 'pts': {
        const [ref = '', price, change] = splitFields(value);
        brief.pts.push({ ...parseStockRef(ref), price: firstNumber(price) ?? undefined, changePct: percentIn(change) ?? undefined });
        break;
      }
      case 'catalyst': {
        const [ref = '', text = '', impact = ''] = splitFields(value);
        brief.catalysts.push({
          ...parseStockRef(ref),
          text,
          impact: /悪/.test(impact) ? 'negative' : /好/.test(impact) ? 'positive' : 'neutral',
        });
        break;
      }
      case 'event': {
        const [when = '', label = '', importance = ''] = splitFields(value);
        if (!label) break;
        const date = /\d{1,2}\/\d{1,2}|明日|翌/.test(normalizeNumbers(when)) ? parseDate(when, year) : undefined;
        brief.events.push({
          ...(date ? { date } : {}),
          time: parseTime(when),
          label,
          importance: IMPORTANCE[importance.trim()] ?? (/FOMC|雇用統計|CPI|日銀|SQ/.test(label) ? 'high' : 'medium'),
          category: /FOMC|日銀|ECB|政策金利/.test(label) ? 'central-bank' : /^米|米国/.test(label) ? 'us-macro' : /決算/.test(label) ? 'earnings' : /SQ/.test(label) ? 'sq' : 'jp-macro',
        });
        break;
      }
      case 'breadth':
        brief.breadth = value;
        break;
      case 'unconfirmed':
        brief.unconfirmed.push(...splitList(value));
        break;
    }
  }

  brief.levels.sort((a, b) => b.price - a.price);
  brief.unconfirmed = [...new Set(brief.unconfirmed.filter(Boolean))];
  return brief;
}
