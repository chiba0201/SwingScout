/**
 * 今日の運用ステップ（src/lib/workflow.ts）を、アプリの状態から組み立てるフック。
 * データ更新画面は入力中の内容（live）を渡す。他の画面では銘柄リストと日足の索引（localStorage）から計算する。
 */
import { useMemo } from 'react';
import { isBrowserGenerated } from '../lib/datasetMode';
import { buildWorkflow, priceCoverage, type PriceCoverage, type Workflow } from '../lib/workflow';
import { useData } from './DataContext';
import { readPriceIndex } from './priceStore';
import { readWorkSet } from './workSet';

/** 日足を持っている銘柄。まだ IndexedDB へ移していない以前の作業セットも見る */
function storedPriceCodes(): { codes: string[]; updatedAt: string | null } {
  const index = readPriceIndex();
  if (index.codes.length > 0) return index;
  const legacy = readWorkSet();
  return { codes: (legacy?.prices ?? []).map(([code]) => code), updatedAt: legacy?.pricesUpdatedAt ?? null };
}

export function useWorkflow(live?: PriceCoverage | null): Workflow {
  const { todayAnalysis, todayOverride, analysis, universeCsv } = useData();

  const stored = useMemo(() => {
    if (live !== undefined) return null;
    const { codes, updatedAt } = storedPriceCodes();
    return priceCoverage(universeCsv, codes, updatedAt);
  }, [live, universeCsv]);

  const today = todayAnalysis?.today;
  const meta = analysis?.dataset.meta;

  return useMemo(
    () =>
      buildWorkflow({
        today: today ? { asOf: today.asOf, session: today.session, fromBrowser: !!todayOverride } : null,
        dataset:
          analysis && meta
            ? { asOf: analysis.dataset.asOf, isSample: meta.isSample, fromBrowser: isBrowserGenerated(meta.source) }
            : null,
        prices: live !== undefined ? live : stored,
      }),
    [today, todayOverride, analysis, meta, live, stored],
  );
}
