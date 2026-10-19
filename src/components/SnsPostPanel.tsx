/**
 * SNS投稿モード（レポート画面の「SNS投稿」）。
 * generateSnsPost() のプレーンテキストを、手直し → コピー / .txt 保存できる。X の文字数目安つき。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DatasetAnalysis } from '../lib/analysis';
import { analyzeDataset } from '../lib/analysis';
import {
  countXWeight,
  DEFAULT_SNS_OPTIONS,
  generateSnsPost,
  splitThread,
  X_WEIGHTED_LIMIT,
  type SnsPostOptions,
} from '../lib/snsPostGenerator';
import { copyToClipboard, downloadText } from './download';
import { cx } from './ui';

function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: string }) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--c-accent)]" />
      {children}
    </label>
  );
}

/** 投稿ごとのカードと X の文字数目安 */
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

export function SnsPostPanel({ base }: { base: DatasetAnalysis }) {
  const [topN, setTopN] = useState(base.options.topN);
  const [options, setOptions] = useState<SnsPostOptions>(DEFAULT_SNS_OPTIONS);
  const [draft, setDraft] = useState({ text: '', dirty: false });
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [notice, setNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const analysis = useMemo(
    () => (topN === base.options.topN ? base : analyzeDataset(base.dataset, { ...base.options, topN })),
    [base, topN],
  );
  const generated = useMemo(() => generateSnsPost(analysis, options), [analysis, options]);

  // 手直ししていなければ、設定の変更をそのまま反映する
  useEffect(() => {
    if (!draft.dirty && draft.text !== generated) setDraft({ text: generated, dirty: false });
  }, [generated, draft]);

  const isThread = options.layout === 'thread';
  const outOfSync = draft.dirty && draft.text !== generated;
  const fileBase = `${analysis.dataset.asOf}-${analysis.window.pattern.id}`;

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2200);
  };
  const copy = async () => {
    let ok = await copyToClipboard(draft.text);
    // http の本番環境など Clipboard API が使えない場合
    if (!ok && textareaRef.current) {
      textareaRef.current.select();
      ok = document.execCommand('copy');
    }
    flash(ok ? 'コピーしました' : 'コピーできませんでした。テキストを選択してコピーしてください');
  };

  return (
    <div className="space-y-4">
      {/* 設定 */}
      <section className="panel px-4 py-3" aria-label="投稿の設定">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <label className="block min-w-[14rem] flex-1 text-[12px]">
            <span className="text-ink-2">タイトル</span>
            <input
              type="text"
              className="field mt-1 w-full"
              placeholder={`今週の作戦｜${analysis.window.pattern.label}`}
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
            <span className="text-ink-2">投稿の形</span>
            <select
              className="field mt-1 block"
              value={options.layout}
              onChange={(e) => setOptions((o) => ({ ...o, layout: e.target.value as SnsPostOptions['layout'] }))}
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
              value={options.hashtags}
              onChange={(e) => setOptions((o) => ({ ...o, hashtags: e.target.value }))}
            />
          </label>
          <fieldset className="text-[12px]">
            <legend className="text-ink-2">内容</legend>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              <Checkbox checked={options.includeLevels} onChange={(v) => setOptions((o) => ({ ...o, includeLevels: v }))}>
                損切り・利確の価格
              </Checkbox>
              <Checkbox checked={options.emoji} onChange={(v) => setOptions((o) => ({ ...o, emoji: v }))}>
                絵文字
              </Checkbox>
            </div>
          </fieldset>
        </div>
      </section>

      {/* 操作 */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={copy}>
          投稿文をコピー
        </button>
        <button type="button" className="btn" onClick={() => downloadText(`${fileBase}-sns.txt`, draft.text)}>
          .txt を保存
        </button>
        <button type="button" className="btn" disabled={!draft.dirty} onClick={() => setDraft({ text: generated, dirty: false })}>
          手直しを破棄して再生成
        </button>
        <span role="status" className="text-[12px] font-semibold text-accent">
          {notice}
        </span>
        {outOfSync && !notice && <span className="text-[12px] text-caution">手直し中のため、設定の変更は反映されていません</span>}
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
            {v === 'edit' ? '投稿文' : 'プレビュー'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={cx('panel flex flex-col overflow-hidden', view !== 'edit' && 'hidden lg:flex')} aria-label="投稿文">
          <header className="flex items-center justify-between border-b border-rule px-4 py-2 text-[12px]">
            <span className="font-bold">投稿文</span>
            <span className="num text-muted">
              {draft.text.length.toLocaleString()}文字
              {isThread && '（「-----」の行が投稿の区切り）'}
            </span>
          </header>
          <textarea
            ref={textareaRef}
            value={draft.text}
            onChange={(e) => setDraft({ text: e.target.value, dirty: true })}
            spellCheck={false}
            className="min-h-[60vh] w-full flex-1 resize-y bg-panel px-4 py-3 text-[13px] leading-relaxed text-ink outline-none lg:min-h-[72vh]"
            aria-label="SNS投稿文（編集可）"
          />
        </section>
        <section className={cx('panel overflow-hidden', view !== 'preview' && 'hidden lg:block')} aria-label="プレビュー">
          <header className="border-b border-rule px-4 py-2 text-[12px] font-bold">プレビュー</header>
          <div className="max-h-[72vh] overflow-y-auto px-4 py-4">
            <SnsPreview text={draft.text} thread={isThread} />
          </div>
        </section>
      </div>
    </div>
  );
}
