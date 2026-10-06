/**
 * レポート生成画面。
 *   詳細レポート … generateWeeklyReport() の Markdown（コピー / .md / .html）
 *   SNS投稿     … generateSnsPost() のプレーンテキスト（コピー / .txt、X の文字数目安つき）
 * どちらもテキストエリアで手直しでき、手直し内容はモードごとに保持する。
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
import {
  countXWeight,
  DEFAULT_SNS_OPTIONS,
  generateSnsPost,
  splitThread,
  X_WEIGHTED_LIMIT,
  type SnsPostOptions,
} from '../lib/snsPostGenerator';
import { useAnalysis, useData } from '../state/DataContext';

type Mode = 'report' | 'sns';

const MODES: { id: Mode; label: string }[] = [
  { id: 'report', label: '詳細レポート' },
  { id: 'sns', label: 'SNS投稿' },
];

const SECTION_LABELS: Record<keyof ReportSections, string> = {
  today: '今日の市況',
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

function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: string }) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--c-accent)]"
      />
      {children}
    </label>
  );
}

/** SNS投稿のプレビュー：投稿ごとのカードと X の文字数目安 */
function SnsPreview({ text, thread }: { text: string; thread: boolean }) {
  const posts = thread ? splitThread(text) : [text.trim()];
  return (
    <div className="space-y-3">
      {posts.map((post, i) => {
        const weight = countXWeight(post);
        const over = weight > X_WEIGHTED_LIMIT;
        return (
          <article key={i} className="rounded-md border border-rule bg-panel-2/50">
            <p className="px-4 py-3 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap text-ink">{post}</p>
            <footer className="flex items-center justify-between border-t border-rule px-4 py-1.5 text-[11px]">
              <span className="text-muted">{thread ? `投稿 ${i + 1} / ${posts.length}` : '1投稿'}</span>
              <span className={cx('num', over ? 'font-bold text-caution' : 'text-muted')}>
                X換算 {weight} / {X_WEIGHTED_LIMIT}
                {over && '（超過）'}
              </span>
            </footer>
          </article>
        );
      })}
      {!thread && countXWeight(text) > X_WEIGHTED_LIMIT && (
        <p className="text-[11.5px] text-muted">
          X の通常アカウントは全角140字（換算280）まで。長文投稿に対応した SNS 以外では「スレッドに分割」を使ってください。
        </p>
      )}
    </div>
  );
}

export function ReportPage() {
  const base = useAnalysis();
  const { todayAnalysis, memo } = useData();
  const [mode, setMode] = useState<Mode>('report');
  const [topN, setTopN] = useState(base.options.topN);
  const [reportOptions, setReportOptions] = useState<ReportOptions>(DEFAULT_REPORT_OPTIONS);
  const [snsOptions, setSnsOptions] = useState<SnsPostOptions>(DEFAULT_SNS_OPTIONS);
  const [drafts, setDrafts] = useState<Record<Mode, { text: string; dirty: boolean }>>({
    report: { text: '', dirty: false },
    sns: { text: '', dirty: false },
  });
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [notice, setNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const analysis = useMemo(
    () => (topN === base.options.topN ? base : analyzeDataset(base.dataset, { ...base.options, topN })),
    [base, topN],
  );
  const generated = useMemo(
    () =>
      mode === 'report'
        ? generateWeeklyReport(analysis, reportOptions, { today: todayAnalysis, memo })
        : generateSnsPost(analysis, snsOptions),
    [mode, analysis, reportOptions, snsOptions, todayAnalysis, memo],
  );

  const draft = drafts[mode];
  // 手直ししていなければ、設定の変更をそのまま反映する
  useEffect(() => {
    if (!draft.dirty && draft.text !== generated) {
      setDrafts((d) => ({ ...d, [mode]: { text: generated, dirty: false } }));
    }
  }, [mode, generated, draft]);

  const previewHtml = useMemo(() => (mode === 'report' ? renderMarkdown(draft.text) : ''), [mode, draft.text]);
  const fileBase = `${analysis.dataset.asOf}-${analysis.window.pattern.id}`;
  const outOfSync = draft.dirty && draft.text !== generated;
  const isThread = mode === 'sns' && snsOptions.layout === 'thread';

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2200);
  };
  const setText = (text: string) => setDrafts((d) => ({ ...d, [mode]: { text, dirty: true } }));
  const regenerate = () => setDrafts((d) => ({ ...d, [mode]: { text: generated, dirty: false } }));
  const setSection = (key: keyof ReportSections, value: boolean) =>
    setReportOptions((o) => ({ ...o, sections: { ...o.sections, [key]: value } }));

  return (
    <div className="space-y-4">
      <PageTitle title="レポート生成">
        <div role="radiogroup" aria-label="出力形式" className="inline-flex rounded border border-rule-strong bg-panel p-0.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cx(
                'rounded-sm px-3 py-1 text-[12px] font-semibold',
                mode === m.id ? 'bg-accent text-panel' : 'text-ink-2 hover:text-ink',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </PageTitle>

      {/* 設定 */}
      <section className="panel px-4 py-3" aria-label="出力設定">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <label className="block min-w-[14rem] flex-1 text-[12px]">
            <span className="text-ink-2">タイトル</span>
            <input
              type="text"
              className="field mt-1 w-full"
              placeholder={
                mode === 'report'
                  ? `今週の作戦（${analysis.window.pattern.label}）`
                  : `今週の作戦｜${analysis.window.pattern.label}`
              }
              value={(mode === 'report' ? reportOptions.title : snsOptions.title) ?? ''}
              onChange={(e) =>
                mode === 'report'
                  ? setReportOptions((o) => ({ ...o, title: e.target.value }))
                  : setSnsOptions((o) => ({ ...o, title: e.target.value }))
              }
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

          {mode === 'report' ? (
            <>
              <label className="block text-[12px]">
                <span className="text-ink-2">銘柄解説</span>
                <select
                  className="field mt-1 block"
                  value={reportOptions.detail}
                  onChange={(e) => setReportOptions((o) => ({ ...o, detail: e.target.value as ReportOptions['detail'] }))}
                >
                  <option value="full">詳細（全項目）</option>
                  <option value="compact">簡潔（1銘柄3行）</option>
                </select>
              </label>
              <fieldset className="text-[12px]">
                <legend className="text-ink-2">含めるセクション</legend>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {(Object.keys(SECTION_LABELS) as (keyof ReportSections)[]).map((key) => (
                    <Checkbox key={key} checked={reportOptions.sections[key]} onChange={(v) => setSection(key, v)}>
                      {key === 'today' && !todayAnalysis && !memo ? `${SECTION_LABELS[key]}（データなし）` : SECTION_LABELS[key]}
                    </Checkbox>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <>
              <label className="block text-[12px]">
                <span className="text-ink-2">投稿の形</span>
                <select
                  className="field mt-1 block"
                  value={snsOptions.layout}
                  onChange={(e) => setSnsOptions((o) => ({ ...o, layout: e.target.value as SnsPostOptions['layout'] }))}
                >
                  <option value="single">1投稿にまとめる</option>
                  <option value="thread">スレッドに分割（X向け）</option>
                </select>
              </label>
              <label className="block min-w-[12rem] text-[12px]">
                <span className="text-ink-2">ハッシュタグ</span>
                <input
                  type="text"
                  className="field mt-1 w-full"
                  placeholder="なし"
                  value={snsOptions.hashtags}
                  onChange={(e) => setSnsOptions((o) => ({ ...o, hashtags: e.target.value }))}
                />
              </label>
              <fieldset className="text-[12px]">
                <legend className="text-ink-2">内容</legend>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  <Checkbox checked={snsOptions.includeLevels} onChange={(v) => setSnsOptions((o) => ({ ...o, includeLevels: v }))}>
                    損切り・利確の価格
                  </Checkbox>
                  <Checkbox checked={snsOptions.emoji} onChange={(v) => setSnsOptions((o) => ({ ...o, emoji: v }))}>
                    絵文字
                  </Checkbox>
                </div>
              </fieldset>
            </>
          )}
        </div>
      </section>

      {/* 操作 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () =>
            flash(
              (await copyText(draft.text, textareaRef.current))
                ? 'コピーしました'
                : 'コピーできませんでした。テキストを選択してコピーしてください',
            )
          }
        >
          {mode === 'report' ? 'Markdownをコピー' : '投稿文をコピー'}
        </button>
        {mode === 'report' ? (
          <>
            <button type="button" className="btn" onClick={() => download(`${fileBase}.md`, draft.text, 'text/markdown;charset=utf-8')}>
              .md を保存
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                download(`${fileBase}.html`, buildStandaloneHtml(extractTitle(draft.text), draft.text), 'text/html;charset=utf-8')
              }
            >
              .html を保存
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => download(`${fileBase}-sns.txt`, draft.text, 'text/plain;charset=utf-8')}>
            .txt を保存
          </button>
        )}
        <button type="button" className="btn" disabled={!draft.dirty} onClick={regenerate}>
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
            {v === 'edit' ? (mode === 'report' ? 'Markdown' : '投稿文') : 'プレビュー'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={cx('panel flex flex-col overflow-hidden', view !== 'edit' && 'hidden lg:flex')} aria-label="編集">
          <header className="flex items-center justify-between border-b border-rule px-4 py-2 text-[12px]">
            <span className="font-bold">{mode === 'report' ? 'Markdown' : '投稿文'}</span>
            <span className="num text-muted">
              {draft.text.length.toLocaleString()}文字
              {isThread && '（「-----」の行が投稿の区切り）'}
            </span>
          </header>
          <textarea
            ref={textareaRef}
            value={draft.text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className={cx(
              'min-h-[60vh] w-full flex-1 resize-y bg-panel px-4 py-3 leading-relaxed text-ink outline-none lg:min-h-[72vh]',
              mode === 'report' ? 'num text-[12.5px]' : 'text-[13px]',
            )}
            aria-label={mode === 'report' ? 'レポートのMarkdown（編集可）' : 'SNS投稿文（編集可）'}
          />
        </section>
        <section className={cx('panel overflow-hidden', view !== 'preview' && 'hidden lg:block')} aria-label="プレビュー">
          <header className="border-b border-rule px-4 py-2 text-[12px] font-bold">プレビュー</header>
          {mode === 'report' ? (
            // renderMarkdown は生HTMLをエスケープ済み
            <div className="md-preview max-h-[72vh] overflow-y-auto px-5 py-4" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <div className="max-h-[72vh] overflow-y-auto px-4 py-4">
              <SnsPreview text={draft.text} thread={isThread} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
