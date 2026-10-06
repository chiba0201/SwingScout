/**
 * 市況メモ（ChatGPT 等で作った Markdown）の抽出サマリー・原文・貼り付け欄。
 * 解析は src/lib/marketMemo.ts、保存は DataContext（localStorage）が担う。
 */
import { useEffect, useMemo, useState } from 'react';
import { formatDateTime } from '../lib/format';
import type { ParsedMarketMemo } from '../lib/marketMemo';
import { renderMarkdown } from '../lib/markdown';
import { useData } from '../state/DataContext';

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

function MemoSummary({ memo }: { memo: ParsedMarketMemo }) {
  return (
    <div className="space-y-3">
      {memo.needsReview && (
        <div className="rounded-sm border border-caution/50 bg-caution-soft px-3 py-2 text-[12.5px] text-caution" role="note">
          <p className="font-bold">
            要確認：原文に{[...new Set(memo.reviewHits.map((h) => `「${h.term}」`))].join('')}などの記載があります（
            {memo.reviewHits.length}箇所）。数値・日程は一次情報で確認してください
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {memo.reviewHits.slice(0, 5).map((h) => (
              <li key={h.line}>{h.line}</li>
            ))}
          </ul>
        </div>
      )}

      {memo.headline && <p className="text-[15px] leading-snug font-bold text-ink">{memo.headline}</p>}

      {memo.sections.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {memo.sections.map((s) => (
            <div key={`${s.heading}-${s.summary}`} className="min-w-0">
              <dt className="text-[12px] font-bold text-ink-2">{s.heading}</dt>
              <dd className="text-[13px] leading-relaxed text-ink">{s.summary || '—'}</dd>
            </div>
          ))}
        </dl>
      )}

      {memo.tables.map((t, i) => (
        <div key={i} className="overflow-x-auto">
          {t.section && <p className="mb-1 text-[11.5px] text-muted">{t.section}</p>}
          <table className="data-table">
            <thead>
              <tr>
                {t.headers.map((h, j) => (
                  <th key={j}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((v, k) => (
                    <td key={k} className="num">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {memo.sparse && <p className="text-[13px] text-ink-2">見出し・表は見つかりませんでした。原文を確認してください。</p>}

      {memo.sources.length > 0 && (
        <div>
          <p className="text-[11.5px] font-semibold text-ink-2">参照元（リンクは外部サイトを新しいタブで開きます）</p>
          <ul className="mt-0.5 space-y-0.5 text-[12.5px]">
            {memo.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
                  {s.label}
                </a>
                <span className="ml-1.5 text-[11px] text-muted">{hostOf(s.url)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MemoEditor() {
  const { pastedMemo, setPastedMemo, memo } = useData();
  const [draft, setDraft] = useState(pastedMemo);
  const [status, setStatus] = useState<string | null>(null);

  // 入力が止まったら保存（キー入力ごとに解析し直さない）
  useEffect(() => {
    if (draft === pastedMemo) return;
    const timer = setTimeout(() => {
      const ok = setPastedMemo(draft);
      setStatus(
        ok
          ? draft.trim()
            ? 'ブラウザに保存しました'
            : '貼り付けメモを削除しました'
          : '保存できませんでした（プライベートモード等）。表示はこのタブを閉じるまで有効です',
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [draft, pastedMemo, setPastedMemo]);

  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        rows={10}
        placeholder={'ChatGPT 等で作った市況メモの Markdown をそのまま貼り付けてください。\n例）\n**結論：SOX高は追い風。寄り追いはせず押し目待ち**\n### 海外市場\n- NYダウ +0.3% …'}
        className="field block min-h-[12rem] w-full resize-y font-mono text-[12.5px] leading-relaxed"
        aria-label="市況メモ（Markdown）"
      />
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <button
          type="button"
          className="btn"
          disabled={!draft}
          onClick={() => {
            if (window.confirm('貼り付けた市況メモを削除しますか？')) setDraft('');
          }}
        >
          メモを削除
        </button>
        <span role="status" className="text-accent">
          {status}
        </span>
        <span className="text-muted">
          このブラウザにだけ保存されます（他の端末・閲覧者には共有されません）。
          {!pastedMemo && memo?.source === 'json' && ' 未入力の間は today-market.json のメモを表示します。'}
        </span>
      </div>
    </div>
  );
}

/**
 * 市況メモ詳細（編集・監査用）。普段は閉じておき、必要なときに開いて確認・貼り付けする。
 * 閉じた状態でも、要確認の件数とメモの有無は見出し行で分かるようにしている。
 */
export function TodayMemoDetails({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { memo, pastedMemo } = useData();
  const rawHtml = useMemo(() => (memo ? renderMarkdown(memo.raw) : ''), [memo]);
  const [open, setOpen] = useState(defaultOpen);
  // メモが1つも無ければ貼り付け欄は最初から開く。入力中の自動保存で閉じないよう開閉は自前で持つ
  const [editorOpen, setEditorOpen] = useState(() => !memo);

  const origin = memo
    ? memo.source === 'pasted'
      ? `貼り付けメモ（保存 ${memo.savedAt ? formatDateTime(memo.savedAt) : '—'}）`
      : 'today-market.json 同梱のメモ'
    : 'メモ未登録';

  return (
    <details
      className="panel group overflow-hidden"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      aria-labelledby="today-memo"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <h2 id="today-memo" className="text-[13px] font-bold">
          市況メモ詳細
        </h2>
        <span className="text-[11.5px] text-muted">{origin}</span>
        {memo?.needsReview && (
          <span className="rounded-sm border border-caution/50 bg-caution-soft px-1.5 text-[11px] leading-[1.6] font-bold text-caution">
            要確認 {memo.reviewHits.length}件
          </span>
        )}
        {memo && (
          <span className="num text-[11px] text-muted">
            見出し{memo.sections.length}・表{memo.tables.length}・参照{memo.sources.length}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-accent">
          {open ? '閉じる' : '開いて確認・編集'}
          <span className="inline-block transition-transform group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </span>
      </summary>

      <div className="space-y-3 border-t border-rule px-4 py-3">
        {memo ? (
          <>
            {memo.title && <p className="text-[12px] text-muted">{memo.title}</p>}
            <MemoSummary memo={memo} />
          </>
        ) : (
          <p className="text-[13px] text-ink-2">
            市況メモはまだありません。下の欄に Markdown を貼り付けると、結論・見出しごとの要点・表・参照元を自動で抜き出します。
          </p>
        )}

        {memo && (
          <details className="rounded-sm border border-rule">
            <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-semibold text-ink-2">原文を表示</summary>
            {/* renderMarkdown は生HTMLをエスケープし、画像は読み込まない */}
            <div className="md-preview border-t border-rule px-4 py-3" dangerouslySetInnerHTML={{ __html: rawHtml }} />
          </details>
        )}

        <details
          className="rounded-sm border border-rule"
          open={editorOpen}
          onToggle={(e) => setEditorOpen(e.currentTarget.open)}
        >
          <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-semibold text-ink-2">
            市況メモを貼り付け{pastedMemo ? '・編集' : ''}
          </summary>
          <div className="border-t border-rule px-3 py-3">
            <MemoEditor />
          </div>
        </details>
      </div>
    </details>
  );
}
