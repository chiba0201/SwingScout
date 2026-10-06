/**
 * Today：今日の寄り前・場中判断のための画面。
 * スイング（火曜In金曜Out）とは時間軸が違うので、データは data/today-market.json と市況メモを使う。
 * 判定は src/lib/todayAnalysis.ts、ここは表示だけ。
 */
import { QuoteGrid } from '../components/QuoteGrid';
import { TodayMemoDetails } from '../components/TodayMemo';
import { TodayScenario } from '../components/TodayScenario';
import { TodaySummary } from '../components/TodaySummary';
import { TodayWatchlist } from '../components/TodayWatchlist';
import { cx, PageTitle, Panel } from '../components/ui';
import { IMPORTANCE_LABELS } from '../lib/market';
import type { TodayAnalysis } from '../lib/todayAnalysis';
import { useData } from '../state/DataContext';

function EventsPanel({ events }: { events: TodayAnalysis['events'] }) {
  return (
    <Panel title="今日の重要イベント" bodyClassName="p-0">
      {events.length === 0 ? (
        <p className="px-4 py-3 text-[12.5px] text-muted">登録されたイベントはありません。</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-16">時刻</th>
              <th>イベント</th>
              <th className="w-14">重要度</th>
              <th>影響メモ</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={`${e.label}-${i}`} className="align-top">
                <td className="num text-ink-2">{e.time ?? '—'}</td>
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
 *   1. 今日の結論 → 2. 外部指標 → 3. 今日の監視銘柄 → 4. 寄り付きシナリオ
 *   → 5. 今日の重要イベント / 国内材料 → 6. 市況メモ詳細（既定で閉じる）
 */
export function TodayPage() {
  const { todayLoad, todayAnalysis: t, reload } = useData();

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

      {todayLoad.status === 'error' && !t && (
        <div className="panel px-5 py-4" role="alert">
          <p className="font-bold">今日の市況データを読み込めませんでした</p>
          <p className="mt-1 text-[13px] text-ink-2">{todayLoad.error.message}</p>
          {'hint' in todayLoad.error && typeof todayLoad.error.hint === 'string' && (
            <p className="mt-1 text-[13px] text-ink-2">{todayLoad.error.hint}</p>
          )}
          <p className="mt-2 text-[13px] text-ink-2">市況メモの貼り付けは、このデータが無くても使えます（下の「市況メモ詳細」）。</p>
          <button type="button" className="btn mt-3" onClick={reload}>
            再読み込み
          </button>
        </div>
      )}

      {t && (
        <>
          {/* 1. 今日の結論 */}
          <TodaySummary analysis={t} />

          {/* 2. 外部指標 */}
          <QuoteGrid
            quotes={t.today.externalQuotes}
            columns="grid-cols-2 sm:grid-cols-4 lg:grid-cols-8"
            label="外部指標"
          />

          {/* 3. 今日の監視銘柄 */}
          <TodayWatchlist items={t.watchlist} />

          {/* 4. 寄り付きシナリオ（監視銘柄の判断を、行動ルールとして確認する） */}
          <TodayScenario scenarios={t.today.scenarios} likelyId={t.likelyScenarioId} />

          {/* 5. 今日の重要イベント / 国内材料 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
            <EventsPanel events={t.events} />
            <Panel title="国内材料・ニュースメモ">
              {t.today.domesticNotes.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 text-[13px]">
                  {t.today.domesticNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] text-muted">メモはありません。</p>
              )}
            </Panel>
          </div>
        </>
      )}

      {/* 6. 市況メモ詳細（編集・監査用。today-market.json が無くても使えるので、その場合は開いておく） */}
      {todayLoad.status !== 'loading' && <TodayMemoDetails defaultOpen={todayLoad.status === 'error'} />}
    </div>
  );
}
