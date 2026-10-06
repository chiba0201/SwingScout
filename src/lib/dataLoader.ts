/**
 * 静的JSON（data/manifest.json, data/*.json）の読み込み。
 * 相対パスで fetch するので、さくらのサブディレクトリ配置でもそのまま動く。
 */
import type { DataManifest, Dataset } from '../types/dataset';
import { DataLoadError, isObject, validateDataset } from './validate';

export { DataLoadError };

const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

async function fetchJson(file: string): Promise<unknown> {
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
    throw new DataLoadError(
      `${url} の取得に失敗しました（HTTP ${res.status}）。`,
      'data/ に JSON があるか確認してください（npm run data:mock でサンプルを再生成できます）。',
    );
  }
  try {
    return await res.json();
  } catch {
    throw new DataLoadError(`${url} がJSONとして読めません。`);
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
