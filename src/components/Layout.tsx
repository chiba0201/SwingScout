import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { formatDateJa, HOLDING_PATTERNS } from '../lib/calendar';
import { datasetModeFromSource, datasetOptionLabel, isBrowserGenerated } from '../lib/datasetMode';
import { formatDateTime } from '../lib/format';
import { DISCLAIMER } from '../lib/reportGenerator';
import { useData } from '../state/DataContext';
import { IconGear } from './icons';
import { cx } from './ui';

/**
 * ヘッダー：左にメインメニュー（見る画面）、右に「保有パターン」とデータ更新（歯車）の2つだけ。
 * データ更新は作業用の画面なので、ヘッダー右端の歯車アイコンに控えめに置く。
 * 表示中のデータの種類・切り替えは、ヘッダーの下の帯（DataStrip）にまとめる。
 */
const NAV = [
  { to: '/', label: 'ダッシュボード', end: true },
  { to: '/today', label: 'Today', end: false },
  { to: '/candidates', label: '候補一覧', end: false },
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
      <ul className="flex gap-0.5 sm:gap-1">
        {NAV.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'block border-b-2 px-2.5 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors sm:px-3',
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

function DataUpdateLink() {
  return (
    <NavLink
      to="/data-update"
      aria-label="データ更新"
      title="データ更新（候補データを作る）"
      // 開いているときは下線ではなく、アイコンを明るく＋薄い背景で示す（右側は下端の揃う位置が無いため）
      className={({ isActive }) =>
        cx(
          'flex items-center rounded p-1.5 transition-colors',
          isActive ? 'bg-header-ink/12 text-header-ink' : 'text-header-muted/80 hover:bg-header-ink/6 hover:text-header-ink',
        )
      }
    >
      <IconGear className="h-[17px] w-[17px]" />
    </NavLink>
  );
}

const selectClass =
  'rounded border border-header-muted/40 bg-header py-1 pr-1 pl-2 text-[12px] text-header-ink hover:border-header-muted';

function HoldingPatternSelect() {
  const { patternId, setPatternId } = useData();
  return (
    <label className="flex items-center gap-1.5">
      <span className="hidden text-[11px] text-header-muted lg:inline">保有</span>
      <select className={selectClass} value={patternId} onChange={(e) => setPatternId(e.target.value)} aria-label="保有パターン">
        {HOLDING_PATTERNS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 公開済みのデータ（data/manifest.json）の切り替え。ヘッダーの下の帯に置く */
function DatasetSelect() {
  const { manifest, file, selectFile } = useData();
  if (!manifest || manifest.datasets.length < 2) return null;
  return (
    <select
      className="shrink-0 rounded border border-rule-strong bg-panel py-0.5 pr-1 pl-1.5 text-[12px] font-semibold text-ink-2 hover:border-muted"
      value={file ?? ''}
      onChange={(e) => selectFile(e.target.value)}
      aria-label="表示するデータ"
    >
      {manifest.datasets.map((d) => (
        <option key={d.file} value={d.file}>
          {formatDateJa(d.asOf)} {datasetOptionLabel(d)}
        </option>
      ))}
    </select>
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
            <HoldingPatternSelect />
            <DataUpdateLink />
          </div>
        </div>
        <div className="mx-auto max-w-[1280px] overflow-x-auto px-2 md:hidden">
          <NavTabs />
        </div>
      </header>

      {/* いま表示しているデータ（1行にまとめる） */}
      {meta?.isSample ? (
        <div className="border-b border-caution/30 bg-caution-soft">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-[12px] md:px-6">
            <p className="min-w-0 flex-1 text-caution">
              <span className="font-bold">サンプルデータを表示中</span>
              ：銘柄・価格・需給・日程・コメントはすべて架空です。実在銘柄の推奨ではありません。
            </p>
            <DatasetSelect />
          </div>
        </div>
      ) : datasetOverride && analysis ? (
        <div className="border-b border-accent/20 bg-accent-soft">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-[12px] md:px-6">
            <p className="min-w-0 flex-1 text-ink-2">
              <span className="font-bold text-accent">このブラウザで作ったデータを表示中</span>
              ：{formatDateJa(analysis.dataset.asOf)}引け・{mode?.label}。保存したファイルではないため、ほかの端末には表示されません。
            </p>
            <button
              type="button"
              className="font-semibold whitespace-nowrap text-accent underline underline-offset-2"
              onClick={() => setDatasetOverride(null)}
            >
              ファイルのデータに戻す
            </button>
          </div>
        </div>
      ) : (
        mode &&
        analysis && (
          <div className="border-b border-rule bg-panel">
            <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-[12px] md:px-6">
              <p className="min-w-0 flex-1 text-muted">
                <span className="font-bold text-ink-2">
                  {mode.label}・{formatDateJa(analysis.dataset.asOf)}引け
                </span>
                ：{mode.description}
              </p>
              <DatasetSelect />
            </div>
          </div>
        )
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
            <p title={`source: ${meta.source}`}>
              表示中のデータ：{mode?.label ?? 'データ'}
              {isBrowserGenerated(meta.source) ? '（このブラウザで作成）' : ''} ・ 基準日 {formatDateJa(analysis.dataset.asOf)} ・ 作成{' '}
              {formatDateTime(meta.generatedAt)}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
