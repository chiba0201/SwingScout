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
    description: '代表銘柄ユニバースからスイング候補を選定しています。',
  },
  watchlist: {
    mode: 'watchlist',
    label: 'お気に入り',
    shortLabel: 'お気に',
    description: 'お気に入り・注目銘柄だけを監視しています。',
  },
  local: {
    mode: 'local',
    label: 'ローカル',
    shortLabel: 'LOCAL',
    description: 'ローカルの実データファイルから生成しています。',
  },
  unknown: {
    mode: 'unknown',
    label: 'データ',
    shortLabel: 'DATA',
    description: 'データセットを表示しています。',
  },
};

export function datasetModeFromSource(source: string | undefined, isSample = false): DatasetModeInfo {
  if (isSample) return INFO.sample;
  if (source === 'universe') return INFO.universe;
  if (source === 'watchlist') return INFO.watchlist;
  if (source === 'local') return INFO.local;
  return INFO.unknown;
}

export function datasetModeFromLabel(entry: DataManifestEntry): DatasetModeInfo {
  if (entry.isSample) return INFO.sample;
  if (entry.label.includes('代表銘柄') || entry.label.includes('スクリーニング')) return INFO.universe;
  if (entry.label.includes('お気に入り') || entry.label.includes('監視')) return INFO.watchlist;
  return INFO.unknown;
}

export function datasetOptionLabel(entry: DataManifestEntry): string {
  const mode = datasetModeFromLabel(entry);
  return `${mode.label}: ${entry.label}`;
}
