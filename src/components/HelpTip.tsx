/**
 * 見出しの横に置く「？」。hover かフォーカス（スマホはタップ）で吹き出しを出す。普段は隠しておきたい補足用。
 *
 * 吹き出しは「位置の基準になる親」（relative を付けた見出し）の左端から出す。
 * アイコンの位置から出すと、狭い画面で右にはみ出すため。矢印だけはアイコンの真下に出す。
 */
import { useId, type ReactNode } from 'react';
import { IconHelp } from './icons';

export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const show = 'invisible opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100';
  return (
    <span className="group inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="relative inline-flex h-5 w-5 items-center justify-center rounded-full text-muted hover:text-accent focus-visible:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        <IconHelp className="h-4 w-4" />
        <span className={`pointer-events-none absolute top-[calc(100%+0.3rem)] left-1/2 z-30 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-ink ${show}`} aria-hidden />
      </button>
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none absolute top-full right-0 left-0 z-20 mt-2 rounded bg-ink px-3 py-2 text-[12px] leading-relaxed font-normal text-panel shadow-lg sm:right-auto sm:w-72 ${show}`}
      >
        {children}
      </span>
    </span>
  );
}
