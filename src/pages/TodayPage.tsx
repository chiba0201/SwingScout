/**
 * Today：今日の寄り前・場中判断のための画面。
 * スイング（火曜In金曜Out）とは時間軸が違うので、データは data/today-market.json と市況メモを使う。
 * 判定は src/lib/todayAnalysis.ts、ここは表示だけ。
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { QuoteGrid } from '../components/QuoteGrid';
import { LevelsPanel, RelatedStocksPanel, StockNotes, TodayPlanPanel } from '../components/TodayMemoBoards';
import { TodayMemoDetails, TodayUpdatePanel } from '../components/TodayMemo';
import { TodayScenario } from '../components/TodayScenario';
import { TodaySummary } from '../components/TodaySummary';
import { TodayWatchlist } from '../components/TodayWatchlist';
import { cx, PageTitle, Panel } from '../components/ui';
import { formatDateJa } from '../lib/calendar';
import { IMPORTANCE_LABELS } from '../lib/market';
import type { TodayAnalysis } from '../lib/todayAnalysis';
import { isTodayFresh } from '../lib/workflow';
import { useData } from '../state/DataContext';

function EventsPanel({ events, asOf }: { events: TodayAnalysis['events']; asOf: string }) {
  return (
    <Panel title="今日の重要イベント" bodyClassName="p-0">
      {events.length === 0 ? (
        <p className="px-4 py-3 text-[12.5px] text-muted">登録されたイベントはありません。</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-20">時刻</th>
              <th>イベント</th>
              <th className="w-14">重要度</th>
              <th>影響メモ</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={`${e.label}-${i}`} className="align-top">
                <td className="num whitespace-nowrap text-ink-2">
                  {e.date && e.date !== asOf && <span className="block text-[10.5px] text-muted">{formatDateJa(e.date)}</span>}
                  {e.time ?? '—'}
                </td>
                <td className={cx(e.importance === 'high' ? 'font-semibold' : e.importance === 'low' && 'text-ink-2')}>
                  {e.label}
                  {e.auto && <span className="ml-1.5 text-[10.5px] font-normal text-muted">自動</span>}
                </td>
                <td className="text-[12px] whitespace-nowrap">
                  <span className={cx(e.importance === 'high' ? 'text-caution' : 'text-muted')} aria-hidden>
                    {e.importance === 'high' ? '●' : e.importance === 'medium' ? '○' : '·'}
                  </span>{' '}
                  {IMPORTANCE_LABELS[e.importance]}
                </td>
                <td className="text-[12.5px] text-ink-2">{e.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

/**
 * 表示順は「朝の1分」で判断する順番：
 *   0. 今日の市況を更新（今日の分が反映済みなら1行にたたむ）
 *   1. 今日の結論 → 2. 今日の売買方針（市況メモのまとめがあるとき）→ 3. 外部指標 → 4. 今日の監視銘柄
 *   → 5. 米国の関連株 / 日経の節目（メモにあるとき）→ 6. 寄り付きシナリオ
 *   → 7. 今日の重要イベント / 個別材料・国内材料 → 8. 市況メモ詳細（既定で閉じる）
 */
export function TodayPage() {
  const { todayLoad, todayAnalysis: t, reload } = useData();
  const [params, setParams] = useSearchParams();
  const updateRef = useRef<HTMLElement>(null);
  const loadedToday = t?.today ?? (todayLoad.status === 'ready' ? todayLoad.data : null);
  // 今日の分が無い・古いときは、最初から貼り付け欄を開いておく（?update=1 でも開く）
  const [updateOpen, setUpdateOpen] = useState(() => params.get('update') === '1' || !isTodayFresh(loadedToday?.asOf));

  // 読み込み完了後に古いと分かった場合も開く
  useEffect(() => {
    if (todayLoad.status !== 'loading' && !isTodayFresh(loadedToday?.asOf)) setUpdateOpen(true);
  }, [todayLoad.status, loadedToday?.asOf]);

  // ?update=1 で来たら開いて、パラメータは消す（再読み込みで開き直さないため）
  useEffect(() => {
    if (params.get('update') !== '1') return;
    setUpdateOpen(true);
    setParams({}, { replace: true });
  }, [params, setParams]);

  const openUpdate = () => {
    setUpdateOpen(true);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => updateRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }));
  };

  return (
    <div className="space-y-4">
      <PageTitle title="Today">
        <span className="hidden text-[12px] text-muted sm:inline">
          今日の寄り前・場中の判断用（スイングの火曜In金曜Outとは時間軸が別）
        </span>
        {t?.today.meta.isSample && (
          <span
            className="rounded-sm border border-caution/40 bg-caution-soft px-2 py-0.5 text-[11.5px] text-caution"
            role="note"
          >
            <span className="font-bold">サンプルデータ</span>
            <span className="hidden sm:inline">：指標・ニュース・市況メモはすべて架空です</span>
            <span className="sm:hidden">（架空）</span>
          </span>
        )}
      </PageTitle>

      {todayLoad.status === 'loading' && !t && <p className="py-8 text-center text-muted">今日の市況データを読み込んでいます…</p>}

      {/* 0. 今日の市況を更新（主導線） */}
      {todayLoad.status !== 'loading' && <TodayUpdatePanel open={updateOpen} onOpenChange={setUpdateOpen} panelRef={updateRef} />}

      {todayLoad.status === 'error' && !t && (
        <div className="panel px-5 py-4" role="alert">
          <p className="font-bold">今日の市況データを読み込めませんでした</p>
          <p className="mt-1 text-[13px] text-ink-2">{todayLoad.error.message}</p>
          {'hint' in todayLoad.error && typeof todayLoad.error.hint === 'string' && (
            <p className="mt-1 text-[13px] text-ink-2">{todayLoad.error.hint}</p>
          )}
          <p className="mt-2 text-[13px] text-ink-2">上の「今日の市況を更新」に市況メモを貼れば、このデータが無くても Today を作れます。</p>
          <button type="button" className="btn mt-3" onClick={reload}>
            再読み込み
          </button>
        </div>
      )}

      {t && (
        <>
          {/* 1. 今日の結論 */}
          <TodaySummary analysis={t} />

          {/* 2. 今日の売買方針（本線・待機・撤回条件・セクター） */}
          <TodayPlanPanel analysis={t} />

          {/* 3. 外部指標 */}
          <QuoteGrid quotes={t.today.externalQuotes} label="外部指標" />

          {/* 4. 今日の監視銘柄 */}
          <TodayWatchlist items={t.watchlist} openBasis={t.open.basis} />

          {/* 5. 米国の関連株 / 日経の節目 */}
          {!!(t.today.relatedStocks?.length || t.today.levels?.length || t.today.breadth) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
              <RelatedStocksPanel today={t.today} />
              <LevelsPanel today={t.today} previousClose={t.previousClose} />
            </div>
          )}

          {/* 6. 寄り付きシナリオ（監視銘柄の判断を、行動ルールとして確認する） */}
          <TodayScenario analysis={t} />

          {/* 7. 今日の重要イベント / 個別材料・国内材料 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
            <EventsPanel events={t.events} asOf={t.today.asOf} />
            <Panel title="個別材料・国内材料">
              <div className="space-y-3">
                <StockNotes today={t.today} />
                {t.today.domesticNotes.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-4 text-[13px]">
                    {t.today.domesticNotes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                ) : (
                  !t.today.catalysts?.length && !t.today.pts?.length && <p className="text-[12.5px] text-muted">メモはありません。</p>
                )}
              </div>
            </Panel>
          </div>
        </>
      )}

      {/* 6. 市況メモ詳細（編集・監査用。today-market.json が無くても使えるので、その場合は開いておく） */}
      {todayLoad.status !== 'loading' && <TodayMemoDetails onEdit={openUpdate} />}
    </div>
  );
}
