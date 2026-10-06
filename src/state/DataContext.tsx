/**
 * アプリ全体のデータ状態。
 * - スイング：manifest → データセット読み込み → analyzeDataset（重み・保有パターンを反映）
 * - Today：today-market.json ＋ 市況メモ（貼り付け or JSON同梱）→ analyzeToday
 * 画面側は useData() で結果を受け取るだけにして、計算ロジックを持たせない。
 * Today の読み込み失敗はスイング側の画面に影響させない（Today 画面などで個別に表示）。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { analyzeDataset, type DatasetAnalysis } from '../lib/analysis';
import { findHoldingPattern } from '../lib/calendar';
import { DataLoadError, loadDataset, loadManifest, loadTodayMarket } from '../lib/dataLoader';
import { parseMarketMemo, type ParsedMarketMemo } from '../lib/marketMemo';
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from '../lib/scoring';
import { analyzeToday, type TodayAnalysis } from '../lib/todayAnalysis';
import type { DataManifest, Dataset } from '../types/dataset';
import type { TodayMarket } from '../types/today';

const TOP_N = 6;
const STORAGE_KEY = 'swingscout:prefs:v1';
const MEMO_KEY = 'swingscout:today-memo:v1';

interface StoredMemo {
  text: string;
  savedAt: string;
}

function readMemo(): StoredMemo | null {
  try {
    const v = JSON.parse(localStorage.getItem(MEMO_KEY) ?? 'null') as StoredMemo | null;
    return v && typeof v.text === 'string' && v.text.trim() ? v : null;
  } catch {
    return null;
  }
}
function writeMemo(memo: StoredMemo | null): boolean {
  try {
    if (memo) localStorage.setItem(MEMO_KEY, JSON.stringify(memo));
    else localStorage.removeItem(MEMO_KEY);
    return true;
  } catch {
    return false;
  }
}

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

export type TodayLoadState =
  | { status: 'loading' }
  | { status: 'error'; error: DataLoadError | Error }
  | { status: 'ready'; data: TodayMarket };

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
  todayLoad: TodayLoadState;
  /** Today データとスイング分析の両方が揃ったときだけ値が入る */
  todayAnalysis: TodayAnalysis | null;
  /** 画面で貼り付けた市況メモ（ブラウザ保存）の原文。無ければ '' */
  pastedMemo: string;
  pastedMemoSavedAt: string | null;
  /** 貼り付けメモを保存（空文字で削除）。保存できなかった場合は false */
  setPastedMemo: (text: string) => boolean;
  /** 表示に使う市況メモ（貼り付け優先、無ければ today-market.json の memoMarkdown） */
  memo: ParsedMarketMemo | null;
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
  const [todayLoad, setTodayLoad] = useState<TodayLoadState>({ status: 'loading' });
  const [storedMemo, setStoredMemo] = useState<StoredMemo | null>(readMemo);

  useEffect(() => {
    let cancelled = false;
    setTodayLoad({ status: 'loading' });
    loadTodayMarket()
      .then((data) => !cancelled && setTodayLoad({ status: 'ready', data }))
      .catch((e: Error) => !cancelled && setTodayLoad({ status: 'error', error: e }));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

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

  const todayData = todayLoad.status === 'ready' ? todayLoad.data : null;
  const memo = useMemo(() => {
    if (storedMemo) return parseMarketMemo(storedMemo.text, { source: 'pasted', savedAt: storedMemo.savedAt });
    if (todayData?.memoMarkdown?.trim()) return parseMarketMemo(todayData.memoMarkdown, { source: 'json' });
    return null;
  }, [storedMemo, todayData]);

  const todayAnalysis = useMemo(
    () => (todayData && analysis ? analyzeToday(todayData, analysis, memo) : null),
    [todayData, analysis, memo],
  );

  const setPastedMemo = useCallback((text: string) => {
    const next = text.trim() ? { text, savedAt: new Date().toISOString() } : null;
    setStoredMemo(next);
    return writeMemo(next);
  }, []);

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
    todayLoad,
    todayAnalysis,
    pastedMemo: storedMemo?.text ?? '',
    pastedMemoSavedAt: storedMemo?.savedAt ?? null,
    setPastedMemo,
    memo,
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
