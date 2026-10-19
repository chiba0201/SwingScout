/**
 * 作戦が暫定か（データ基準日が IN の前営業日より前）を示す印と説明。判定は analysis.ts の plan。
 * 作戦の価格は基準日の引けから計算するので、確定前は「目安」と分かるようにする。
 */
import { provisionalPlanMessage, type DatasetAnalysis } from '../lib/analysis';
import { cx } from './ui';

export function ProvisionalBadge({ a }: { a: DatasetAnalysis }) {
  if (!a.plan.provisional) return null;
  return (
    <span
      className="ml-2 inline-block rounded-sm border border-caution/50 bg-caution-soft px-1.5 align-middle text-[10.5px] leading-[1.6] font-bold text-caution"
      title={provisionalPlanMessage(a) ?? undefined}
    >
      暫定
    </span>
  );
}

export function ProvisionalNote({ a, className }: { a: DatasetAnalysis; className?: string }) {
  const message = provisionalPlanMessage(a);
  if (!message) return null;
  return <p className={cx('rounded-sm bg-caution-soft px-3 py-2 text-[12px] leading-relaxed text-caution', className)}>{message}</p>;
}
