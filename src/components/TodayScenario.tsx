/**
 * 寄り付きシナリオ（大幅GU / 小幅GU・横ばい / GD）。寄り付きに近いものを強調し、ほかの2つは薄くする。
 * 薄いシナリオも「想定が外れたときの切り替え先」なので、カーソルを合わせると元の濃さで読める。
 *
 * 寄る前は想定寄り（先物から推定）で選び、寄った後に「実際の寄り」を入れるとそちらで選び直す
 * （監視銘柄の扱いも実際の寄りで判定し直す。判定は src/lib/todayAnalysis.ts）。
 */
import { useState, type FormEvent } from 'react';
import { formatPct } from '../lib/format';
import { parseActualOpen, type TodayAnalysis } from '../lib/todayAnalysis';
import { openGapLabel } from '../lib/todayBuilder';
import { useData } from '../state/DataContext';
import { cx, directionClass } from './ui';

const yen = (n: number) => n.toLocaleString('ja-JP', { maximumFractionDigits: 2 });
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });

function Pct({ pct }: { pct: number }) {
  return <span className={cx('num font-semibold', directionClass(pct))}>{formatPct(pct, 2)}</span>;
}

/** 実際の寄りの入力（金額でも％でも）。入力中に換算結果を出し、反映すると Today に保存する */
function ActualOpenControl({ t }: { t: TodayAnalysis }) {
  const { setTodayOverride } = useData();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const actual = t.today.actualOpen;
  const parsed = text.trim() ? parseActualOpen(text, t.previousClose) : null;

  const apply = (e: FormEvent) => {
    e.preventDefault();
    if (!parsed) return;
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    const { kind: _kind, ...value } = parsed;
    setTodayOverride({ ...t.today, actualOpen: { ...value, source: 'input', at: new Date().toISOString() } });
    setText('');
    setError(null);
  };

  if (actual) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-2">
        <span className="font-semibold text-ink">実際の寄り</span>
        <Pct pct={actual.gapPct} />
        <span className="font-semibold">{openGapLabel(actual.gapPct)}</span>
        {actual.price !== undefined && <span className="num text-muted">（{yen(actual.price)}）</span>}
        <span className="text-muted">{actual.source === 'memo' ? '市況メモから' : `${time(actual.at)} 入力`}</span>
        <button
          type="button"
          className="font-semibold text-accent hover:underline"
          onClick={() => setTodayOverride({ ...t.today, actualOpen: undefined })}
        >
          入れ直す
        </button>
      </p>
    );
  }

  const ok = parsed && !('error' in parsed) ? parsed : null;
  return (
    <form onSubmit={apply} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
      <label className="flex items-center gap-2">
        <span className="font-semibold text-ink-2">寄った後に、実際の寄りを入力</span>
        <input
          className="field w-36 py-1 text-[12.5px]"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder="71250 / +0.8%"
          aria-describedby="actual-open-hint"
        />
      </label>
      <button type="submit" className="btn px-2.5 py-1 text-[12px]" disabled={!ok}>
        反映
      </button>
      <span id="actual-open-hint" className="text-muted" role="status">
        {error ? (
          <span className="text-caution">{error}</span>
        ) : ok ? (
          <>
            ＝ {ok.kind === 'pct' && ok.price !== undefined && <span className="num">≈ {yen(ok.price)} ・ </span>}
            <Pct pct={ok.gapPct} /> {openGapLabel(ok.gapPct)}
            {ok.basePrice !== undefined && `（前日終値 ${yen(ok.basePrice)} 比）`}
          </>
        ) : (
          '日経平均の始値か前日比％'
        )}
      </span>
    </form>
  );
}

export function TodayScenario({ analysis: t }: { analysis: TodayAnalysis }) {
  const scenarios = t.today.scenarios;
  const likelyId = t.likelyScenarioId;
  const actual = t.open.basis === 'actual';
  if (scenarios.length === 0) {
    return <p className="panel px-4 py-3 text-[12.5px] text-muted">シナリオが登録されていません。</p>;
  }
  return (
    <section className="panel overflow-hidden" aria-labelledby="today-scenarios">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule px-4 py-2.5">
        <h2 id="today-scenarios" className="text-[13px] font-bold">
          寄り付きシナリオ
          {t.open.basis === 'unknown' && (
            <span className="ml-2 text-[11.5px] font-normal text-muted">想定寄りが未確認のため、寄るまでどれも強調しません</span>
          )}
        </h2>
        <ActualOpenControl t={t} />
      </header>
      <ol className="grid grid-cols-1 md:grid-cols-3">
        {scenarios.map((s) => {
          const likely = s.id === likelyId;
          const dimmed = likelyId !== null && !likely;
          // 実際の寄りが想定と違うシナリオになったら、想定していた方に小さく印を残す
          const wasExpected = actual && s.id === t.expectedScenarioId && !likely;
          return (
            <li
              key={s.id}
              aria-current={likely ? 'true' : undefined}
              className={cx(
                '-mb-px border-b border-rule px-4 py-3 md:-mr-px md:border-r md:border-b-0',
                likely && 'bg-accent-soft/60 shadow-[inset_0_3px_0_var(--c-accent)]',
                dimmed && 'opacity-45 transition-opacity hover:opacity-100 focus-within:opacity-100',
              )}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-bold">{s.label}</h3>
                {likely && (
                  <span className="rounded-sm bg-accent px-1.5 text-[10.5px] leading-[1.6] font-bold text-panel">
                    {actual ? '実際の寄り' : '想定に近い'}
                  </span>
                )}
                {wasExpected && (
                  <span className="rounded-sm border border-rule-strong px-1.5 text-[10.5px] leading-[1.6] font-bold text-ink-2">想定</span>
                )}
              </div>
              <p className="mt-0.5 text-[11.5px] text-muted">{s.condition}</p>
              <dl className="mt-2 space-y-1.5 text-[13px]">
                <div>
                  <dt className="text-[11px] font-semibold text-ink-2">動き方</dt>
                  <dd className="text-ink">{s.action}</dd>
                </div>
                {s.risk && (
                  <div>
                    <dt className="text-[11px] font-semibold text-ink-2">リスク</dt>
                    <dd className="text-caution">{s.risk}</dd>
                  </div>
                )}
              </dl>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
