/**
 * データセットの種類（サンプル / 代表銘柄 / 監視リスト …）と、画面に出す説明文。
 * データ更新画面で生成した「このブラウザだけのデータ」は source が browser-* になる。
 */
import type { DataManifestEntry } from '../types/dataset';

export type DatasetMode = 'sample' | 'universe' | 'watchlist' | 'local' | 'unknown';

export interface DatasetModeInfo {
  mode: DatasetMode;
  label: string;
  shortLabel: string;
  description: string;
}

const INFO: Record<DatasetMode, DatasetModeInfo> = {
  sample: {
    mode: 'sample',
    label: 'サンプル',
    shortLabel: 'SAMPLE',
    description: '架空データです。実在銘柄の推奨ではありません。',
  },
  universe: {
    mode: 'universe',
    label: '代表銘柄',
    shortLabel: '代表',
    description: '代表的な銘柄の中から、今週のスイング候補を選んでいます。',
  },
  watchlist: {
    mode: 'watchlist',
    label: '監視リスト',
    shortLabel: '監視',
    description: '自分で選んだ監視リストの銘柄だけを採点しています。',
  },
  local: {
    mode: 'local',
    label: 'ローカル',
    shortLabel: 'LOCAL',
    description: '手元の実データファイルから作った候補です。',
  },
  unknown: {
    mode: 'unknown',
    label: 'データ',
    shortLabel: 'DATA',
    description: 'データセットを表示しています。',
  },
};

/** データ更新画面でこのブラウザ内に生成したデータか */
export function isBrowserGenerated(source: string | undefined): boolean {
  return !!source && source.startsWith('browser-');
}

export function datasetModeFromSource(source: string | undefined, isSample = false): DatasetModeInfo {
  if (isSample) return INFO.sample;
  if (source === 'universe' || source === 'browser-universe') return INFO.universe;
  // browser-favorites は廃止した「お気に入り監視」で作ったデータ（古いブラウザ保存分の表示用）
  if (source === 'watchlist' || source === 'browser-favorites') return INFO.watchlist;
  if (source === 'local') return INFO.local;
  return INFO.unknown;
}

export function datasetModeFromLabel(entry: DataManifestEntry): DatasetModeInfo {
  if (entry.isSample) return INFO.sample;
  if (entry.label.includes('代表銘柄') || entry.label.includes('スクリーニング')) return INFO.universe;
  if (entry.label.includes('お気に入り') || entry.label.includes('監視')) return INFO.watchlist;
  return INFO.unknown;
}

/** ヘッダーのデータ選択に出す短い名前（日付は呼び出し側で付ける） */
export function datasetOptionLabel(entry: DataManifestEntry): string {
  return datasetModeFromLabel(entry).label;
}
