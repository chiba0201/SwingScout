/**
 * アプリ全体のデータ状態。
 * - スイング：manifest → データセット読み込み → analyzeDataset（重み・保有パターンを反映）
 * - 銘柄リスト：スクリーニングの母集団（CSV）。お気に入りは favorite 列。候補一覧とデータ更新で共有する
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
import {
  carryOverFavorites,
  DEFAULT_UNIVERSE_CSV,
  favoriteCodes as readFavoriteCodes,
  LEGACY_DEFAULT_UNIVERSE_CSV,
  readUniverseEntries,
  setFavorite,
  universeCsvFromDataset,
} from '../lib/universeCsv';
import { readWorkSet } from './workSet';
import type { DataManifest, Dataset } from '../types/dataset';
import type { TodayMarket } from '../types/today';

const TOP_N = 6;
const STORAGE_KEY = 'swingscout:prefs:v1';
const MEMO_KEY = 'swingscout:today-memo:v1';
const TODAY_OVERRIDE_KEY = 'swingscout:today-override:v1';
const DATASET_OVERRIDE_KEY = 'swingscout:dataset-override:v1';
/** 以前の「お気に入り監視」の一時反映。廃止したので起動時に消す */
const LEGACY_FAVORITES_OVERRIDE_KEY = 'swingscout:favorites-override:v1';
const UNIVERSE_KEY = 'swingscout:universe:v1';

interface StoredUniverse {
  csv: string;
  updatedAt: string;
}

function readUniverse(): StoredUniverse | null {
  try {
    const v = JSON.parse(localStorage.getItem(UNIVERSE_KEY) ?? 'null') as StoredUniverse | null;
    return v && typeof v.csv === 'string' && v.csv.trim() ? v : null;
  } catch {
    return null;
  }
}

function writeUniverse(v: StoredUniverse): boolean {
  try {
    localStorage.setItem(UNIVERSE_KEY, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

/** 以前のお気に入り（data/favorites.json の3銘柄） */
const LEGACY_FAVORITE_CODES = ['6857', '8035', '8306'];

/**
 * 以前のデータ更新画面で編集していた銘柄リストを引き継ぐ（初期値のままなら null）。
 * お気に入りは「お気に入り監視」で作っていた内容から favorite 列に移す。
 */
function migrateLegacyUniverse(): StoredUniverse | null {
  const legacy = readWorkSet();
  const csv = legacy?.universeCsv;
  if (!csv?.trim() || csv.trim() === LEGACY_DEFAULT_UNIVERSE_CSV.trim()) return null;
  const favorites =
    legacy?.mode === 'favorites'
      ? readUniverseEntries(csv).map((e) => e.code) // お気に入り監視のリストだった
      : (readDatasetOverride(LEGACY_FAVORITES_OVERRIDE_KEY)?.candidates.map((c) => c.code) ?? LEGACY_FAVORITE_CODES);
  const migrated = { csv: carryOverFavorites(csv, new Set(favorites)), updatedAt: new Date().toISOString() };
  writeUniverse(migrated);
  return migrated;
}

function removeLegacyFavoritesOverride() {
  try {
    localStorage.removeItem(LEGACY_FAVORITES_OVERRIDE_KEY);
  } catch {
    /* 消せなくても読まないので問題ない */
  }
}

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

function readTodayOverride(): TodayMarket | null {
  try {
    const v = JSON.parse(localStorage.getItem(TODAY_OVERRIDE_KEY) ?? 'null') as TodayMarket | null;
    return v && typeof v.asOf === 'string' ? v : null;
  } catch {
    return null;
  }
}

function writeTodayOverride(today: TodayMarket | null): boolean {
  try {
    if (today) localStorage.setItem(TODAY_OVERRIDE_KEY, JSON.stringify(today));
    else localStorage.removeItem(TODAY_OVERRIDE_KEY);
    return true;
  } catch {
    return false;
  }
}

function readDatasetOverride(key: string): Dataset | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as Dataset | null;
    return v && typeof v.asOf === 'string' && Array.isArray(v.candidates) ? v : null;
  } catch {
    return null;
  }
}

function writeDatasetOverride(key: string, dataset: Dataset | null): boolean {
  try {
    if (dataset) localStorage.setItem(key, JSON.stringify(dataset));
    else localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * 画面上部の帯（データ選択）で選んだデータセット。defaultAt は選んだときの manifest の既定。
 * 既定が変わった（新しいデータを公開した）ら選択を捨てて新しい既定を開く。
 */
interface DatasetSelection {
  file: string;
  defaultAt: string;
}

interface Prefs {
  /** 以前の形式。開いたデータを選択の有無に関係なく保存していたので読まない */
  file?: string;
  selection?: DatasetSelection;
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
  datasetOverride: Dataset | null;
  setDatasetOverride: (dataset: Dataset | null) => boolean;
  /** 銘柄リスト（CSV）。この端末でまだ入稿していなければ、表示中のデータから作った初期値 */
  universeCsv: string;
  /** 銘柄リストを最後に入稿・変更した日時（初期値のままなら null） */
  universeUpdatedAt: string | null;
  /** 銘柄リストを入稿（置き換え）。保存できなかった場合は false */
  setUniverseCsv: (csv: string) => boolean;
  /** お気に入りの銘柄コード（銘柄リストの favorite 列） */
  favorites: Set<string>;
  /** お気に入りを付け外しする（銘柄リストの favorite 列を書き換える） */
  toggleFavorite: (code: string, on?: boolean) => void;
  reload: () => void;
  todayLoad: TodayLoadState;
  todayOverride: TodayMarket | null;
  /** ブラウザ保存の TodayMarket をセット（null で解除）。保存できなかった場合は false */
  setTodayOverride: (today: TodayMarket | null) => boolean;
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
  // ユーザーが選んだときだけ持つ。選んでいなければ manifest の既定（最新のデータ）を開く
  const [selection, setSelection] = useState<DatasetSelection | null>(prefs.selection ?? null);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [patternId, setPatternId] = useState(prefs.patternId ?? 'tue-fri');
  const [scoring, setScoring] = useState<ScoringConfig>(prefs.scoring ?? DEFAULT_SCORING_CONFIG);
  const [reloadKey, setReloadKey] = useState(0);
  const [todayLoad, setTodayLoad] = useState<TodayLoadState>({ status: 'loading' });
  const [todayOverride, setTodayOverrideState] = useState<TodayMarket | null>(readTodayOverride);
  const [datasetOverride, setDatasetOverrideState] = useState<Dataset | null>(() => readDatasetOverride(DATASET_OVERRIDE_KEY));
  const [storedUniverse, setStoredUniverse] = useState<StoredUniverse | null>(() => readUniverse() ?? migrateLegacyUniverse());
  useEffect(removeLegacyFavoritesOverride, []);
  const [storedMemo, setStoredMemo] = useState<StoredMemo | null>(readMemo);

  // 別のタブ・ウィンドウで変えたブラウザ保存の内容を、このタブにも反映する
  // （データ更新で候補を生成したとき、別ウィンドウの候補一覧も切り替わるように）
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage) return;
      const all = e.key === null; // localStorage.clear()
      if (all || e.key === DATASET_OVERRIDE_KEY) setDatasetOverrideState(readDatasetOverride(DATASET_OVERRIDE_KEY));
      if (all || e.key === UNIVERSE_KEY) setStoredUniverse(readUniverse());
      if (all || e.key === TODAY_OVERRIDE_KEY) setTodayOverrideState(readTodayOverride());
      if (all || e.key === MEMO_KEY) setStoredMemo(readMemo());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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

  // manifest を読み、選んだデータがまだ有効（存在し、その後に既定が変わっていない）ならそれを、無ければ既定を開く
  useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading' });
    loadManifest()
      .then((m) => {
        if (cancelled) return;
        setManifest(m);
        // 選んだあとに既定が変わっていたら、選択は捨てる（保存からも消す）
        setSelection((sel) => (sel && sel.defaultAt !== m.default ? null : sel));
        setFile((current) => {
          const chosen = prefs.selection?.defaultAt === m.default ? prefs.selection.file : null;
          const wanted = current ?? chosen;
          return wanted && m.datasets.some((d) => d.file === wanted) ? wanted : m.default;
        });
      })
      .catch((e: Error) => !cancelled && setLoad({ status: 'error', error: e }));
    return () => {
      cancelled = true;
    };
  }, [prefs.selection, reloadKey]);

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
    writePrefs({ selection: selection ?? undefined, patternId, scoring });
  }, [selection, patternId, scoring]);

  const effectiveLoad: LoadState = datasetOverride ? { status: 'ready', dataset: datasetOverride } : load;

  const analysis = useMemo(() => {
    if (effectiveLoad.status !== 'ready') return null;
    return analyzeDataset(effectiveLoad.dataset, {
      scoring,
      pattern: findHoldingPattern(patternId),
      topN: TOP_N,
    });
  }, [effectiveLoad, scoring, patternId]);

  const todayData = todayOverride ?? (todayLoad.status === 'ready' ? todayLoad.data : null);
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

  const setTodayOverride = useCallback((today: TodayMarket | null) => {
    setTodayOverrideState(today);
    return writeTodayOverride(today);
  }, []);

  const setDatasetOverride = useCallback((dataset: Dataset | null) => {
    setDatasetOverrideState(dataset);
    return writeDatasetOverride(DATASET_OVERRIDE_KEY, dataset);
  }, []);

  // 銘柄リスト：この端末で入稿・変更済みならそれ。無ければ表示中の実データ → 初期値（以前のお気に入り3銘柄）
  const datasetForSeed = effectiveLoad.status === 'ready' ? effectiveLoad.dataset : null;
  const universeCsv = useMemo(() => {
    if (storedUniverse) return storedUniverse.csv;
    if (datasetForSeed && !datasetForSeed.meta.isSample) return universeCsvFromDataset(datasetForSeed) ?? DEFAULT_UNIVERSE_CSV;
    return DEFAULT_UNIVERSE_CSV;
  }, [storedUniverse, datasetForSeed]);
  const favorites = useMemo(() => readFavoriteCodes(universeCsv), [universeCsv]);

  const setUniverseCsv = useCallback((csv: string) => {
    const next = { csv, updatedAt: new Date().toISOString() };
    setStoredUniverse(next);
    return writeUniverse(next);
  }, []);

  const toggleFavorite = useCallback(
    (code: string, on?: boolean) => setUniverseCsv(setFavorite(universeCsv, code, on ?? !favorites.has(code))),
    [universeCsv, favorites, setUniverseCsv],
  );

  const selectFile = useCallback(
    (nextFile: string) => {
      setDatasetOverride(null);
      setFile(nextFile);
      // 既定を選び直したら「選択なし」に戻す（次に新しいデータを公開したとき自動で切り替わる）
      setSelection(manifest && nextFile !== manifest.default ? { file: nextFile, defaultAt: manifest.default } : null);
    },
    [setDatasetOverride, manifest],
  );

  const resetScoring = useCallback(() => setScoring(DEFAULT_SCORING_CONFIG), []);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const value: DataContextValue = {
    load: effectiveLoad,
    manifest,
    file,
    selectFile,
    patternId,
    setPatternId,
    scoring,
    setScoring,
    resetScoring,
    isScoringDefault: JSON.stringify(scoring) === JSON.stringify(DEFAULT_SCORING_CONFIG),
    analysis,
    datasetOverride,
    setDatasetOverride,
    universeCsv,
    universeUpdatedAt: storedUniverse?.updatedAt ?? null,
    setUniverseCsv,
    favorites,
    toggleFavorite,
    reload,
    todayLoad,
    todayOverride,
    setTodayOverride,
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
