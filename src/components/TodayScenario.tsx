/** 寄り付きシナリオ（大幅GU / 小幅GU・横ばい / GD）。想定寄りに近いものを強調する */
import type { OpenScenario } from '../types/today';
import { cx } from './ui';

export function TodayScenario({ scenarios, likelyId }: { scenarios: OpenScenario[]; likelyId: string | null }) {
  if (scenarios.length === 0) {
    return <p className="panel px-4 py-3 text-[12.5px] text-muted">シナリオが登録されていません。</p>;
  }
  return (
    <section className="panel overflow-hidden" aria-labelledby="today-scenarios">
      <header className="border-b border-rule px-4 py-2.5">
        <h2 id="today-scenarios" className="text-[13px] font-bold">
          寄り付きシナリオ
        </h2>
      </header>
      <ol className="grid grid-cols-1 md:grid-cols-3">
        {scenarios.map((s) => {
          const likely = s.id === likelyId;
          return (
            <li
              key={s.id}
              className={cx(
                '-mb-px border-b border-rule px-4 py-3 md:-mr-px md:border-r md:border-b-0',
                likely && 'bg-accent-soft/60 shadow-[inset_0_3px_0_var(--c-accent)]',
              )}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-bold">{s.label}</h3>
                {likely && (
                  <span className="rounded-sm bg-accent px-1.5 text-[10.5px] leading-[1.6] font-bold text-panel">想定に近い</span>
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
