/**
 * 入り方を「通常時・GU時・GD時」に分けて出す（銘柄詳細とレポートで共通）。
 * GD時は古いデータには無いが、analysis.ts が表示前に補う。
 */
import type { EntryPlan } from '../types/dataset';
import { cx } from './ui';

export function EntryPlanCases({ plan }: { plan: EntryPlan }) {
  const rows = [
    { label: '通常時', text: plan.method },
    ...(plan.gapUpRule ? [{ label: 'GU時', text: plan.gapUpRule }] : []),
    ...(plan.gapDownRule ? [{ label: 'GD時', text: plan.gapDownRule }] : []),
  ];
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={r.label} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-2">
          <span className="mt-[2px] rounded-sm border border-rule-strong bg-panel-2 text-center text-[11px] leading-[1.7] font-bold text-ink-2">
            {r.label}
          </span>
          <span className={cx(i === 0 ? 'text-ink' : 'text-[12.5px] text-ink-2')}>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}
