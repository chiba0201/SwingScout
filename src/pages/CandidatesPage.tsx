import { useState } from 'react';
import { CandidateTable } from '../components/CandidateTable';
import { cx, PageTitle } from '../components/ui';
import { WeightsPanel } from '../components/WeightsPanel';
import { formatDateJa } from '../lib/calendar';
import { useAnalysis } from '../state/DataContext';

export function CandidatesPage() {
  const a = useAnalysis();
  const [scope, setScope] = useState<'top' | 'all'>('top');
  const list = scope === 'top' ? a.top : a.ranked;
  const options = [
    { id: 'top', label: `上位${a.top.length}` },
    { id: 'all', label: `全${a.ranked.length}件` },
  ] as const;

  return (
    <div className="space-y-4">
      <PageTitle title="スイング候補">
        <span className="text-[12px] text-muted">
          {a.window.pattern.label} ・ <span className="num">{formatDateJa(a.window.entryDate)}</span>〜
          <span className="num">{formatDateJa(a.window.exitDate)}</span>
        </span>
        <div role="radiogroup" aria-label="表示範囲" className="inline-flex rounded border border-rule-strong bg-panel p-0.5">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={scope === o.id}
              onClick={() => setScope(o.id)}
              className={cx(
                'rounded-sm px-3 py-1 text-[12px] font-semibold',
                scope === o.id ? 'bg-accent text-panel' : 'text-ink-2 hover:text-ink',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </PageTitle>

      <WeightsPanel />

      <section className="panel overflow-hidden" aria-label="候補一覧">
        <CandidateTable candidates={list} dimFrom={scope === 'all' ? a.top.length + 1 : undefined} />
      </section>

      <p className="text-[11.5px] leading-relaxed text-muted">
        需給・テクニカル・イベントは高いほど良く、リスクは高いほど危険（決算またぎ・急騰翌日・集中・流動性など）。
        同じセクター／テーマの銘柄が上位に重なると、下位側にリスク加点が入ります。行をクリックすると銘柄詳細へ。
      </p>
    </div>
  );
}
