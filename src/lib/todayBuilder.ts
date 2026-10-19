/**
 * 市況メモ Markdown から TodayMarket を作る純粋ロジック。
 * CLI とブラウザUIの両方から使うため、Node API や DOM に依存させない。
 */
import type { Importance, MarketEventCategory, Quote } from '../types/dataset';
import { TODAY_SCHEMA_VERSION, type OpenScenario, type TodayEvent, type TodayMarket } from '../types/today';
import { addDays } from './calendar';
import { parseMarketMemo, type MemoTable } from './marketMemo';
import { buildQuote, normalizeNumbers, parseMemoBrief, QUOTE_SPECS, quoteSpecFor, type MemoBrief } from './memoBrief';

const strip = (s: string) => s.replace(/\*\*/g, '').replace(/`/g, '').trim();

/** 値の時点（'本日4:28時点' '5:23時点の記事'）→ '4:28時点' */
const timeNote = (s: string) => {
  const m = normalizeNumbers(s).match(/(\d{1,2}:\d{2})\s*(?:時点|現在)/);
  return m ? `${m[1]}時点` : undefined;
};

/** 文末に付いた出典名（「…据え置き。 株探」の「株探」）を外す */
const dropTrailingSource = (s: string) => s.replace(/([。．!！?？])\s+[^。．]{1,40}$/, '$1');

/** 値として読む数（カンマ区切り・小数・単位つき）。'11月限' や '10/6' の数字は拾わない */
const VALUE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+|\d+(?=\s*(?:円|ドル|ポイント|pt|%))/;

/** 前日比の書き方（%・bp・符号つきの値幅）。見つからなければ undefined */
function changeTextIn(s: string): string | undefined {
  const t = normalizeNumbers(s);
  return (
    t.match(/[+-]\s*\d+(?:\.\d+)?\s*%/)?.[0] ??
    t.match(/[+-]?\d+(?:\.\d+)?\s*bp/i)?.[0] ??
    t.match(/[+-]\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:円|ドル|ポイント|pt)/)?.[0]
  );
}

function quotesFromTables(tables: MemoTable[], found: Map<string, Quote>) {
  for (const table of tables) {
    const headers = table.headers.map((h) => h.toLowerCase());
    const valueIndex = headers.findIndex((h, i) => i > 0 && /終値|値|指標値|価格|水準/.test(h));
    const changeIndex = headers.findIndex((h, i) => i > 0 && i !== valueIndex && /前日比|騰落|change|比|差/.test(h));
    for (const row of table.rows) {
      const spec = quoteSpecFor(row[0] ?? '');
      if (!spec || /未確認/.test(row.join(' '))) continue;
      const value = normalizeNumbers(row[valueIndex >= 0 ? valueIndex : 1] ?? '').match(VALUE)?.[0];
      if (!value) continue;
      const changeText = changeTextIn(row[changeIndex >= 0 ? changeIndex : 2] ?? '');
      const note = timeNote(row.filter((_, i) => i !== changeIndex).join(' '));
      found.set(spec.id, buildQuote(spec, Number(value.replace(/,/g, '')), changeText, note));
    }
  }
}

/**
 * 本文から外部指標を拾う。表 → 1行ずつの順。
 * 行は「指標名の後ろ」の数だけを見る。「未確認」と書かれた行の値は使わない（古い値を今日の値と誤読しないため）。
 */
export function extractTodayQuotes(raw: string): Quote[] {
  const found = new Map<string, Quote>();
  const memo = parseMarketMemo(raw, { source: 'pasted' });
  quotesFromTables(memo.tables, found);

  for (const line of memo.raw.split('\n')) {
    const plain = normalizeNumbers(strip(line));
    if (plain.includes('\t') || /^\s*\|/.test(plain)) continue; // 表の行は上で読んだ
    for (const spec of QUOTE_SPECS) {
      if (found.has(spec.id)) continue;
      const hit = spec.patterns.map((p) => plain.match(p)).find((m): m is RegExpMatchArray => Boolean(m));
      if (!hit || /未確認/.test(plain)) continue;
      const after = plain.slice((hit.index ?? 0) + hit[0].length);
      const value = after.match(VALUE)?.[0];
      if (!value) continue;
      const rest = after.slice(after.indexOf(value) + value.length);
      found.set(spec.id, buildQuote(spec, Number(value.replace(/,/g, '')), changeTextIn(rest), timeNote(rest)));
    }
  }
  return QUOTE_SPECS.map((s) => found.get(s.id)).filter((q): q is Quote => Boolean(q));
}

function stanceFromHeadline(headline: string | null): TodayMarket['stance'] {
  const h = headline ?? '';
  if (/リスクオフ|全面安|見送り|弱い|警戒/.test(h)) return '様子見';
  if (/買い目線|上昇継続|強い|追い風/.test(h) && !/飛びつ|追わない|追い禁止|寄り追い禁止|注意|警戒/.test(h)) return '買い目線';
  if (/押し目|飛びつ|追わない|寄り追い/.test(h)) return '押し目待ち';
  return '様子見';
}

/** 寄り付きの前日比（%）の呼び方（想定寄り・実際の寄りで共通） */
export function openGapLabel(gap: number): string {
  return gap >= 0.7 ? '大幅GU' : gap >= 0.2 ? 'ややGU' : gap <= -0.5 ? 'GD' : '横ばい';
}
const expectedOpenLabel = openGapLabel;

/**
 * 想定寄り：日経先物と、日経平均の前日終値（現物）の差から推定する。
 * 現物の終値が無ければ先物の前日比。先物の前日比は「前日清算値比」など基準がまちまちなので、現物比を優先する。
 */
function expectedOpenFromQuotes(quotes: Quote[]): TodayMarket['expectedOpen'] {
  const future = quotes.find((q) => q.id === 'nikkeiFuture');
  const close = quotes.find((q) => q.id === 'nikkei225')?.value;
  if (!future || (!close && future.changeUnknown)) {
    return { label: '横ばい', gapPct: 0, note: '先物の値は未抽出。寄り前に確認してください' };
  }
  const gap = close ? (future.value / close - 1) * 100 : future.changePct;
  const rounded = Math.round(gap * 100) / 100;
  const fmt = (n: number) => n.toLocaleString('ja-JP');
  return {
    label: expectedOpenLabel(rounded),
    gapPct: rounded,
    note: close
      ? `${future.label} ${fmt(future.value)} と前日の現物終値 ${fmt(close)} の差から推定`
      : `${future.label}の前日比 ${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)}% から推定`,
  };
}

function positionSizeFromQuotes(quotes: Quote[]): TodayMarket['positionSize'] {
  const vi = quotes.find((q) => q.id === 'nikkeiVI') ?? quotes.find((q) => q.id === 'vix');
  if (!vi) return { label: '通常の70〜100%', reason: 'ボラティリティ指標は未抽出。寄り前に確認してください' };
  if (vi.value >= 25) return { label: '通常の50%', reason: `${vi.label}が高く、寄り追いより待機を優先` };
  if (vi.value >= 20) return { label: '通常の70%', reason: `${vi.label}がやや高め。寄り追いより押し目待ちが優先` };
  return { label: '通常サイズ', reason: `${vi.label}は落ち着いた水準` };
}

const eventCategory = (label: string): MarketEventCategory =>
  /FOMC|日銀|ECB|政策金利/.test(label)
    ? 'central-bank'
    : /^米|米国|CPI|雇用|JOLTS|ISM/.test(label)
      ? 'us-macro'
      : /SQ/.test(label)
        ? 'sq'
        : /決算/.test(label)
          ? 'earnings'
          : 'jp-macro';

const eventImportance = (label: string): Importance => (/雇用統計|CPI|FOMC|日銀|SQ|政策金利/.test(label) ? 'high' : 'medium');

/** 「日時｜イベント」の表から読む。'本日8:30' / '明日10/8 3:00' / '10/8 3:00' に対応 */
function eventsFromTables(tables: MemoTable[], asOf: string): TodayEvent[] {
  const out: TodayEvent[] = [];
  const year = Number(asOf.slice(0, 4));
  for (const table of tables) {
    // 「確認値・日本時間」のような列は日時の列にしない（先頭が日時・時刻の見出しだけ）
    const whenIndex = table.headers.findIndex((h) => /^(?:日時|時刻|時間|日付)/.test(h.trim()));
    const labelIndex = table.headers.findIndex((h, i) => i !== whenIndex && /イベント|指標|予定|内容/.test(h));
    if (whenIndex === -1 || labelIndex === -1) continue;
    for (const row of table.rows) {
      const when = normalizeNumbers(row[whenIndex] ?? '');
      const label = (row[labelIndex] ?? '').trim();
      if (!label) continue;
      const time = when.match(/(\d{1,2})[:：時](\d{2})/);
      const md = when.match(/(\d{1,2})\/(\d{1,2})/);
      const date = md
        ? `${year}-${md[1]!.padStart(2, '0')}-${md[2]!.padStart(2, '0')}`
        : /明日|翌日/.test(when)
          ? addDays(asOf, 1)
          : undefined;
      out.push({
        ...(date && date !== asOf ? { date } : {}),
        time: time ? `${time[1]!.padStart(2, '0')}:${time[2]}` : undefined,
        label,
        importance: eventImportance(label),
        category: eventCategory(label),
        note: '市況メモから抽出',
      });
    }
  }
  return out;
}

/** 表が無いメモ向け：時刻つきの行・箇条書きから拾う（文中の言及は拾わない） */
function eventsFromLines(raw: string): TodayEvent[] {
  const out: TodayEvent[] = [];
  const eventPattern =
    /(?:(\d{1,2}:\d{2})\s*)?(米(?:雇用統計|CPI|PPI|小売売上高|ISM|JOLTS|貿易収支|新規失業保険申請件数)|日銀|CPI|雇用統計|貿易収支|FOMC|SQ|決算|JOLTS|ISM)[^。|\n]*/i;
  for (const line of raw.split(/\r?\n/)) {
    const plain = strip(line);
    const m = plain.match(eventPattern);
    if (!m) continue;
    // 時刻が無い文中の言及（「FOMC議事要旨を受けた…に注意」など）は除く
    if (!m[1] && !/^\s*[-*・]/.test(line)) continue;
    if (/ではなく|ではない/.test(plain)) continue;
    const label = m[0]
      .replace(/^[-*・\s]+/, '')
      .replace(/^\d{1,2}:\d{2}\s*/, '')
      .trim();
    if (/決算予定銘柄|ポジション調整|注意$/.test(label) && !m[1] && !/SQ/.test(label)) continue;
    if (out.some((e) => e.label === label)) continue;
    out.push({ time: m[1], label, importance: eventImportance(label), category: eventCategory(label), note: '市況メモから抽出' });
  }
  return out.slice(0, 8);
}

function domesticNotes(raw: string): string[] {
  const memo = parseMarketMemo(raw, { source: 'pasted' });
  const notes = memo.sections
    .filter((s) => /国内|材料|ニュース|プロ|視点|テクニカル|チャート|注目/.test(s.heading))
    .flatMap((s) => (s.bullets.length ? s.bullets : [s.summary]))
    .map(dropTrailingSource)
    .filter(Boolean);
  return [...new Set(notes)].slice(0, 8);
}

/** 冒頭の「情報確認：7:25ごろ」から確認時刻 */
function checkedAtIn(raw: string): string | undefined {
  const head = normalizeNumbers(raw.split('\n').slice(0, 4).join(' '));
  const m = head.match(/(?:情報確認|確認時刻|確認)[:：]?\s*(\d{1,2}):(\d{2})/);
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : undefined;
}

/** 想定寄りが未確認のときに添える、先物と現物の差（予測には使わない参考値） */
function futuresReference(quotes: Quote[], gap: number): string {
  const future = quotes.find((q) => q.id === 'nikkeiFuture');
  const close = quotes.find((q) => q.id === 'nikkei225')?.value;
  if (!future) return '市況メモで判断を保留';
  const fmt = (n: number) => n.toLocaleString('ja-JP');
  const diff = close ? ` と前日の現物終値 ${fmt(close)} の差は ${gap >= 0 ? '+' : ''}${gap.toFixed(2)}%` : '';
  return `参考：${future.label} ${fmt(future.value)}${diff}（予測には使っていません）`;
}

/** 本文から読んだ指標に、まとめブロックの指標を重ねる（まとめを優先。並びは QUOTE_SPECS の順） */
function mergeQuotes(fromBody: Quote[], brief: MemoBrief | null): Quote[] {
  if (!brief || brief.quotes.length === 0) return fromBody;
  const byId = new Map(fromBody.map((q) => [q.id, q]));
  for (const q of brief.quotes) byId.set(q.id, q);
  // まとめで「未確認」とされた指標は、本文から読めていても出さない（まとめ自身が値を書いた指標は残す）
  const given = new Set(brief.quotes.map((q) => q.id));
  for (const name of brief.unconfirmed) {
    const spec = quoteSpecFor(name);
    if (spec && !given.has(spec.id)) byId.delete(spec.id);
  }
  // 'nikkeiFuture-2' のような2つ目以降は、同じ指標のすぐ後ろに並べる
  const order = (id: string) => {
    const i = QUOTE_SPECS.findIndex((s) => s.id === id.replace(/-\d+$/, ''));
    return (i === -1 ? QUOTE_SPECS.length : i) + (/-\d+$/.test(id) ? 0.5 : 0);
  };
  return [...byId.values()].sort((a, b) => order(a.id) - order(b.id));
}

/**
 * 以前の既定のシナリオ文言を今のものに直す。
 * 「小幅GU/横ばい」は判定（todayAnalysis.ts の TODAY_THRESHOLDS）では -0.5%〜+0.7% なのに、文言が ±0.3% だった。
 */
export function upgradeScenarios(scenarios: OpenScenario[]): OpenScenario[] {
  return scenarios.map((s) =>
    s.id === 'flat-small-gap' && s.condition === '日経先物 ±0.3%程度' ? { ...s, condition: '日経先物 -0.5%〜+0.7%の間' } : s,
  );
}

/**
 * 市況メモから TodayMarket を作る。
 * 末尾に「SwingScout用まとめ」があればその内容を優先し、無い項目は本文から読む。
 * base（前回の Today）からはシナリオと監視ルールだけを引き継ぐ（前日の方針・節目などは持ち越さない）。
 */
export function buildTodayFromMemo(base: TodayMarket, raw: string, options: { asOf?: string; session?: string; generatedAt?: string } = {}): TodayMarket {
  const asOfHint = options.asOf ?? base.asOf;
  const brief = parseMemoBrief(raw, Number(asOfHint.slice(0, 4)) || new Date().getFullYear());
  const asOf = options.asOf ?? brief?.asOf ?? base.asOf;
  const parsed = parseMarketMemo(raw, { source: 'pasted' });
  const quotes = mergeQuotes(extractTodayQuotes(raw), brief);
  const headline = brief?.headline ?? (parsed.headline ?? parsed.excerpt).replace(/^結論\s*[:：]\s*/, '');
  const fromQuotes = expectedOpenFromQuotes(quotes);
  const briefGap = brief?.expectedOpen?.gapPct;
  // まとめがあるのに「想定寄り」が無い ＝ 判断を保留した、とみなして未確認にする（先物と現物の差を予測に使わない）。
  // まとめが無い古い形式のメモは、先物からの推定を使う
  const expectedOpen: TodayMarket['expectedOpen'] = brief?.expectedOpen
    ? {
        label: brief.expectedOpen.label || expectedOpenLabel(briefGap ?? fromQuotes.gapPct),
        gapPct: briefGap ?? fromQuotes.gapPct,
        note: briefGap !== undefined ? '市況メモのまとめ' : fromQuotes.note,
      }
    : brief
      ? {
          label: '未確認',
          gapPct: 0,
          unconfirmed: true,
          note: futuresReference(quotes, fromQuotes.gapPct),
        }
      : fromQuotes;
  const tableEvents = eventsFromTables(parsed.tables, asOf);
  const events = brief?.events.length ? brief.events : tableEvents.length ? tableEvents : eventsFromLines(raw);
  const plan =
    brief && (brief.picks.length || brief.entry || brief.invalidation || brief.stopLoss)
      ? { picks: brief.picks, entry: brief.entry, invalidation: brief.invalidation, stopLoss: brief.stopLoss }
      : undefined;
  const nonEmpty = <T,>(xs: T[] | undefined) => (xs && xs.length > 0 ? xs : undefined);

  // 実際の寄り：まとめの「寄り付き」→ 同じ日に画面で入れた値（メモを貼り直しても消さない）
  const prevClose =
    brief?.levels.find((l) => /前日終値|昨日終値/.test(l.label))?.price ?? quotes.find((q) => q.id === 'nikkei225')?.value ?? null;
  const memoOpen = brief?.actualOpen;
  const memoGap =
    memoOpen?.gapPct ?? (memoOpen?.price !== undefined && prevClose ? Math.round((memoOpen.price / prevClose - 1) * 10000) / 100 : undefined);
  const actualOpen: TodayMarket['actualOpen'] =
    memoGap !== undefined
      ? {
          gapPct: memoGap,
          ...(memoOpen?.price !== undefined ? { price: memoOpen.price } : {}),
          ...(prevClose ? { basePrice: prevClose } : {}),
          source: 'memo',
          at: options.generatedAt ?? new Date().toISOString(),
        }
      : base.asOf === asOf
        ? base.actualOpen
        : undefined;

  return {
    ...base,
    scenarios: upgradeScenarios(base.scenarios),
    meta: {
      schemaVersion: TODAY_SCHEMA_VERSION,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      source: 'memo',
      isSample: false,
      notes: parsed.needsReview ? ['市況メモに未確認・要確認の記述があります。一次情報で確認してください。'] : undefined,
    },
    asOf,
    session: options.session ?? brief?.session ?? base.session,
    stance: brief?.stance ?? stanceFromHeadline(headline),
    expectedOpen,
    positionSize: brief?.positionSize ?? positionSizeFromQuotes(quotes),
    headline,
    externalQuotes: quotes.length ? quotes : base.externalQuotes,
    events,
    // まとめの「材料」と同じ銘柄の行は、国内材料から外す（個別材料として別に出すため）
    domesticNotes: domesticNotes(raw).filter(
      (n) => !brief?.catalysts.some((c) => (c.code && n.includes(c.code)) || (c.name.length >= 2 && n.includes(c.name))),
    ),
    memoMarkdown: raw,
    checkedAt: brief?.checkedAt ?? checkedAtIn(raw),
    weekOutlook: brief?.weekOutlook,
    actualOpen,
    plan,
    sectorStances: nonEmpty(brief?.sectorStances),
    levels: nonEmpty(brief?.levels),
    relatedStocks: nonEmpty(brief?.relatedStocks),
    pts: nonEmpty(brief?.pts),
    catalysts: nonEmpty(brief?.catalysts),
    breadth: brief?.breadth,
    unconfirmed: nonEmpty(brief?.unconfirmed),
  };
}

/**
 * Today データがまだ無いときに、市況メモから作るための雛形。
 * シナリオと監視ルールは既定値を入れておく（メモからは作らない項目）。
 */
export function emptyTodayBase(asOf: string, generatedAt: string): TodayMarket {
  return {
    meta: { schemaVersion: TODAY_SCHEMA_VERSION, generatedAt, source: 'ui', isSample: false },
    asOf,
    session: '寄り前',
    stance: '様子見',
    expectedOpen: { label: '横ばい', gapPct: 0 },
    positionSize: { label: '通常の70〜100%' },
    headline: '市況メモから生成してください。',
    externalQuotes: [],
    scenarios: [
      {
        id: 'large-gap-up',
        label: '大幅GU',
        condition: '日経先物 +0.7%以上、または候補銘柄が寄り前気配で大きく上振れ',
        action: '寄り付きは追わず、9:15以降のVWAP押し目待ち',
        risk: '寄り天と利食い売り',
      },
      {
        id: 'flat-small-gap',
        label: '小幅GU/横ばい',
        condition: '日経先物 -0.5%〜+0.7%の間',
        action: '上位候補の出来高とVWAP回復を確認して分割エントリー',
        risk: '指数が伸びない場合は個別も失速',
      },
      {
        id: 'gap-down',
        label: 'GD',
        condition: '日経先物 -0.5%以上',
        action: '先物と半導体の下げ止まり確認まで待機',
        risk: '前日強かった銘柄ほど利確売りが出やすい',
      },
    ],
    events: [],
    domesticNotes: [],
    watchlistRules: { gapUpAllowedPct: 0.5, avoidIfRiskScoreOver: 65 },
  };
}
