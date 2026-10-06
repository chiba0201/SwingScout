/**
 * レポート生成画面。
 * 設定 → generateWeeklyReport() で Markdown を作り、テキストエリアで手直ししてコピー／保存する。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { cx, PageTitle } from '../components/ui';
import { analyzeDataset } from '../lib/analysis';
import { buildStandaloneHtml, extractTitle, renderMarkdown } from '../lib/markdown';
import {
  DEFAULT_REPORT_OPTIONS,
  generateWeeklyReport,
  type ReportOptions,
  type ReportSections,
} from '../lib/reportGenerator';
import { useAnalysis } from '../state/DataContext';

const SECTION_LABELS: Record<keyof ReportSections, string> = {
  market: '地合い',
  events: 'イベント表',
  picks: '銘柄解説',
  operations: '運用上の注意',
  table: '一覧表',
};

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text: string, fallback: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http の本番環境など Clipboard API が使えない場合
    if (!fallback) return false;
    fallback.select();
    return document.execCommand('copy');
  }
}

export function ReportPage() {
  const base = useAnalysis();
  const [topN, setTopN] = useState(base.options.topN);
  const [options, setOptions] = useState<ReportOptions>(DEFAULT_REPORT_OPTIONS);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [notice, setNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const analysis = useMemo(
    () => (topN === base.options.topN ? base : analyzeDataset(base.dataset, { ...base.options, topN })),
    [base, topN],
  );
  const generated = useMemo(() => generateWeeklyReport(analysis, options), [analysis, options]);

  // 手直ししていなければ、設定の変更をそのまま反映する
  useEffect(() => {
    if (!dirty) setDraft(generated);
  }, [generated, dirty]);

  const previewHtml = useMemo(() => renderMarkdown(draft), [draft]);
  const fileBase = `${analysis.dataset.asOf}-${analysis.window.pattern.id}`;
  const outOfSync = dirty && draft !== generated;

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2200);
  };

  const setSection = (key: keyof ReportSections, value: boolean) =>
    setOptions((o) => ({ ...o, sections: { ...o.sections, [key]: value } }));

  return (
    <div className="space-y-4">
      <PageTitle title="レポート生成">
        <span className="text-[12px] text-muted">「今週の作戦」形式の Markdown を作成</span>
      </PageTitle>

      {/* 設定 */}
      <section className="panel px-4 py-3" aria-label="レポート設定">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <label className="block min-w-[14rem] flex-1 text-[12px]">
            <span className="text-ink-2">タイトル</span>
            <input
              type="text"
              className="field mt-1 w-full"
              placeholder={`今週の作戦（${analysis.window.pattern.label}）`}
              value={options.title ?? ''}
              onChange={(e) => setOptions((o) => ({ ...o, title: e.target.value }))}
            />
          </label>
          <label className="block text-[12px]">
            <span className="text-ink-2">銘柄数</span>
            <select className="field mt-1 block" value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
              {[3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>
                  上位{n}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12px]">
            <span className="text-ink-2">銘柄解説</span>
            <select
              className="field mt-1 block"
              value={options.detail}
              onChange={(e) => setOptions((o) => ({ ...o, detail: e.target.value as ReportOptions['detail'] }))}
            >
              <option value="full">詳細（全項目）</option>
              <option value="compact">簡潔（1銘柄3行）</option>
            </select>
          </label>
          <fieldset className="text-[12px]">
            <legend className="text-ink-2">含めるセクション</legend>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {(Object.keys(SECTION_LABELS) as (keyof ReportSections)[]).map((key) => (
                <label key={key} className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={options.sections[key]}
                    onChange={(e) => setSection(key, e.target.checked)}
                    className="accent-[var(--c-accent)]"
                  />
                  {SECTION_LABELS[key]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      {/* 操作 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => flash((await copyText(draft, textareaRef.current)) ? 'コピーしました' : 'コピーできませんでした。テキストを選択してコピーしてください')}
        >
          Markdownをコピー
        </button>
        <button type="button" className="btn" onClick={() => download(`${fileBase}.md`, draft, 'text/markdown;charset=utf-8')}>
          .md を保存
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => download(`${fileBase}.html`, buildStandaloneHtml(extractTitle(draft), draft), 'text/html;charset=utf-8')}
        >
          .html を保存
        </button>
        <button
          type="button"
          className="btn"
          disabled={!dirty}
          onClick={() => {
            setDirty(false);
            setDraft(generated);
          }}
        >
          手直しを破棄して再生成
        </button>
        <span role="status" className="text-[12px] font-semibold text-accent">
          {notice}
        </span>
        {outOfSync && !notice && (
          <span className="text-[12px] text-caution">手直し中のため、設定の変更は反映されていません</span>
        )}
      </div>

      {/* スマホ：編集/プレビュー切り替え */}
      <div role="tablist" aria-label="表示切り替え" className="flex border-b border-rule lg:hidden">
        {(['edit', 'preview'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cx(
              '-mb-px border-b-2 px-4 py-2 text-[13px] font-semibold',
              view === v ? 'border-accent text-accent' : 'border-transparent text-ink-2',
            )}
          >
            {v === 'edit' ? 'Markdown' : 'プレビュー'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={cx('panel flex flex-col overflow-hidden', view !== 'edit' && 'hidden lg:flex')} aria-label="Markdown">
          <header className="flex items-center justify-between border-b border-rule px-4 py-2 text-[12px]">
            <span className="font-bold">Markdown</span>
            <span className="num text-muted">{draft.length.toLocaleString()}文字</span>
          </header>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            spellCheck={false}
            className="num min-h-[60vh] w-full flex-1 resize-y bg-panel px-4 py-3 text-[12.5px] leading-relaxed text-ink outline-none lg:min-h-[72vh]"
            aria-label="レポートのMarkdown（編集可）"
          />
        </section>
        <section className={cx('panel overflow-hidden', view !== 'preview' && 'hidden lg:block')} aria-label="プレビュー">
          <header className="border-b border-rule px-4 py-2 text-[12px] font-bold">プレビュー</header>
          {/* renderMarkdown は生HTMLをエスケープ済み */}
          <div className="md-preview max-h-[72vh] overflow-y-auto px-5 py-4" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </section>
      </div>
    </div>
  );
}
