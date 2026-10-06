import { CandidateTable } from '../components/CandidateTable';
import { PageTitle } from '../components/ui';
import { formatDateJa } from '../lib/calendar';
import { useData } from '../state/DataContext';
import { useFavoritesAnalysis } from '../state/useFavoritesAnalysis';

function FavoritesError({ message, hint, reload }: { message: string; hint?: string; reload: () => void }) {
  return (
    <div className="panel mx-auto max-w-2xl px-5 py-4">
      <p className="font-bold text-ink">お気に入りデータを読み込めませんでした</p>
      <p className="mt-1 text-[13px] text-ink-2">{message}</p>
      {hint && <p className="mt-2 text-[13px] text-ink-2">{hint}</p>}
      <div className="mt-3 rounded border border-rule bg-panel-2 px-3 py-2 text-[12px] text-ink-2">
        <p className="font-semibold">作り方</p>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed">{`cp examples/real-data/watchlist.csv raw-data/watchlist.csv
npm run prices:yahoo -- --watchlist raw-data/watchlist.csv --years 2
npm run data:favorites`}</pre>
      </div>
      <button type="button" className="btn mt-3" onClick={reload}>
        再読み込み
      </button>
    </div>
  );
}

export function FavoritesPage() {
  const { load, analysis, reload } = useFavoritesAnalysis();
  const { favoritesOverride, setFavoritesOverride } = useData();

  if (load.status === 'loading') {
    return <p className="py-16 text-center text-muted">お気に入りを読み込んでいます…</p>;
  }
  if (load.status === 'error' || !analysis) {
    const hint = load.status === 'error' && 'hint' in load.error ? (load.error as { hint?: string }).hint : undefined;
    const message = load.status === 'error' ? load.error.message : 'お気に入り分析を作成できませんでした。';
    return <FavoritesError message={message} hint={hint} reload={reload} />;
  }

  return (
    <div className="space-y-4">
      <PageTitle title="お気に入り">
        <span className="text-[12px] text-muted">
          <span className="num">{formatDateJa(analysis.dataset.asOf)}</span> 基準 ・ 全
          <span className="num">{analysis.ranked.length}</span>件
        </span>
      </PageTitle>

      <section className="panel px-4 py-3">
        <p className="text-[13px] leading-relaxed text-ink-2">
          `raw-data/watchlist.csv` のお気に入り・注目銘柄だけを、現在のスコア配分と保有パターンで再評価しています。
          代表銘柄スクリーニングとは別枠なので、今見ているデータセットを切り替えなくても確認できます。
        </p>
        {favoritesOverride && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-accent">
            <span className="font-bold">ブラウザ生成のお気に入りデータを表示中</span>
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setFavoritesOverride(null)}>
              解除
            </button>
          </div>
        )}
      </section>

      <section className="panel overflow-hidden" aria-label="お気に入り一覧">
        <CandidateTable candidates={analysis.ranked} detailBasePath="/favorites" />
      </section>
    </div>
  );
}
