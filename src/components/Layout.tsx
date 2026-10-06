import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { formatDateJa, HOLDING_PATTERNS } from '../lib/calendar';
import { datasetModeFromSource, datasetOptionLabel } from '../lib/datasetMode';
import { formatDateTime } from '../lib/format';
import { DISCLAIMER } from '../lib/reportGenerator';
import { useData } from '../state/DataContext';
import { cx, DatasetModeBadge, SampleBadge } from './ui';

const NAV = [
  { to: '/', label: 'ダッシュボード', end: true },
  { to: '/today', label: 'Today', end: false },
  { to: '/candidates', label: '候補一覧', end: false },
  { to: '/favorites', label: 'お気に入り', end: false },
  { to: '/data-update', label: 'データ更新', end: false },
  { to: '/report', label: 'レポート', end: false },
];

function Wordmark() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2 text-header-ink" aria-label="SwingScout ダッシュボードへ">
      <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
        <rect width="32" height="32" rx="6" fill="currentColor" opacity=".12" />
        <path d="M6 22h4l4-8 4 5 4-9h4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-mono text-[15px] font-semibold tracking-tight">SwingScout</span>
    </Link>
  );
}

function NavTabs({ className }: { className?: string }) {
  return (
    <nav aria-label="メイン" className={className}>
      <ul className="flex gap-1">
        {NAV.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'block border-b-2 px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-header-ink text-header-ink'
                    : 'border-transparent text-header-muted hover:text-header-ink',
                )
              }
            >
              {n.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const selectClass =
  'rounded border border-header-muted/40 bg-header py-1 pr-1 pl-2 text-[12px] text-header-ink hover:border-header-muted';

function Controls({ className }: { className?: string }) {
  const { manifest, file, selectFile, patternId, setPatternId, datasetOverride } = useData();
  return (
    <div className={cx('flex min-w-0 items-center gap-2', className)}>
      {datasetOverride ? (
        <span className="rounded border border-accent/50 bg-accent-soft px-2 py-1 text-[12px] font-semibold text-accent">
          ブラウザ生成データ
        </span>
      ) : manifest && manifest.datasets.length > 0 ? (
        <label className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
          <span className="hidden text-[11px] text-header-muted lg:inline">データ</span>
          <select
            className={cx(selectClass, 'w-full min-w-0 sm:w-auto sm:max-w-[11rem]')}
            value={file ?? ''}
            onChange={(e) => selectFile(e.target.value)}
            aria-label="データセット"
          >
            {manifest.datasets.map((d) => (
              <option key={d.file} value={d.file}>
                {formatDateJa(d.asOf)} {datasetOptionLabel(d)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
        <span className="hidden text-[11px] text-header-muted lg:inline">保有</span>
        <select
          className={cx(selectClass, 'w-full min-w-0 sm:w-auto')}
          value={patternId}
          onChange={(e) => setPatternId(e.target.value)}
          aria-label="保有パターン"
        >
          {HOLDING_PATTERNS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function StatusView() {
  const { load, reload } = useData();
  if (load.status === 'loading') {
    return <p className="py-16 text-center text-muted">データを読み込んでいます…</p>;
  }
  if (load.status === 'error') {
    const hint = 'hint' in load.error ? (load.error as { hint?: string }).hint : undefined;
    return (
      <div className="panel mx-auto mt-8 max-w-xl px-5 py-4" role="alert">
        <p className="font-bold text-ink">データを読み込めませんでした</p>
        <p className="mt-1 text-[13px] text-ink-2">{load.error.message}</p>
        {hint && <p className="mt-2 text-[13px] text-ink-2">{hint}</p>}
        <button type="button" className="btn mt-3" onClick={reload}>
          再読み込み
        </button>
      </div>
    );
  }
  return null;
}

export function Layout() {
  const { analysis, datasetOverride, setDatasetOverride } = useData();
  const meta = analysis?.dataset.meta;
  const mode = meta ? datasetModeFromSource(meta.source, meta.isSample) : null;
  const { pathname } = useLocation();

  // ハッシュルーティングでは画面遷移でスクロール位置が残るため、先頭に戻す
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-header text-header-ink">
        <div className="mx-auto flex max-w-[1280px] items-center gap-5 px-4 md:px-6">
          <div className="flex h-12 items-center">
            <Wordmark />
          </div>
          <NavTabs className="hidden self-end md:block" />
          <div className="ml-auto flex items-center gap-2">
            {meta?.isSample && <SampleBadge />}
            {mode && !meta?.isSample && <DatasetModeBadge info={mode} />}
            <Controls className="hidden sm:flex" />
          </div>
        </div>
        <div className="mx-auto max-w-[1280px] overflow-x-auto px-2 md:hidden">
          <NavTabs />
        </div>
        <Controls className="border-t border-header-muted/20 px-4 py-2 sm:hidden" />
      </header>

      {meta?.isSample && (
        <div className="border-b border-caution/30 bg-caution-soft">
          <p className="mx-auto max-w-[1280px] px-4 py-1.5 text-[12px] text-caution md:px-6">
            <span className="font-bold">サンプルデータを表示中</span>
            ：銘柄・価格・需給・日程・コメントはすべて架空です。実在銘柄の推奨ではありません。
          </p>
        </div>
      )}
      {mode && !meta?.isSample && (
        <div className="border-b border-rule bg-panel">
          <p className="mx-auto max-w-[1280px] px-4 py-1.5 text-[12px] text-muted md:px-6">
            <span className="font-bold text-ink-2">{mode.label}モード</span>
            ：{mode.description}
          </p>
        </div>
      )}
      {datasetOverride && (
        <div className="border-b border-accent/20 bg-accent-soft">
          <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-1.5 text-[12px] text-accent md:px-6">
            <p className="min-w-0 flex-1">
              <span className="font-bold">ブラウザ生成データを表示中</span>
              ：保存ファイルではなく、このブラウザに一時反映したデータです。
            </p>
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setDatasetOverride(null)}>
              解除
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5 md:px-6">
        {analysis ? <Outlet /> : <StatusView />}
      </main>

      <footer className="border-t border-rule bg-panel">
        <div className="mx-auto max-w-[1280px] space-y-1 px-4 py-4 text-[11.5px] leading-relaxed text-muted md:px-6">
          <p>
            <span className="font-semibold text-ink-2">SwingScout は分析補助ツールです。</span>
            {DISCLAIMER}
          </p>
          {meta && analysis && (
            <p className="num">
              source: {meta.source} ・ 基準日 {analysis.dataset.asOf} ・ 生成 {formatDateTime(meta.generatedAt)}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
