/**
 * 市況メモ（ChatGPT 等で作った Markdown）まわりの表示。
 *   TodayUpdatePanel … 画面上部の「今日の市況を更新」。メモを貼って Today に反映する主導線
 *   TodayMemoDetails … 画面下部の「市況メモ詳細」。要確認・抽出結果・参照元・原文の確認用
 * 解析は src/lib/marketMemo.ts、Today への変換は src/lib/todayBuilder.ts、保存は DataContext（localStorage）。
 */
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import { formatDateJa, todayJst } from '../lib/calendar';
import { formatDateTime } from '../lib/format';
import { marketContextFromToday } from '../lib/marketContextFromToday';
import type { ParsedMarketMemo } from '../lib/marketMemo';
import { renderMarkdown } from '../lib/markdown';
import { parseMemoBrief } from '../lib/memoBrief';
import { buildTodayFromMemo, emptyTodayBase } from '../lib/todayBuilder';
import { isTodayFresh } from '../lib/workflow';
import { useData } from '../state/DataContext';
import type { TodayMarket } from '../types/today';
import { downloadJson } from './download';
import { cx } from './ui';

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const SESSIONS = ['寄り前', '前場', '昼休み', '後場', '引け後'];

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
        <div key={i} className="relative overflow-x-auto">
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

function MemoEditor({ onApplied }: { onApplied: (today: TodayMarket) => void }) {
  const { pastedMemo, setPastedMemo, memo, todayLoad, todayAnalysis, todayOverride, setTodayOverride } = useData();
  const [draft, setDraft] = useState(pastedMemo);
  const [status, setStatus] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(() => todayJst());
  const [session, setSession] = useState(() => todayAnalysis?.today.session ?? '寄り前');
  const currentToday = todayAnalysis?.today ?? (todayLoad.status === 'ready' ? todayLoad.data : null);

  // 入力が止まったら貼り付けメモとして保存（キー入力ごとに解析し直さない）
  useEffect(() => {
    if (draft === pastedMemo) return;
    const timer = setTimeout(() => {
      if (!setPastedMemo(draft)) setStatus('ブラウザに保存できませんでした（プライベートモード等）。このタブを閉じるまでは使えます');
    }, 500);
    return () => clearTimeout(timer);
  }, [draft, pastedMemo, setPastedMemo]);

  // 末尾の「SwingScout用まとめ」を読めたら、対象日・セッションを合わせ、読めた内容を知らせる
  const brief = useMemo(() => parseMemoBrief(draft, Number(todayJst().slice(0, 4))), [draft]);
  useEffect(() => {
    if (brief?.asOf) setAsOf(brief.asOf);
    if (brief?.session && SESSIONS.includes(brief.session)) setSession(brief.session);
  }, [brief?.asOf, brief?.session]);
  const briefSummary = brief
    ? [
        brief.picks.length && `銘柄${brief.picks.length}`,
        brief.sectorStances.length && `セクター${brief.sectorStances.length}`,
        brief.quotes.length && `指標${brief.quotes.length}`,
        brief.levels.length && `節目${brief.levels.length}`,
        brief.relatedStocks.length && `関連株${brief.relatedStocks.length}`,
        brief.events.length && `イベント${brief.events.length}`,
        (brief.catalysts.length || brief.pts.length) && `材料・PTS${brief.catalysts.length + brief.pts.length}`,
      ].filter(Boolean)
    : [];

  const build = (generatedAt?: string) =>
    buildTodayFromMemo(currentToday ?? emptyTodayBase(asOf, new Date().toISOString()), draft, { asOf, session, generatedAt });

  const apply = () => {
    if (!draft.trim()) return;
    const today = build(new Date().toISOString());
    const okMemo = setPastedMemo(draft);
    const okToday = setTodayOverride(today);
    if (okMemo && okToday) onApplied(today);
    else setStatus('画面には反映しましたが、ブラウザへの保存に失敗しました（タブを閉じると消えます）');
  };

  const hasDraft = draft.trim().length > 0;

  return (
    <div className="space-y-3">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
        <li>
          <span className="font-bold text-accent">1</span> ChatGPTなどで作った今日の市況メモをそのまま貼る
        </li>
        <li>
          <span className="font-bold text-accent">2</span> 対象日とセッションを確認
        </li>
        <li>
          <span className="font-bold text-accent">3</span> 「Todayに反映」
        </li>
      </ol>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        rows={9}
        placeholder={'ここに市況メモ（Markdown）を貼り付けます。\n例）\n**結論：SOX高は追い風。寄り追いはせず押し目待ち**\n### 海外市場\n- NYダウ +0.3% …'}
        className="field block min-h-[11rem] w-full resize-y font-mono text-[12.5px] leading-relaxed"
        aria-label="市況メモ（Markdown）"
      />
      {hasDraft && (
        <p className={cx('text-[12px]', brief ? 'text-accent' : 'text-muted')} role="status">
          {brief
            ? `SwingScout用まとめを読み取りました（${briefSummary.join('・') || '項目なし'}）`
            : 'SwingScout用まとめ（【SwingScout】〜）が見つかりません。本文から読める範囲で反映します'}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">対象日</span>
          <input className="field" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">セッション</span>
          <select className="field" value={session} onChange={(e) => setSession(e.target.value)}>
            {SESSIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary" onClick={apply} disabled={!hasDraft}>
          Todayに反映
        </button>
        {status && (
          <span role="status" className="pb-1.5 text-[12px] text-caution">
            {status}
          </span>
        )}
      </div>
      <p className="text-[11.5px] leading-relaxed text-muted">
        反映先はこのブラウザだけです。ほかの端末でも同じ内容を見せたいときは、下の「公開用ファイル」を保存して data/ に置きます。
        {!pastedMemo && memo?.source === 'json' && ' 何も貼っていない間は、公開データに同梱のメモを表示します。'}
      </p>

      <details className="text-[12px] text-ink-2">
        <summary className="cursor-pointer font-semibold">公開用ファイルを保存・反映の解除（上級者向け）</summary>
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn" disabled={!hasDraft} onClick={() => downloadJson('today-market.json', build())}>
              today-market.json を保存
            </button>
            <span className="text-muted">Today 画面用。data/ に置いてアップロード</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn"
              disabled={!hasDraft}
              onClick={() => downloadJson('market.json', marketContextFromToday(build()))}
            >
              market.json を保存
            </button>
            <span className="text-muted">ターミナルで候補を作るとき用（raw-data/ に置く）。データ更新画面では不要</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {todayOverride && (
              <button
                type="button"
                className="font-semibold text-accent hover:underline"
                onClick={() => {
                  setTodayOverride(null);
                  setStatus('このブラウザでの反映を解除し、公開データの表示に戻しました');
                }}
              >
                反映を解除して公開データに戻す
              </button>
            )}
            <button
              type="button"
              className="font-semibold text-ink-2 hover:text-accent hover:underline"
              disabled={!draft}
              onClick={() => {
                if (window.confirm('貼り付けた市況メモを削除しますか？')) setDraft('');
              }}
            >
              貼り付けたメモを削除
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

/**
 * 今日の市況を更新（画面上部）。今日の分が反映済みなら1行にたたみ、未反映なら開いておく。
 * 開閉は TodayPage が持つ（下部の「市況メモ詳細」からも開けるようにするため）。
 */
export function TodayUpdatePanel({
  open,
  onOpenChange,
  panelRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panelRef?: RefObject<HTMLElement | null>;
}) {
  const { todayAnalysis, todayLoad, todayOverride } = useData();
  const [applied, setApplied] = useState<TodayMarket | null>(null);
  const today = todayAnalysis?.today ?? (todayLoad.status === 'ready' ? todayLoad.data : null);
  const fresh = isTodayFresh(today?.asOf);

  const status = today ? (
    fresh ? (
      <>
        <span className="font-semibold text-accent">✓ {formatDateJa(today.asOf)} {today.session}を反映済み</span>
        <span className="text-muted">
          {' '}
          （更新 {formatDateTime(today.meta.generatedAt)}・{todayOverride ? 'このブラウザで反映' : '公開データ'}）
        </span>
      </>
    ) : (
      <span className="font-semibold text-caution">
        今日の市況がまだ反映されていません（表示中は {formatDateJa(today.asOf)} {today.session}）
      </span>
    )
  ) : (
    <span className="font-semibold text-caution">今日の市況データがありません。市況メモを貼って作成してください</span>
  );

  return (
    <section
      ref={panelRef}
      className={cx('panel scroll-mt-4 overflow-hidden', !fresh && 'border-caution/60')}
      aria-labelledby="today-update-title"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <h2 id="today-update-title" className="text-[13px] font-bold">
          今日の市況を更新
        </h2>
        <p className="min-w-0 flex-1 text-[12.5px]">{status}</p>
        <button
          type="button"
          className={cx('btn', !open && !fresh && 'btn-primary')}
          aria-expanded={open}
          aria-controls="today-update-editor"
          onClick={() => onOpenChange(!open)}
        >
          {open ? '閉じる' : '市況メモを貼り付けて更新'}
        </button>
      </div>
      {applied && !open && (
        <p className="border-t border-rule bg-accent-soft/60 px-4 py-2 text-[12.5px] text-ink" role="status">
          <span className="font-semibold text-accent">{formatDateJa(applied.asOf)} {applied.session}の市況を反映しました。</span>
          次は{' '}
          <Link to="/data-update" className="font-semibold text-accent underline underline-offset-2">
            データ更新で日足を取って候補を作る →
          </Link>
        </p>
      )}
      {open && (
        <div id="today-update-editor" className="border-t border-rule px-4 py-3">
          <MemoEditor
            onApplied={(t) => {
              setApplied(t);
              onOpenChange(false);
            }}
          />
        </div>
      )}
    </section>
  );
}

/**
 * 市況メモ詳細（確認用）。要確認・抽出結果・参照元・原文をまとめて、普段は閉じておく。
 * 閉じた状態でも、要確認の件数とメモの有無は見出し行で分かる。貼り替えは上部の「今日の市況を更新」から。
 */
export function TodayMemoDetails({ defaultOpen = false, onEdit }: { defaultOpen?: boolean; onEdit: () => void }) {
  const { memo } = useData();
  const rawHtml = useMemo(() => (memo ? renderMarkdown(memo.raw) : ''), [memo]);
  const [open, setOpen] = useState(defaultOpen);

  const origin = memo
    ? memo.source === 'pasted'
      ? `貼り付けたメモ（保存 ${memo.savedAt ? formatDateTime(memo.savedAt) : '—'}）`
      : '公開データに同梱のメモ'
    : 'メモはまだありません';

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
          {open ? '閉じる' : '中身を確認'}
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
            <details className="rounded-sm border border-rule">
              <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-semibold text-ink-2">原文を表示</summary>
              {/* renderMarkdown は生HTMLをエスケープし、画像は読み込まない */}
              <div className="md-preview border-t border-rule px-4 py-3" dangerouslySetInnerHTML={{ __html: rawHtml }} />
            </details>
          </>
        ) : (
          <p className="text-[13px] text-ink-2">市況メモを貼ると、結論・見出しごとの要点・表・参照元をここに抜き出します。</p>
        )}
        <button type="button" className="text-[12.5px] font-semibold text-accent hover:underline" onClick={onEdit}>
          {memo ? '市況メモを貼り替える（画面上部で開きます）' : '市況メモを貼る（画面上部で開きます）'}
        </button>
      </div>
    </details>
  );
}
