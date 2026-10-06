/**
 * モックの地合いデータ。数値はすべて架空。
 * イベント日付は保有ウィンドウからの相対で作るので、どの基準日でも「その週」の形になる。
 */
import { addDays, computeHoldingWindow, formatDateJa, type HoldingPattern } from '../../../src/lib/calendar';
import type { ISODate, MarketContext } from '../../../src/types/dataset';

export function buildMockMarketContext(asOf: ISODate, pattern: HoldingPattern): MarketContext {
  const w = computeHoldingWindow(asOf, pattern);
  const [mon, tue, wed, thu] = w.weekDays as [ISODate, ISODate, ISODate, ISODate, ISODate];
  const riskNotes = ['米長期金利が上昇基調。グロース株・高PER銘柄は上値が重くなりやすい'];
  if (w.closedDaysAfterExit > 2) {
    riskNotes.push(`OUT日の後は${w.closedDaysAfterExit}日間休場（次の営業日は${formatDateJa(w.nextOpenAfterExit)}）。連休前の手仕舞い売りに注意`);
  }

  return {
    stance: 'neutral',
    headline: '指数は高値圏。ただし日経VIが上昇しており、上値追いより押し目待ちが基本',
    summaryToday:
      '半導体・電機が主導して日経平均は反発。TOPIXも続伸したが、グロース250は小幅安で物色は大型株に偏った。',
    summaryWeek:
      '週央の米FOMC議事録と週末のSQを控え、指数は方向感が出にくい想定。個別の材料株と、出来高を伴う高値ブレイクを中心に短期で回転させる。',
    indices: [
      { id: 'nikkei225', label: '日経平均', value: 48320.55, change: 562.3, changePct: 1.18, weekChangePct: 2.1, decimals: 0, polarity: 'up-good' },
      { id: 'topix', label: 'TOPIX', value: 3215.4, change: 26.1, changePct: 0.82, weekChangePct: 1.4, decimals: 1, polarity: 'up-good' },
      { id: 'growth250', label: 'グロース250', value: 742.3, change: -2.6, changePct: -0.35, weekChangePct: -0.8, decimals: 1, polarity: 'up-good' },
      { id: 'sp500', label: 'S&P500', value: 6890.2, change: 28.1, changePct: 0.41, decimals: 1, polarity: 'up-good' },
      { id: 'nasdaq', label: 'NASDAQ', value: 23410.8, change: 151.3, changePct: 0.65, decimals: 1, polarity: 'up-good' },
      { id: 'sox', label: 'SOX指数', value: 6420.5, change: 116.6, changePct: 1.85, decimals: 1, polarity: 'up-good' },
    ],
    volatility: [
      { id: 'nikkeiVI', label: '日経VI', value: 22.84, change: 1.62, changePct: 7.63, decimals: 2, polarity: 'up-bad' },
      { id: 'vix', label: 'VIX', value: 17.2, change: -0.4, changePct: -2.27, decimals: 2, polarity: 'up-bad' },
    ],
    fx: [
      { id: 'usdjpy', label: 'ドル円', value: 149.82, change: 0.45, changePct: 0.3, weekChangePct: 1.15, decimals: 2, unit: '円', polarity: 'neutral' },
      { id: 'eurjpy', label: 'ユーロ円', value: 174.15, change: 0.22, changePct: 0.13, decimals: 2, unit: '円', polarity: 'neutral' },
    ],
    rates: [
      { id: 'us10y', label: '米10年債', value: 4.12, change: 0.03, changePct: 0.73, decimals: 2, unit: '%', polarity: 'neutral' },
      { id: 'jgb10y', label: '日本10年債', value: 1.65, change: 0.01, changePct: 0.61, decimals: 2, unit: '%', polarity: 'neutral' },
    ],
    events: [
      { date: mon, time: '23:00', label: '米ISM非製造業景況指数', category: 'us-macro', importance: 'medium' },
      { date: tue, time: '08:30', label: '毎月勤労統計', category: 'jp-macro', importance: 'low' },
      { date: wed, time: '14:00', label: '景気動向指数（速報）', category: 'jp-macro', importance: 'low' },
      { date: thu, time: '03:00', label: '米FOMC議事録', category: 'central-bank', importance: 'high', note: '利下げペースへの言及に注目' },
      { date: thu, time: '08:50', label: '機械受注', category: 'jp-macro', importance: 'medium' },
      { date: thu, time: '21:30', label: '米新規失業保険申請件数', category: 'us-macro', importance: 'low' },
      { date: addDays(w.nextOpenAfterExit, 1), time: '21:30', label: '米CPI', category: 'us-macro', importance: 'high', note: '翌週。持ち越さない前提なら影響なし' },
    ],
    sectors: [
      { sector: '電気機器', changePct: 2.1 },
      { sector: '機械', changePct: 1.8 },
      { sector: '銀行業', changePct: 1.2 },
      { sector: '輸送用機器', changePct: 0.9 },
      { sector: '化学', changePct: 0.6 },
      { sector: '情報・通信業', changePct: 0.4 },
      { sector: 'サービス業', changePct: 0.1 },
      { sector: '食料品', changePct: -0.2 },
      { sector: '卸売業', changePct: -0.3 },
      { sector: '医薬品', changePct: -0.6 },
      { sector: '不動産業', changePct: -0.9 },
      { sector: '海運業', changePct: -1.4 },
    ],
    riskNotes,
  };
}
