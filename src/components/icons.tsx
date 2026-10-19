/**
 * レポート閲覧などで使う小さな線アイコン（16px・currentColor）。
 * 装飾ではなく「どの種類の情報か」を見分ける目印として、見出しと注意書きにだけ使う。
 */
import type { ReactNode } from 'react';
import { cx } from './ui';

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cx('h-4 w-4 shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

/** 今日（日の出） */
export const IconSun = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="8" cy="8" r="2.8" />
    <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
  </Svg>
);

/** 地合い（折れ線） */
export const IconMarket = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M1.8 13.5h12.4" />
    <path d="M2.5 10.5l3.2-3.4 2.6 2.2 4.9-5.3" />
    <path d="M10.6 4h2.6v2.6" />
  </Svg>
);

/** イベント（カレンダー） */
export const IconCalendar = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M2 6.5h12M5.2 1.8v2.4M10.8 1.8v2.4" />
  </Svg>
);

/** 候補（一覧） */
export const IconList = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M6 4h8M6 8h8M6 12h8" />
    <circle cx="2.8" cy="4" r=".7" fill="currentColor" />
    <circle cx="2.8" cy="8" r=".7" fill="currentColor" />
    <circle cx="2.8" cy="12" r=".7" fill="currentColor" />
  </Svg>
);

/** 運用上の注意（盾） */
export const IconShield = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M8 1.8l5 1.9v4c0 3.1-2.1 5.3-5 6.5-2.9-1.2-5-3.4-5-6.5v-4z" />
    <path d="M5.8 8l1.6 1.6 2.9-3" />
  </Svg>
);

/** 相関（重なる円） */
export const IconLink = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="6" cy="8" r="3.6" />
    <circle cx="10" cy="8" r="3.6" />
  </Svg>
);

/** 寄り付き・ギャップ（上向き矢印） */
export const IconGap = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M2 12.5h4v-3h4v-5h4" />
    <path d="M11.5 2.5l2.5 2-2.5 2" />
  </Svg>
);

/** 資金・サイズ（はかり） */
export const IconScale = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M8 2v12M4.5 14h7M3 4.5h10" />
    <path d="M3 4.5L1.5 8.5a1.6 1.6 0 003 0zM13 4.5l-1.5 4a1.6 1.6 0 003 0z" />
  </Svg>
);

/** 需給（出来高の棒） */
export const IconFlow = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 13.5V9M6.3 13.5V5.5M9.7 13.5V7.5M13 13.5V3" />
  </Svg>
);

/** テクニカル（ローソク足） */
export const IconCandle = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5 2v2.5M5 10v4M11 3.5V6M11 11.5V14" />
    <rect x="3.5" y="4.5" width="3" height="5.5" rx=".4" />
    <rect x="9.5" y="6" width="3" height="5.5" rx=".4" />
  </Svg>
);

/** ファンダ・イベント（書類） */
export const IconDoc = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 1.8h5.5L12.5 5v9.2H4z" />
    <path d="M9.3 1.8V5h3.2M6 8h4.5M6 10.8h4.5" />
  </Svg>
);

/** 確認する（目） */
export const IconEye = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M1.5 8s2.4-4.3 6.5-4.3S14.5 8 14.5 8s-2.4 4.3-6.5 4.3S1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
  </Svg>
);

/** ヘルプ（丸囲みの？） */
export const IconHelp = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="8" cy="8" r="6.3" />
    <path d="M6.3 6.2a1.8 1.8 0 1 1 2.5 1.6c-.5.2-.8.6-.8 1.1v.4" />
    <path d="M8 11.4v.1" strokeWidth="1.8" />
  </Svg>
);

/** 閉じる（×） */
export const IconClose = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
);

/** 保存（下向き矢印） */
export const IconDownload = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M8 2v8.5M4.8 7.5L8 10.7l3.2-3.2M2.5 13.8h11" />
  </Svg>
);

/** 外部リンク（新しいタブ） */
export const IconExternal = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M9.5 2.5h4v4M13.5 2.5L7.5 8.5" />
    <path d="M12 9.5v3.2a.8.8 0 01-.8.8H3.3a.8.8 0 01-.8-.8V4.8a.8.8 0 01.8-.8h3.2" />
  </Svg>
);

/** 設定・作業（歯車）。外周の破線が歯になる */
export const IconGear = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="8" cy="8" r="5.9" strokeWidth="2.1" strokeDasharray="2.3 2.33" strokeLinecap="butt" />
    <circle cx="8" cy="8" r="4.4" />
    <circle cx="8" cy="8" r="1.7" />
  </Svg>
);
