/**
 * 静的JSON（data/manifest.json, data/*.json）の読み込み。
 * 相対パスで fetch するので、さくらのサブディレクトリ配置でもそのまま動く。
 */
import type { DataManifest, Dataset } from '../types/dataset';
import type { TodayMarket } from '../types/today';
import { DataLoadError, isObject, validateDataset, validateTodayMarket } from './validate';

export { DataLoadError };

const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

async function fetchJson(
  file: string,
  notFoundHint = 'data/ に JSON があるか確認してください（npm run data:mock でサンプルを再生成できます）。',
): Promise<unknown> {
  const url = `${DATA_BASE}${file}`;
  let res: Response;
  try {
    // no-cache: サーバーに更新確認をさせる（JSONだけ差し替えた直後でも古いデータを掴まない）
    res = await fetch(url, { cache: 'no-cache' });
  } catch {
    throw new DataLoadError(
      `${url} を取得できませんでした。`,
      'index.html をファイルとして直接開いている場合は、npm run preview かWebサーバー経由で開いてください。',
    );
  }
  if (!res.ok) {
    throw new DataLoadError(`${url} の取得に失敗しました（HTTP ${res.status}）。`, notFoundHint);
  }
  try {
    return await res.json();
  } catch {
    throw new DataLoadError(`${url} がJSONとして読めません。`, 'JSONの書式（カンマ・括弧・引用符）が壊れていないか確認してください。');
  }
}

export async function loadManifest(): Promise<DataManifest> {
  const json = await fetchJson('manifest.json');
  if (!isObject(json) || typeof json.default !== 'string' || !Array.isArray(json.datasets)) {
    throw new DataLoadError('data/manifest.json の形式が正しくありません。');
  }
  return json as unknown as DataManifest;
}

export async function loadDataset(file: string): Promise<Dataset> {
  return validateDataset(await fetchJson(file), file);
}

export const FAVORITES_FILE = 'favorites.json';

export async function loadFavoritesDataset(): Promise<Dataset> {
  const hint =
    'data/favorites.json がありません。raw-data/watchlist.csv を用意して npm run data:favorites を実行してください。';
  return validateDataset(await fetchJson(FAVORITES_FILE, hint), FAVORITES_FILE);
}

/** Today（当日の市況）は毎朝上書きする1ファイル運用 */
export const TODAY_FILE = 'today-market.json';

export async function loadTodayMarket(): Promise<TodayMarket> {
  const hint = 'data/today-market.json を配置してください（形式は src/types/today.ts、README の「Today」を参照）。';
  return validateTodayMarket(await fetchJson(TODAY_FILE, hint), TODAY_FILE);
}
