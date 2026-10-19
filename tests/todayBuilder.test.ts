import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeDataset } from '../src/lib/analysis';
import { marketContextOutdated, marketContextWhen } from '../src/lib/market';
import { marketContextFromToday } from '../src/lib/marketContextFromToday';
import { parseMarketMemo } from '../src/lib/marketMemo';
import { parseMemoBrief, splitMemoBrief } from '../src/lib/memoBrief';
import { buildTodayFromMemo, emptyTodayBase } from '../src/lib/todayBuilder';
import {
  analyzeToday,
  applyMemoRole,
  classifyUnconfirmed,
  judgeWatchItem,
  matchPick,
  parseActualOpen,
  previousClose,
} from '../src/lib/todayAnalysis';
import { validateDataset } from '../src/lib/validate';

/** ChatGPT の画面からコピーした市況メモ（【】見出し・タブ区切りの表・全角の％＋−） */
const plain = readFileSync('tests/fixtures/market-memo-2026-10-07.md', 'utf8');
/** 同じメモの末尾に「SwingScout用まとめ」を付けたもの */
const withBrief = readFileSync('tests/fixtures/market-memo-2026-10-07-with-brief.md', 'utf8');
const base = emptyTodayBase('2026-10-07', '2026-10-07T00:00:00.000Z');
const quote = (t: ReturnType<typeof buildTodayFromMemo>, id: string) => t.externalQuotes.find((q) => q.id === id);

describe('parseMarketMemo（コピーした書式）', () => {
  const memo = parseMarketMemo(plain);

  it('【】を見出し、タブ区切りを表として読む', () => {
    expect(memo.sections.map((s) => s.heading)).toEqual([
      '本日の注目', '日経', '米市場', '為替・金利・原油', 'ADR', 'セクター', '個別材料', '日経ライン', 'イベント', '売買方針',
    ]);
    expect(memo.tables).toHaveLength(6);
    expect(memo.tables.find((t) => t.section === '米市場')?.headers).toEqual(['指数', '終値', '前日比']);
    // 表は Markdown に直して本文に入る（画面・レポートで表として出る）
    expect(memo.tables[0]!.markdown.split('\n')[1]).toMatch(/^\| --- \|/);
  });

  it('冒頭の「対象：…／情報確認：…」は見出しにせず、本文の最初の1文を見出しにする', () => {
    expect(memo.headline).toBe('今日は、光通信・電線の押し目反発を優先し、半導体は銘柄を選別する日と見ています。');
  });
});

describe('buildTodayFromMemo（本文だけ）', () => {
  const t = buildTodayFromMemo(base, plain, { asOf: '2026-10-07' });

  it('外部指標：全角の％・表のセル・bp・ポイントを読む', () => {
    expect(quote(t, 'dow')).toMatchObject({ value: 51521.28, changePct: 0.49 });
    expect(quote(t, 'nikkei225')).toMatchObject({ value: 70683.98, changePct: 1.05 });
    expect(quote(t, 'topix')).toMatchObject({ value: 4183.56, changePct: 0.92 });
    expect(quote(t, 'vix')).toMatchObject({ value: 15.06, changePct: -2.96 });
    expect(quote(t, 'us10y')).toMatchObject({ value: 5.265, change: -0.04, note: '4:28時点' });
    expect(quote(t, 'wti')?.value).toBe(89.44);
  });

  it('前日比が書かれていない値は「不明」にする（0%と誤表示しない）', () => {
    expect(quote(t, 'usdjpy')).toMatchObject({ value: 158.16, changeUnknown: true, note: '4:28時点' });
  });

  it('「未確認」と書かれた行の古い値は使わない', () => {
    expect(quote(t, 'sox')).toBeUndefined();
  });

  it('先物の差（円）から想定寄りを出す', () => {
    expect(quote(t, 'nikkeiFuture')).toMatchObject({ value: 70905, changePct: 0.31 });
    expect(t.expectedOpen).toMatchObject({ label: 'ややGU', gapPct: 0.31 });
  });

  it('結論・スタンス・確認時刻', () => {
    expect(t.stance).toBe('押し目待ち');
    expect(t.checkedAt).toBe('07:25');
  });

  it('イベントは「日時｜イベント」の表から。翌日分は日付つき', () => {
    expect(t.events.map((e) => e.label)).toEqual([
      '8月毎月勤労統計・現金給与総額',
      '9月外貨準備高',
      '8月景気先行・一致指数速報',
      '米MBA住宅ローン申請指数',
      '米EIA週間石油在庫',
      '9月FOMC議事要旨',
      '米8月消費者信用残高',
    ]);
    expect(t.events.find((e) => e.label === '9月FOMC議事要旨')).toMatchObject({ date: '2026-10-08', time: '03:00', importance: 'high' });
    expect(t.events[0]).toMatchObject({ time: '08:30' });
    expect(t.events[0]!.date).toBeUndefined();
  });

  it('国内材料は文末の出典名を外す', () => {
    expect(t.domesticNotes.some((n) => n.startsWith('放電精密（6469）'))).toBe(true);
    expect(t.domesticNotes.every((n) => !/株探$/.test(n))).toBe(true);
  });

  it('まとめが無ければ売買方針などは入れない（前日の内容も持ち越さない）', () => {
    const yesterday = buildTodayFromMemo(base, withBrief, { asOf: '2026-10-06' });
    const next = buildTodayFromMemo(yesterday, plain, { asOf: '2026-10-07' });
    expect(yesterday.plan).toBeDefined();
    expect(next.plan).toBeUndefined();
    expect(next.levels).toBeUndefined();
    expect(next.scenarios).toEqual(yesterday.scenarios);
  });
});

describe('SwingScout用まとめ', () => {
  const brief = parseMemoBrief(withBrief, 2026)!;

  it('本文とまとめを分ける（まとめは本文の見出し・要確認に混ぜない）', () => {
    const { body, block } = splitMemoBrief(withBrief);
    expect(block?.[0]).toBe('対象日：2026-10-07');
    expect(body).not.toMatch(/SwingScout/);
    expect(parseMarketMemo(withBrief).sections.map((s) => s.heading)).not.toContain('SwingScout');
  });

  it('銘柄・セクター・条件', () => {
    expect(brief.picks.map((p) => `${p.role}:${p.code}`)).toEqual([
      'main:5803', 'main:5801', 'confirm:6857', 'wait:285A', 'wait:8035', 'wait:7735',
    ]);
    expect(brief.sectorStances).toEqual([
      { sector: '光通信・電線', stance: 'priority' },
      { sector: 'AI半導体・電子部品', stance: 'select' },
      { sector: 'メモリ・製造装置', stance: 'caution' },
    ]);
    expect(brief.invalidation).toMatch(/^海外光通信株が強いのに/);
  });

  it('節目は高い順、指標・関連株・PTS・材料・イベント・未確認', () => {
    expect(brief.levels.map((l) => l.price)).toEqual([70798.62, 70683.98, 70305.89, 70000, 69813.16]);
    expect(brief.quotes).toHaveLength(11);
    expect(brief.quotes.find((q) => q.id === 'usdjpy')).toMatchObject({ changeUnknown: true, note: '4:28時点' });
    expect(brief.relatedStocks.find((s) => s.name === 'Lam Research')).toEqual({ group: '製造装置', name: 'Lam Research', changePct: -3.44 });
    expect(brief.pts[2]).toEqual({ name: 'キオクシア', code: '285A', price: 18725.5, changePct: -0.05 });
    expect(brief.catalysts[2]).toMatchObject({ code: '6469', impact: 'positive' });
    expect(brief.events.find((e) => e.label === '9月FOMC議事要旨')).toMatchObject({ date: '2026-10-08', time: '03:00', importance: 'high' });
    expect(brief.unconfirmed).toContain('SOX終値');
  });

  it('書式の揺れ（箇条書き・太字・半角コロン・全角かっこ）も読む', () => {
    const b = parseMemoBrief(
      ['【SwingScout】', '- **本線**: フジクラ（5803）, 古河電工(5801)', '・待機：キオクシア', '指標：ダウ | 51,521.28 | ＋0.49％', '【SwingScout ここまで】'].join('\n'),
    )!;
    expect(b.picks).toEqual([
      { name: 'フジクラ', code: '5803', role: 'main' },
      { name: '古河電工', code: '5801', role: 'main' },
      { name: 'キオクシア', role: 'wait' },
    ]);
    expect(b.quotes[0]).toMatchObject({ id: 'dow', value: 51521.28, changePct: 0.49 });
  });

  it('まとめが無ければ null', () => {
    expect(parseMemoBrief(plain)).toBeNull();
  });

  it('Today ではまとめを優先し、無い項目は本文から', () => {
    const t = buildTodayFromMemo(base, withBrief, { asOf: '2026-10-07' });
    expect(t.headline).toBe('光通信・電線の押し目反発を優先。半導体は選別し、寄り直後の急騰は追わない');
    expect(t.plan?.picks).toHaveLength(6);
    expect(t.expectedOpen).toMatchObject({ label: 'ややGU', gapPct: 0.31, note: '市況メモのまとめ' });
    expect(t.positionSize).toEqual({ label: '通常サイズ', reason: 'VIX低下。ただし今夜FOMC議事要旨' });
    expect(t.unconfirmed).toContain('SOX終値');
    // まとめの「材料」と同じ銘柄は国内材料に重ねて出さない
    expect(t.domesticNotes.some((n) => n.includes('6469'))).toBe(false);
  });
});

describe('まとめだけのメモ（ChatGPT の実際の出力）', () => {
  const raw = readFileSync('tests/fixtures/market-memo-brief-only-2026-10-07.md', 'utf8');
  const t = buildTodayFromMemo(base, raw, { asOf: '2026-10-07' });

  it('補足欄の「限月未確認」では指標を捨てない', () => {
    expect(t.unconfirmed).not.toContain('日経先物');
    expect(quote(t, 'nikkeiFuture')).toMatchObject({ value: 71070, changePct: 0.24 });
  });

  it('同じ指標が2行あれば1行目を代表にし、2行目も残す', () => {
    expect(t.externalQuotes.map((q) => q.id).slice(0, 3)).toEqual(['nikkeiFuture', 'nikkeiFuture-2', 'nikkei225']);
    expect(quote(t, 'nikkeiFuture-2')?.value).toBe(70905);
  });

  it('まとめに想定寄りが無ければ未確認（先物と現物の差は参考として添えるだけ）', () => {
    expect(t.expectedOpen).toMatchObject({ label: '未確認', unconfirmed: true });
    // 71,070 ÷ 70,683.98 − 1 ＝ +0.55%
    expect(t.expectedOpen.note).toBe('参考：日経先物 71,070 と前日の現物終値 70,683.98 の差は +0.55%（予測には使っていません）');
  });

  it('想定寄りが未確認なら、シナリオを強調せず、寄り追いにもしない（寄った後に実際の寄りで判定）', () => {
    const swing = analyzeDataset(validateDataset(JSON.parse(readFileSync('data/2026-10-06.json', 'utf8'))));
    const before = analyzeToday({ ...t, stance: '買い目線' }, swing);
    expect(before.open).toEqual({ basis: 'unknown', gapPct: null, label: '未確認' });
    expect(before.likelyScenarioId).toBeNull();
    expect(before.watchlist.every((w) => w.action !== 'chase-ok')).toBe(true);
    expect(before.watchlist[0]!.reason).toMatch(/想定寄りが未確認/);
    const after = analyzeToday({ ...t, stance: '買い目線', actualOpen: { gapPct: 0.1, source: 'input', at: 'x' } }, swing);
    expect(after.open.basis).toBe('actual');
    expect(after.likelyScenarioId).toBe('flat-small-gap');
    expect(after.expectedScenarioId).toBeNull();
  });

  it('まとめが無い古い形式のメモは、これまでどおり先物から推定する', () => {
    expect(buildTodayFromMemo(base, plain, { asOf: '2026-10-07' }).expectedOpen).toMatchObject({ label: 'ややGU', gapPct: 0.31 });
  });

  it('未確認の「10/6」のような日付は区切らない', () => {
    expect(t.unconfirmed).toContain('SOXの10/6終値');
    expect(t.unconfirmed).toHaveLength(15);
  });

  it('未確認は、今日の判断に関わるもの（想定寄り・SOX・VI・CFD・ADR・メモの銘柄）と参考に分ける', () => {
    const swing = analyzeDataset(validateDataset(JSON.parse(readFileSync('data/2026-10-06.json', 'utf8'))));
    const { important, other } = analyzeToday(t, swing).unconfirmed;
    expect(important).toEqual(['想定寄りの騰落率', 'SOXの10/6終値', '日経VI', '最新日経CFD', '最新ADR東証比', 'フジクラPTS出来高']);
    expect(other).toContain('TOKYO PRO Market新規上場');
    expect(other).toContain('騰落レシオ');
    expect(important.length + other.length).toBe(15);
    // メモの銘柄はコードでも拾う
    expect(classifyUnconfirmed(['5803の出来高'], [{ code: '5803', name: 'フジクラ' }]).important).toEqual(['5803の出来高']);
  });

  it('金利は「5.28%｜-2bp」を値と差として読む', () => {
    expect(quote(t, 'us10y')).toMatchObject({ value: 5.28, change: -0.02 });
  });
});

describe('市況メモの銘柄と監視銘柄', () => {
  const swing = analyzeDataset(validateDataset(JSON.parse(readFileSync('data/2026-10-06.json', 'utf8'))));
  const today = buildTodayFromMemo(base, withBrief, { asOf: '2026-10-07' });

  it('コード、無ければ名前で採点済みの候補に対応づける', () => {
    expect(matchPick({ name: 'アドバン', code: '6857', role: 'confirm' }, swing.ranked)?.name).toBe('アドバンテスト');
    expect(matchPick({ name: '東京エレクトロン', role: 'wait' }, swing.ranked)?.code).toBe('8035');
    expect(matchPick({ name: '存在しない銘柄', role: 'wait' }, swing.ranked)).toBeUndefined();
  });

  it('メモの「避ける」は見送り、「待機」「確認後」は寄り追いにしない', () => {
    const c = swing.top[0]!;
    const chase = { ...judgeWatchItem(c, { today, vi: 15 }), action: 'chase-ok' as const };
    expect(applyMemoRole(chase, 'avoid').action).toBe('skip');
    expect(applyMemoRole(chase, 'wait').action).toBe('wait-pullback');
    expect(applyMemoRole(chase, 'confirm').action).toBe('wait-pullback');
    expect(applyMemoRole(chase, 'main')).toMatchObject({ action: 'chase-ok', memoRole: 'main' });
  });

  it('上位外でもメモの本線・確認後に挙がった銘柄は監視銘柄に加える', () => {
    const t = analyzeToday(today, swing);
    const advantest = t.watchlist.find((w) => w.candidate.code === '6857');
    expect(swing.top.some((c) => c.code === '6857')).toBe(false);
    expect(advantest).toMatchObject({ origin: 'memo', memoRole: 'confirm' });
    // 待機の銘柄（東京エレクトロン）は上位外なので加えない
    expect(t.watchlist.some((w) => w.candidate.code === '8035')).toBe(false);
    expect(t.picks.find((p) => p.code === '8035')?.candidate?.name).toBe('東京エレクトロン');
  });
});

describe('地合いの時点', () => {
  const today = buildTodayFromMemo(base, withBrief, { asOf: '2026-10-07', generatedAt: '2026-10-07T00:00:00.000Z' });
  const mc = marketContextFromToday(today);

  it('Today から作った地合いはメモの日付・セッション、それ以外は候補の基準日', () => {
    expect(marketContextWhen(mc, '2026-10-06')).toBe('10/7(水) 寄り前の市況（07:25確認）');
    expect(marketContextWhen({ ...mc, source: undefined }, '2026-10-06')).toBe('基準日 10/6(火) 引け');
  });

  it('候補を作った後に Today を更新していれば「古い」', () => {
    expect(marketContextOutdated(mc, today)).toBe(false);
    const later = { ...today, session: '前場', meta: { ...today.meta, generatedAt: '2026-10-07T01:30:00.000Z' } };
    expect(marketContextOutdated(mc, later)).toBe(true);
    expect(marketContextOutdated(mc, { ...today, asOf: '2026-10-08' })).toBe(true);
    expect(marketContextOutdated({ ...mc, source: undefined }, later)).toBe(false);
  });
});

describe('実際の寄り', () => {
  const swing = analyzeDataset(validateDataset(JSON.parse(readFileSync('data/2026-10-06.json', 'utf8'))));
  const today = buildTodayFromMemo(base, withBrief, { asOf: '2026-10-07' });
  const close = 70683.98;

  it('金額でも％でも入れられる（金額は前日終値から％を計算）', () => {
    expect(parseActualOpen('71,250', close)).toEqual({ kind: 'price', gapPct: 0.8, price: 71250, basePrice: close });
    expect(parseActualOpen('７１２５０円', close)).toMatchObject({ kind: 'price', gapPct: 0.8 });
    expect(parseActualOpen('+0.8%', close)).toEqual({ kind: 'pct', gapPct: 0.8, price: 71249, basePrice: close });
    expect(parseActualOpen('0.8', close)).toMatchObject({ kind: 'pct', gapPct: 0.8 });
    expect(parseActualOpen('−1.2％', close)).toMatchObject({ kind: 'pct', gapPct: -1.2 });
    expect(parseActualOpen('71250', null)).toHaveProperty('error');
    expect(parseActualOpen('abc', close)).toHaveProperty('error');
    expect(parseActualOpen('40000', close)).toHaveProperty('error');
  });

  it('前日終値は、メモの節目 → 前営業日のスイング地合い → Today の日経平均の順', () => {
    const nikkei = { id: 'nikkei225', label: '日経平均', value: 70000, change: 0, changePct: 0 };
    const mc = swing.dataset.marketContext;
    const withNikkei = { ...swing, dataset: { ...swing.dataset, marketContext: { ...mc, indices: [nikkei, ...mc.indices] } } };
    expect(previousClose(today, withNikkei)).toBe(70683.98); // 節目「昨日終値」
    const { levels: _l, ...noLevels } = today;
    expect(previousClose(noLevels, withNikkei)).toBe(70000); // スイングの基準日（10/6）が Today（10/7）の前営業日
    expect(previousClose({ ...noLevels, asOf: '2026-10-09' }, withNikkei)).toBe(70683.98); // 前営業日でなければ Today の日経平均
  });

  it('入れると、シナリオと監視銘柄の判定が実際の寄りに切り替わる', () => {
    const before = analyzeToday({ ...today, stance: '買い目線' }, swing);
    const after = analyzeToday({ ...today, stance: '買い目線', actualOpen: { gapPct: 1.2, source: 'input', at: 'x' } }, swing);
    expect(before.open).toMatchObject({ basis: 'expected', gapPct: 0.31 });
    expect(after.open).toEqual({ basis: 'actual', gapPct: 1.2, label: '大幅GU' });
    expect(after.likelyScenarioId).toBe('large-gap-up');
    expect(after.expectedScenarioId).toBe('flat-small-gap');
    const c = swing.top[0]!;
    expect(judgeWatchItem(c, { today: { ...today, stance: '買い目線', actualOpen: { gapPct: 1.2, source: 'input', at: 'x' } }, vi: 15 }).reason).toMatch(
      /寄り\+1\.2%が許容/,
    );
  });

  it('前場のメモの「寄り付き」から読む（金額だけなら前日終値から計算）', () => {
    const memo = (line: string) => withBrief.replace('【SwingScout ここまで】', `${line}\n【SwingScout ここまで】`);
    expect(buildTodayFromMemo(base, memo('寄り付き：71532 +1.20%'), { asOf: '2026-10-07' }).actualOpen).toMatchObject({
      gapPct: 1.2,
      price: 71532,
      source: 'memo',
    });
    expect(buildTodayFromMemo(base, memo('寄り付き：71,250円'), { asOf: '2026-10-07' }).actualOpen).toMatchObject({ gapPct: 0.8, price: 71250 });
  });

  it('同じ日にメモを貼り直しても、画面で入れた値は残す（翌日のメモでは消える）', () => {
    const entered = { ...today, actualOpen: { gapPct: 0.5, source: 'input' as const, at: 'x' } };
    expect(buildTodayFromMemo(entered, withBrief, { asOf: '2026-10-07' }).actualOpen?.gapPct).toBe(0.5);
    expect(buildTodayFromMemo(entered, withBrief, { asOf: '2026-10-08' }).actualOpen).toBeUndefined();
  });
});

describe('今週の見通し', () => {
  const memo = (line: string) => withBrief.replace('【SwingScout ここまで】', `${line}\n【SwingScout ここまで】`);

  it('まとめの「今週」をスイングの地合いの「今週」に入れる', () => {
    const today = buildTodayFromMemo(base, memo('今週：10/9のSQとFOMC議事要旨を通過するまでは、指数より個別の強弱を優先'), { asOf: '2026-10-07' });
    expect(today.weekOutlook).toBe('10/9のSQとFOMC議事要旨を通過するまでは、指数より個別の強弱を優先');
    expect(marketContextFromToday(today).summaryWeek).toBe(today.weekOutlook);
  });

  it('無ければ空のまま（今日の結論で埋めない）', () => {
    const mc = marketContextFromToday(buildTodayFromMemo(base, withBrief, { asOf: '2026-10-07' }));
    expect(mc.summaryWeek).toBe('');
    expect(mc.summaryToday).toBe(mc.headline);
  });
});
