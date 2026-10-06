import { Link, useParams } from 'react-router';
import { Change, KeyValueGrid, Panel, ScoreBar, Value, WarningTagView } from '../components/ui';
import { formatDateJa } from '../lib/calendar';
import { formatPct, formatPrice, formatScore } from '../lib/format';
import { CATEGORY_LABELS } from '../lib/scoring';
import { useFavoritesAnalysis } from '../state/useFavoritesAnalysis';
import type { ScoreCategory } from '../types/dataset';

const CATS: ScoreCategory[] = ['supplyDemand', 'technical', 'event', 'risk'];

export function FavoriteDetailPage() {
  const { code } = useParams();
  const { load, analysis, reload } = useFavoritesAnalysis();

  if (load.status === 'loading') return <p className="py-16 text-center text-muted">お気に入りを読み込んでいます…</p>;
  if (load.status === 'error' || !analysis) {
    return (
      <div className="panel mx-auto max-w-xl px-5 py-4">
        <p className="font-bold text-ink">お気に入りデータを読み込めませんでした</p>
        <p className="mt-1 text-[13px] text-ink-2">
          {load.status === 'error' ? load.error.message : '分析を作成できませんでした。'}
        </p>
        <button type="button" className="btn mt-3" onClick={reload}>
          再読み込み
        </button>
      </div>
    );
  }

  const c = analysis.ranked.find((x) => x.code === code);
  if (!c) {
    return (
      <div className="panel mx-auto mt-6 max-w-lg px-5 py-4">
        <p className="font-bold">銘柄 {code} はお気に入りにありません</p>
        <Link to="/favorites" className="mt-2 inline-block text-[13px] font-semibold text-accent hover:underline">
          お気に入りへ戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <nav className="text-[12px]" aria-label="戻る">
        <Link to="/favorites" className="font-semibold text-accent hover:underline">
          ← お気に入り
        </Link>
      </nav>

      <section className="panel px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <span className="rounded-sm bg-accent px-1.5 py-px font-bold text-panel">{c.rank}位</span>
              <span>{c.market}</span>
              <span>{c.sector}</span>
              <span>テーマ：{c.theme}</span>
            </div>
            <h1 className="mt-1 text-[22px] leading-tight font-bold tracking-tight">
              <span className="num mr-2 text-[17px] font-medium text-ink-2">{c.code}</span>
              {c.name}
            </h1>
            {c.warnings.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {c.warnings.map((w) => (
                  <li key={`${w.id}-${w.label}`}>
                    <WarningTagView tag={w} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="text-right">
            <div className="text-[11px] text-muted">終値（{formatDateJa(analysis.dataset.asOf)}）</div>
            <div className="text-[22px] leading-tight font-semibold">{formatPrice(c.price.close)}</div>
            <Change value={c.price.change} pct={c.price.changePct} digits={Number.isInteger(c.price.change) ? 0 : 1} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="お気に入り分析">
          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-muted">総合スコア</span>
                <span className="num text-[26px] font-bold">{formatScore(c.scores.total)}</span>
              </div>
              <ScoreBar value={c.scores.total} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {CATS.map((cat) => (
                <div key={cat}>
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="text-ink-2">{CATEGORY_LABELS[cat]}</span>
                    <span className="num font-semibold">{formatScore(c.scores[cat])}</span>
                  </div>
                  <ScoreBar value={c.scores[cat]} tone={cat === 'risk' ? 'caution' : 'accent'} className="mt-1" />
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="価格・需給">
          <KeyValueGrid
            rows={[
              { label: '前日比', value: formatPct(c.price.changePct) },
              { label: '売買代金', value: <Value value={c.volume.turnoverOku} digits={1} unit="億円" /> },
              {
                label: '信用倍率',
                value: c.margin ? <Value value={c.margin.buyBalance / Math.max(1, c.margin.sellBalance)} digits={2} unit="倍" /> : '未取得',
              },
              { label: '決算予定', value: c.earnings.nextDate ? formatDateJa(c.earnings.nextDate) : '未定' },
            ]}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="コメント">
          <div className="space-y-3 text-[13px] leading-relaxed">
            <p><span className="font-bold text-ink-2">需給：</span>{c.comments.supplyDemand || '—'}</p>
            <p><span className="font-bold text-ink-2">テクニカル：</span>{c.comments.technical || '—'}</p>
            <p><span className="font-bold text-ink-2">ファンダ：</span>{c.comments.fundamental || '—'}</p>
          </div>
        </Panel>
        <Panel title="作戦">
          <div className="space-y-3 text-[13px] leading-relaxed">
            <p><span className="font-bold text-ink-2">入り方：</span>{c.entryPlan.method}</p>
            <p><span className="font-bold text-down">損切り：</span>{formatPrice(c.stopLoss.price)}円。{c.stopLoss.rule}</p>
            <p><span className="font-bold text-up">利確：</span>{c.takeProfit.rule}</p>
            <p><span className="font-bold text-ink-2">見送り：</span>{c.risks.skipConditions.join(' ／ ') || '—'}</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
