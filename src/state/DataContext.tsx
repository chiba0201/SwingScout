/**
 * アプリ全体のデータ状態。
 * manifest → データセット読み込み → analyzeDataset（重み・保有パターンを反映）までを担う。
 * 画面側は useData() で analysis を受け取るだけにして、計算ロジックを持たせない。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { analyzeDataset, type DatasetAnalysis } from '../lib/analysis';
import { findHoldingPattern } from '../lib/calendar';
import { DataLoadError, loadDataset, loadManifest } from '../lib/dataLoader';
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from '../lib/scoring';
import type { DataManifest, Dataset } from '../types/dataset';

const TOP_N = 6;
const STORAGE_KEY = 'swingscout:prefs:v1';

interface Prefs {
  file?: string;
  patternId?: string;
  scoring?: ScoringConfig;
}

// localStorage はプライベートモード等で使えないことがあるため、失敗しても動くようにする
function readPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Prefs;
  } catch {
    return {};
  }
}
function writePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* 保存できなくても動作には影響しない */
  }
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: DataLoadError | Error }
  | { status: 'ready'; dataset: Dataset };

interface DataContextValue {
  load: LoadState;
  manifest: DataManifest | null;
  file: string | null;
  selectFile: (file: string) => void;
  patternId: string;
  setPatternId: (id: string) => void;
  scoring: ScoringConfig;
  setScoring: (config: ScoringConfig) => void;
  resetScoring: () => void;
  isScoringDefault: boolean;
  analysis: DatasetAnalysis | null;
  reload: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [prefs] = useState(readPrefs);
  const [manifest, setManifest] = useState<DataManifest | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [patternId, setPatternId] = useState(prefs.patternId ?? 'tue-fri');
  const [scoring, setScoring] = useState<ScoringConfig>(prefs.scoring ?? DEFAULT_SCORING_CONFIG);
  const [reloadKey, setReloadKey] = useState(0);

  // manifest を読み、保存済みの選択がまだ存在すればそれを、無ければ既定を開く
  useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading' });
    loadManifest()
      .then((m) => {
        if (cancelled) return;
        setManifest(m);
        setFile((current) => {
          const wanted = current ?? prefs.file;
          return wanted && m.datasets.some((d) => d.file === wanted) ? wanted : m.default;
        });
      })
      .catch((e: Error) => !cancelled && setLoad({ status: 'error', error: e }));
    return () => {
      cancelled = true;
    };
  }, [prefs.file, reloadKey]);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    loadDataset(file)
      .then((dataset) => !cancelled && setLoad({ status: 'ready', dataset }))
      .catch((e: Error) => !cancelled && setLoad({ status: 'error', error: e }));
    return () => {
      cancelled = true;
    };
  }, [file, reloadKey]);

  useEffect(() => {
    writePrefs({ file: file ?? undefined, patternId, scoring });
  }, [file, patternId, scoring]);

  const analysis = useMemo(() => {
    if (load.status !== 'ready') return null;
    return analyzeDataset(load.dataset, {
      scoring,
      pattern: findHoldingPattern(patternId),
      topN: TOP_N,
    });
  }, [load, scoring, patternId]);

  const resetScoring = useCallback(() => setScoring(DEFAULT_SCORING_CONFIG), []);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const value: DataContextValue = {
    load,
    manifest,
    file,
    selectFile: setFile,
    patternId,
    setPatternId,
    scoring,
    setScoring,
    resetScoring,
    isScoringDefault: JSON.stringify(scoring) === JSON.stringify(DEFAULT_SCORING_CONFIG),
    analysis,
    reload,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData は DataProvider の内側で使ってください');
  return ctx;
}

/** analysis が確定している画面用。Layout 側で読み込み中・エラーを処理済みの前提 */
export function useAnalysis(): DatasetAnalysis {
  const { analysis } = useData();
  if (!analysis) throw new Error('analysis がまだありません');
  return analysis;
}
