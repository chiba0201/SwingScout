import { useEffect, useMemo, useState } from 'react';
import { analyzeDataset, type DatasetAnalysis } from '../lib/analysis';
import { findHoldingPattern } from '../lib/calendar';
import { loadFavoritesDataset, type DataLoadError } from '../lib/dataLoader';
import { useData } from './DataContext';
import type { Dataset } from '../types/dataset';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: DataLoadError | Error }
  | { status: 'ready'; dataset: Dataset };

export function useFavoritesAnalysis(): {
  load: LoadState;
  analysis: DatasetAnalysis | null;
  reload: () => void;
} {
  const { scoring, patternId, favoritesOverride } = useData();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (favoritesOverride) {
      setLoad({ status: 'ready', dataset: favoritesOverride });
      return;
    }
    let cancelled = false;
    setLoad({ status: 'loading' });
    loadFavoritesDataset()
      .then((dataset) => !cancelled && setLoad({ status: 'ready', dataset }))
      .catch((error: Error) => !cancelled && setLoad({ status: 'error', error }));
    return () => {
      cancelled = true;
    };
  }, [favoritesOverride, reloadKey]);

  const analysis = useMemo(() => {
    if (load.status !== 'ready') return null;
    return analyzeDataset(load.dataset, {
      scoring,
      pattern: findHoldingPattern(patternId),
      topN: Math.min(6, load.dataset.candidates.length || 6),
    });
  }, [load, patternId, scoring]);

  return { load, analysis, reload: () => setReloadKey((x) => x + 1) };
}
