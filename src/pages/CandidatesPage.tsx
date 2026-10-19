/**
 * 候補一覧。ページ内のタブで3つの一覧を切り替える。
 *   スイング候補 … スコア上位N件（今週の候補）
 *   お気に入り   … 銘柄リストの favorite 列で選んだ銘柄。順位は全銘柄の中での順位
 *   全銘柄       … 銘柄リストのすべて。★でお気に入りを付け外しする（右寄せ：管理用のタブ）
 * タブは URL（?tab=favorites / ?tab=all）に持たせて、直リンク・再読み込みでも同じタブを開く。
 */
import { useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CandidateTable } from '../components/CandidateTable';
import { cx, PageTitle } from '../components/ui';
import { UniverseTable } from '../components/UniverseTable';
import { WeightsPanel } from '../components/WeightsPanel';
import { formatDateJa } from '../lib/calendar';
import { readUniverseEntries } from '../lib/universeCsv';
import { buildUniverseRows, FAVORITE_UNSCORED_HINT, type UniverseListRow } from '../lib/universeRows';
import { useAnalysis, useData } from '../state/DataContext';

type Tab = 'swing' | 'favorites' | 'all';

const TABS: { id: Tab; label: string }[] = [
  { id: 'swing', label: 'スイング候補' },
  { id: 'favorites', label: 'お気に入り' },
  { id: 'all', label: '全銘柄' },
];

function parseTab(value: string | null): Tab {
  return value === 'favorites' || value === 'all' ? value : 'swing';
}

function TabCount({ children }: { children: ReactNode }) {
  return (
    <span className="num ml-1.5 rounded-full bg-panel-2 px-1.5 py-px text-[11px] font-semibold text-ink-2">{children}</span>
  );
}

// ---------------------------------------------------------------------------
// スイング候補
// ---------------------------------------------------------------------------

function SwingTab({ showAll }: { showAll: () => void }) {
  const a = useAnalysis();

  if (a.ranked.length === 0) {
    return (
      <section className="panel px-5 py-4">
        <p className="font-bold">候補がありません</p>
        <p className="mt-1 text-[13px] text-ink-2">
          日足がそろっていないか、売買代金・株価の条件を満たす銘柄がありませんでした。
          データ更新で日足を確認してから、もう一度候補を作ってください。
        </p>
        <Link to="/data-update" className="btn mt-3">
          データ更新へ
        </Link>
      </section>
    );
  }

  const rest = a.ranked.length - a.top.length;
  return (
    <>
      <p className="text-[12px] text-muted">
        <span className="num">{formatDateJa(a.dataset.asOf)}</span>引け ・ 採点した<span className="num">{a.ranked.length}</span>
        銘柄のうち上位<span className="num">{a.top.length}</span>件
      </p>
      <section className="panel overflow-hidden" aria-label="スイング候補の一覧">
        <CandidateTable candidates={a.top} />
      </section>
      {rest > 0 && (
        <p className="text-[12px] text-ink-2">
          <span className="num">{a.top.length + 1}</span>位以降の<span className="num">{rest}</span>銘柄は
          <button type="button" className="mx-0.5 font-semibold text-accent hover:underline" onClick={showAll}>
            全銘柄
          </button>
          タブで見られます。
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// お気に入り
// ---------------------------------------------------------------------------

function FavoritesTab({ rows, showAll }: { rows: UniverseListRow[]; showAll: () => void }) {
  const a = useAnalysis();
  const favRows = rows.filter((r) => r.favorite);
  const scored = favRows
    .map((r) => r.candidate)
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((x, y) => x.rank - y.rank);
  const unscored = favRows.filter((r) => !r.candidate);

  if (favRows.length === 0) {
    return (
      <section className="panel px-5 py-4">
        <p className="font-bold text-ink">お気に入りがまだありません</p>
        <p className="mt-1 text-[13px] text-ink-2">
          「全銘柄」タブで銘柄の ☆ を押すと、お気に入りになります。お気に入りは売買代金・株価の条件に関係なく採点されます。
        </p>
        <button type="button" className="btn btn-primary mt-3" onClick={showAll}>
          全銘柄から選ぶ
        </button>
      </section>
    );
  }

  return (
    <>
      <p className="text-[12px] text-muted">
        <span className="num">{formatDateJa(a.dataset.asOf)}</span>引け ・ 順位は採点した
        <span className="num">{a.ranked.length}</span>銘柄の中での順位。上位<span className="num">{a.top.length}</span>
        位までが今週の候補です
      </p>
      {scored.length > 0 && (
        <section className="panel overflow-hidden" aria-label="お気に入りの一覧">
          <CandidateTable candidates={scored} dimFrom={a.top.length + 1} />
        </section>
      )}
      {unscored.length > 0 && (
        <section className="panel overflow-hidden" aria-labelledby="fav-unscored">
          <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-rule px-4 py-2">
            <h2 id="fav-unscored" className="text-[12.5px] font-bold text-ink">
              採点できていないお気に入り
              <span className="num ml-1.5 font-semibold text-muted">{unscored.length}</span>
            </h2>
            <Link to="/data-update" className="text-[12px] font-semibold text-accent hover:underline">
              データ更新で日足を取得して生成し直す →
            </Link>
          </header>
          <ul className="divide-y divide-rule">
            {unscored.map((r) => (
              <li key={r.code} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2 text-[13px]">
                <span className="font-semibold text-ink">
                  <span className="num mr-1.5 text-[12px] font-medium text-ink-2">{r.code}</span>
                  {r.name}
                </span>
                <span className="text-[12px] text-muted">
                  {r.status === 'top' || r.status === 'scored'
                    ? '採点済みですが、表示中のデータに詳細がありません。データ更新で生成し直してください'
                    : FAVORITE_UNSCORED_HINT[r.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 全銘柄
// ---------------------------------------------------------------------------

function AllTab({ rows }: { rows: UniverseListRow[] }) {
  const { universeUpdatedAt } = useData();
  return (
    <>
      <p className="text-[12px] leading-relaxed text-muted">
        ★はこのブラウザの銘柄リスト（favorite 列）に保存されます。公開サイトに反映するには、
        <Link to="/data-update" className="mx-0.5 font-semibold text-accent hover:underline">
          データ更新
        </Link>
        で候補を生成して JSON を保存・アップロードしてください。
        {!universeUpdatedAt && ' 銘柄リストの入れ替え（CSVの入稿）もデータ更新で行えます。'}
      </p>
      <UniverseTable rows={rows} />
    </>
  );
}

// ---------------------------------------------------------------------------
// ページ
// ---------------------------------------------------------------------------

const DESCRIPTION: Record<Tab, string> = {
  swing: '銘柄リストからスコア順に選んだ今週の候補です。',
  favorites: 'お気に入りにした銘柄を、スイング候補と同じ基準で採点しています。',
  all: '銘柄リストのすべての銘柄と採点の状況です。☆を押してお気に入りを付け外しできます。',
};

export function CandidatesPage() {
  const a = useAnalysis();
  const { universeCsv } = useData();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ swing: null, favorites: null, all: null });

  const rows = useMemo(
    () => buildUniverseRows(readUniverseEntries(universeCsv), a.ranked, a.top.length, a.dataset.universe),
    [universeCsv, a.ranked, a.top.length, a.dataset.universe],
  );
  const favoriteCount = useMemo(() => rows.filter((r) => r.favorite).length, [rows]);

  const selectTab = (next: Tab) => setParams(next === 'swing' ? {} : { tab: next }, { replace: true });
  const showAll = () => selectTab('all');

  // ← → キーでタブを移動（WAI-ARIA のタブの作法）
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!.id;
    selectTab(next);
    tabRefs.current[next]?.focus();
  };

  const counts: Record<Tab, number> = { swing: a.top.length, favorites: favoriteCount, all: rows.length };

  return (
    <div className="space-y-4">
      <PageTitle title="候補一覧">
        <span className="text-[12px] text-muted">
          {a.window.pattern.label} ・ <span className="num">{formatDateJa(a.window.entryDate)}</span>〜
          <span className="num">{formatDateJa(a.window.exitDate)}</span>
        </span>
      </PageTitle>

      {/* スコア配分はすべてのタブに効くので、タブより上に置く */}
      <WeightsPanel />

      <div>
        <div role="tablist" aria-label="一覧の切り替え" className="flex gap-0.5 border-b border-rule sm:gap-1" onKeyDown={onKeyDown}>
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={active}
                aria-controls={`tabpanel-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => selectTab(t.id)}
                className={cx(
                  '-mb-px flex items-center border-b-2 px-2 py-2 text-[13px] font-bold whitespace-nowrap transition-colors sm:px-4 sm:text-[13.5px]',
                  // 全銘柄は管理用のタブなので右に離す
                  t.id === 'all' && 'ml-auto',
                  active ? 'border-accent text-accent' : 'border-transparent text-ink-2 hover:text-ink',
                )}
              >
                {t.label}
                <TabCount>{counts[t.id]}</TabCount>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12.5px] text-ink-2">{DESCRIPTION[tab]}</p>
      </div>

      <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-3">
        {tab === 'swing' && <SwingTab showAll={showAll} />}
        {tab === 'favorites' && <FavoritesTab rows={rows} showAll={showAll} />}
        {tab === 'all' && <AllTab rows={rows} />}
      </div>

      <p className="text-[11.5px] leading-relaxed text-muted">
        需給・テクニカル・イベントは高いほど良く、リスクは高いほど注意（決算またぎ・急騰翌日・同じ業種の重なりなど）。
        行を押すと銘柄ごとの入り方・損切り・利確の目安を見られます。スコア配分の変更はすべてのタブに反映されます。
      </p>
    </div>
  );
}
