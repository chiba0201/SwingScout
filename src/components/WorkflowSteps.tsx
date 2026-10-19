/**
 * 今日の運用ステップ（① 今日の市況 → ② 日足 → ③ 候補生成 → ④ 確認 → ⑤ レポート）。
 * 判定は src/lib/workflow.ts。ここは表示と、各ステップの行き先（リンク・ボタン）だけ。
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Workflow, WorkflowStep, WorkflowStepId } from '../lib/workflow';
import { IconDoc, IconEye } from './icons';
import { cx } from './ui';

/** 「いつでも」のステップ（済みにならない）は番号ではなくアイコンで示す */
const ANYTIME_ICON: Partial<Record<WorkflowStepId, typeof IconEye>> = {
  review: IconEye,
  report: IconDoc,
};

export interface StepAction {
  label: string;
  /** 画面遷移（Link） */
  to?: string;
  /** 同じ画面内の操作（スクロールなど） */
  onClick?: () => void;
}

/** 各ステップの既定の行き先 */
export const DEFAULT_STEP_ACTIONS: Record<WorkflowStepId, StepAction[]> = {
  market: [{ label: 'Todayで市況メモを貼る', to: '/today?update=1' }],
  prices: [{ label: 'データ更新へ', to: '/data-update' }],
  generate: [{ label: 'データ更新へ', to: '/data-update' }],
  review: [
    { label: 'ダッシュボード', to: '/' },
    { label: '候補一覧', to: '/candidates' },
  ],
  report: [{ label: 'レポートへ', to: '/report' }],
};

function StepMark({ step, size = 'md' }: { step: WorkflowStep; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-4 w-4 text-[9.5px]' : 'h-6 w-6 text-[12px]';
  const style =
    step.state === 'done'
      ? 'border-accent bg-accent text-panel'
      : step.state === 'todo'
        ? 'border-accent bg-panel text-accent'
        : 'border-rule-strong bg-panel text-ink-2';
  const Icon = step.state === 'anytime' ? ANYTIME_ICON[step.id] : undefined;
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full border font-bold', dim, style)} aria-hidden>
      {step.state === 'done' ? '✓' : Icon ? <Icon className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} /> : step.no}
    </span>
  );
}

const STATE_LABEL = { done: '済み', todo: '未完了', anytime: 'いつでも' } as const;

function ActionButton({ action, primary }: { action: StepAction; primary: boolean }) {
  const className = cx(
    'inline-flex items-center rounded border px-2 py-1 text-[12px] font-semibold whitespace-nowrap',
    primary ? 'border-accent bg-accent text-panel hover:bg-accent-strong' : 'border-rule-strong bg-panel text-ink hover:bg-panel-2',
  );
  if (action.to) {
    return (
      <Link to={action.to} className={className}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={action.onClick}>
      {action.label}
    </button>
  );
}

/** データ更新画面の冒頭に置く、ステップの一覧 */
export function WorkflowSteps({
  workflow,
  actions = {},
  aside,
}: {
  workflow: Workflow;
  /** ステップごとの行き先を上書き（未指定は DEFAULT_STEP_ACTIONS） */
  actions?: Partial<Record<WorkflowStepId, StepAction[]>>;
  aside?: ReactNode;
}) {
  const { steps, next } = workflow;
  return (
    <section className="panel overflow-hidden" aria-labelledby="workflow-title">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-2.5">
        <h2 id="workflow-title" className="text-[13px] font-bold">
          今日の運用ステップ
        </h2>
        <p className="text-[12px] text-ink-2">
          {next ? (
            <>
              次は <span className="font-bold text-accent">{next.no}. {next.title}</span>
            </>
          ) : (
            '今日の準備はすべて済んでいます'
          )}
          {aside}
        </p>
      </header>
      <ol className="grid grid-cols-1 md:grid-cols-5">
        {steps.map((s) => {
          const isNext = next?.id === s.id;
          const stepActions = actions[s.id] ?? DEFAULT_STEP_ACTIONS[s.id];
          return (
            <li
              key={s.id}
              className={cx(
                // PC は5列。説明文の長さが違ってもボタンが下で揃うよう、縦のフレックスにしてボタンを下端へ寄せる
                '-mb-px flex gap-3 border-b border-rule px-4 py-3 md:-mr-px md:flex-col md:gap-0 md:border-r md:border-b-0',
                isNext && 'bg-accent-soft/60 shadow-[inset_3px_0_0_var(--c-accent)] md:shadow-[inset_0_3px_0_var(--c-accent)]',
              )}
              aria-current={isNext ? 'step' : undefined}
            >
              <StepMark step={s} />
              <div className="min-w-0 flex-1 md:mt-1.5 md:flex md:flex-col">
                <h3 className="text-[13px] font-bold text-ink">
                  <span className="sr-only">
                    {s.no}. （{STATE_LABEL[s.state]}）
                  </span>
                  {s.title}
                </h3>
                <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{s.detail}</p>
                {stepActions.length > 0 && (
                  // 済んだステップのボタンはスマホでは省く（縦に長くなるため）
                  <div className={cx('mt-2 flex-wrap gap-1.5 md:mt-auto md:pt-2', s.state === 'done' ? 'hidden md:flex' : 'flex')}>
                    {stepActions.map((a) => (
                      <ActionButton key={a.label} action={a} primary={isNext && stepActions.length === 1} />
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** ダッシュボード上部の1行表示。詳しい手順はデータ更新画面へ */
export function WorkflowStrip({ workflow }: { workflow: Workflow }) {
  const { steps, next } = workflow;
  const target = next ? (DEFAULT_STEP_ACTIONS[next.id][0] ?? { label: 'データ更新へ', to: '/data-update' }) : null;
  return (
    <section className="panel flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2" aria-label="今日の運用ステップ">
      <span className="text-[12.5px] font-bold text-ink">今日の運用</span>
      <ol className="hidden items-center gap-3 lg:flex">
        {steps.map((s) => (
          <li key={s.id} className={cx('flex items-center gap-1 text-[12px]', next?.id === s.id ? 'font-bold text-accent' : 'text-ink-2')}>
            <StepMark step={s} size="sm" />
            <span className="sr-only">（{STATE_LABEL[s.state]}）</span>
            {s.title}
          </li>
        ))}
      </ol>
      <span className="text-[12px] text-ink-2 lg:hidden">
        {next ? (
          <>
            次は <span className="font-bold text-accent">{next.no}. {next.title}</span>
          </>
        ) : (
          '今日の準備は完了'
        )}
      </span>
      <span className="ml-auto flex items-center gap-3 text-[12px] font-semibold">
        {target?.to && (
          <Link to={target.to} className="text-accent hover:underline">
            {target.label} →
          </Link>
        )}
        <Link to="/data-update" className="text-ink-2 hover:text-accent hover:underline">
          手順を見る
        </Link>
      </span>
    </section>
  );
}
