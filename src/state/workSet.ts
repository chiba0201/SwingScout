/**
 * データ更新画面の「作業セット」（入力内容の控え）。
 *
 * ブラウザ内の保存先は内容ごとに分かれている：
 *   - 銘柄リスト（CSV）… DataContext（swingscout:universe:v1）
 *   - 日足 … IndexedDB（state/priceStore.ts）
 *   - それ以外（基準日・信用残・決算予定日・地合い）… ここ（localStorage）
 * ファイルとして保存・読み込みするときは、すべてを1つの JSON にまとめる（別のPCで続ける・バックアップ用）。
 */
export const WORK_KEY = 'swingscout:data-update-work:v1';

/**
 * 地合いの決め方。today：Today の市況に連動（既定。Today を更新すると自動で変わる）／
 * manual：手で編集した・候補データの地合いを選んだ（marketJson に固定）
 */
export type MarketSource = 'today' | 'manual';

/** ブラウザに保存する部分 */
export interface StoredWorkSet {
  asOf: string;
  marginCsv: string;
  earningsCsv: string;
  marketJson: string;
  /** 無い（以前の形式）ときは today として扱う */
  marketSource?: MarketSource;
}

/** ファイルに保存する作業セット（すべての入力） */
export interface WorkSetFile extends StoredWorkSet {
  universeCsv: string;
  /** [銘柄コード, 日足CSV] */
  prices: [string, string][];
  pricesUpdatedAt?: string | null;
}

/** 以前の形式（銘柄リストと日足も localStorage に入っていた）。移行のために読む */
export interface LegacyWorkSet extends Partial<StoredWorkSet> {
  mode?: string;
  universeCsv?: string;
  prices?: [string, string][];
  pricesUpdatedAt?: string | null;
}

export function readWorkSet(): LegacyWorkSet | null {
  try {
    const v = JSON.parse(localStorage.getItem(WORK_KEY) ?? 'null') as LegacyWorkSet | null;
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/** 保存できなかった場合（容量超過・プライベートモード等）は false。作業自体は続けられる */
export function writeWorkSet(work: StoredWorkSet): boolean {
  try {
    localStorage.setItem(WORK_KEY, JSON.stringify(work));
    return true;
  } catch {
    return false;
  }
}

export function parseWorkSetFile(text: string): WorkSetFile {
  const json = JSON.parse(text) as WorkSetFile;
  if (!json || !Array.isArray(json.prices) || typeof json.universeCsv !== 'string') {
    throw new Error('作業セットのファイル形式が正しくありません（SwingScout で保存した .json を選んでください）');
  }
  return json;
}
