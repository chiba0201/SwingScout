/** スコア配分の調整。変更は即座に再スコア・再順位付けされ、ブラウザに保存される */
import { useData } from '../state/DataContext';

const CATEGORY_FIELDS = [
  { key: 'supplyDemand', label: '需給' },
  { key: 'technical', label: 'テクニカル' },
  { key: 'event', label: 'イベント' },
] as const;

export function WeightsPanel() {
  const { scoring, setScoring, resetScoring, isScoringDefault } = useData();
  const w = scoring.categoryWeights;
  const sum = w.supplyDemand + w.technical + w.event || 1;

  return (
    <details className="panel group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-[13px] [&::-webkit-details-marker]:hidden">
        <span className="shrink-0 font-bold whitespace-nowrap">
          スコア配分
          {!isScoringDefault && <span className="ml-2 text-[11px] font-semibold text-accent">カスタム</span>}
        </span>
        <span className="num truncate text-[12px] text-muted">
          需給{Math.round((w.supplyDemand / sum) * 100)}% ・ テク{Math.round((w.technical / sum) * 100)}% ・ イベント
          {Math.round((w.event / sum) * 100)}% ・ リスク×{scoring.riskPenalty.toFixed(2)}
          <span className="ml-2 inline-block transition-transform group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </span>
      </summary>
      <div className="border-t border-rule px-4 py-3">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORY_FIELDS.map((f) => (
            <label key={f.key} className="block text-[12px]">
              <span className="flex justify-between text-ink-2">
                {f.label}
                <span className="num text-ink">{w[f.key]}</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={w[f.key]}
                onChange={(e) =>
                  setScoring({ ...scoring, categoryWeights: { ...w, [f.key]: Number(e.target.value) } })
                }
                className="mt-1 w-full accent-[var(--c-accent)]"
              />
            </label>
          ))}
          <label className="block text-[12px]">
            <span className="flex justify-between text-ink-2">
              リスク減点（1点あたり）
              <span className="num text-ink">{scoring.riskPenalty.toFixed(2)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={0.6}
              step={0.05}
              value={scoring.riskPenalty}
              onChange={(e) => setScoring({ ...scoring, riskPenalty: Number(e.target.value) })}
              className="mt-1 w-full accent-[var(--c-caution-fill)]"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11.5px] text-muted">
            総合 ＝（需給×a ＋ テク×b ＋ イベント×c）÷（a＋b＋c）− リスク × 減点係数。各指標の定義は src/lib/scoring.ts の FACTORS。
          </p>
          <button type="button" className="btn" onClick={resetScoring} disabled={isScoringDefault}>
            既定に戻す
          </button>
        </div>
      </div>
    </details>
  );
}
