/**
 * 市況メモ（ChatGPT 等で作った Markdown）の抽出サマリー・原文・貼り付け欄。
 * 解析は src/lib/marketMemo.ts、保存は DataContext（localStorage）が担う。
 */
import { useEffect, useMemo, useState } from 'react';
import { formatDateTime } from '../lib/format';
import { marketContextFromToday } from '../lib/marketContextFromToday';
import type { ParsedMarketMemo } from '../lib/marketMemo';
import { renderMarkdown } from '../lib/markdown';
import { buildTodayFromMemo } from '../lib/todayBuilder';
import { useData } from '../state/DataContext';
import { TODAY_SCHEMA_VERSION, type TodayMarket } from '../types/today';

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

function jstToday(): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fallbackTodayBase(): TodayMarket {
  return {
    meta: { schemaVersion: TODAY_SCHEMA_VERSION, generatedAt: new Date().toISOString(), source: 'ui', isSample: false },
    asOf: jstToday(),
    session: '寄り前',
    stance: '様子見',
    expectedOpen: { label: '横ばい', gapPct: 0 },
    positionSize: { label: '通常の70〜100%' },
    headline: '市況メモから生成してください。',
    externalQuotes: [],
    scenarios: [
      {
        id: 'large-gap-up',
        label: '大幅GU',
        condition: '日経先物 +0.7%以上、または候補銘柄が寄り前気配で大きく上振れ',
        action: '寄り付きは追わず、9:15以降のVWAP押し目待ち',
        risk: '寄り天と利食い売り',
      },
      {
        id: 'flat-small-gap',
        label: '小幅GU/横ばい',
        condition: '日経先物 ±0.3%程度',
        action: '上位候補の出来高とVWAP回復を確認して分割エントリー',
        risk: '指数が伸びない場合は個別も失速',
      },
      {
        id: 'gap-down',
        label: 'GD',
        condition: '日経先物 -0.5%以上',
        action: '先物と半導体の下げ止まり確認まで待機',
        risk: '前日強かった銘柄ほど利確売りが出やすい',
      },
    ],
    events: [],
    domesticNotes: [],
    watchlistRules: { gapUpAllowedPct: 0.5, avoidIfRiskScoreOver: 65 },
  };
}

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
  const { pastedMemo, setPastedMemo, memo, todayLoad, todayAnalysis, todayOverride, setTodayOverride } = useData();
  const [draft, setDraft] = useState(pastedMemo);
  const [status, setStatus] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(() => todayAnalysis?.today.asOf ?? jstToday());
  const [session, setSession] = useState(() => todayAnalysis?.today.session ?? '寄り前');
  const currentToday = todayAnalysis?.today ?? (todayLoad.status === 'ready' ? todayLoad.data : null);

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

  const buildAndApply = () => {
    if (!draft.trim()) {
      setStatus('市況メモを貼り付けてから生成してください');
      return;
    }
    const base = currentToday ?? fallbackTodayBase();
    const today = buildTodayFromMemo(base, draft, { asOf, session, generatedAt: new Date().toISOString() });
    const okMemo = setPastedMemo(draft);
    const okToday = setTodayOverride(today);
    setStatus(okMemo && okToday ? 'Todayデータをこのブラウザに反映しました' : '画面には反映しましたが、ブラウザ保存に失敗しました');
  };

  const generatedToday = draft.trim() ? buildTodayFromMemo(currentToday ?? fallbackTodayBase(), draft, { asOf, session }) : null;

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[10rem_9rem_minmax(0,1fr)] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">対象日</span>
          <input className="field w-full" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">セッション</span>
          <select className="field w-full" value={session} onChange={(e) => setSession(e.target.value)}>
            {['寄り前', '前場', '昼休み', '後場', '引け後'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={buildAndApply} disabled={!draft.trim()}>
            Todayに反映
          </button>
          <button
            type="button"
            className="btn"
            disabled={!generatedToday}
            onClick={() => generatedToday && downloadJson('today-market.json', generatedToday)}
          >
            today-market.json
          </button>
          <button
            type="button"
            className="btn"
            disabled={!generatedToday}
            onClick={() => generatedToday && downloadJson('market.json', marketContextFromToday(generatedToday))}
          >
            market.json
          </button>
          {todayOverride && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setTodayOverride(null);
                setStatus('ブラウザ内のToday反映を解除しました');
              }}
            >
              反映を解除
            </button>
          )}
        </div>
      </div>
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
          「Todayに反映」はこのブラウザにだけ保存されます。公開用には JSON をダウンロードして `data/` へ置いてください。
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
