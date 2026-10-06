/** data/manifest.json の読み書き */
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { DataManifest, Dataset } from '../../src/types/dataset';

export const DATA_DIR = resolve('data');
export const MANIFEST_PATH = resolve(DATA_DIR, 'manifest.json');

export async function readManifest(): Promise<DataManifest | null> {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as DataManifest;
  } catch {
    return null;
  }
}

/**
 * データセットを manifest に登録（同名ファイルは置き換え）。
 * 既定データセットの切り替えルール:
 *   - 実データ（isSample=false）は常に既定にする
 *   - サンプルは、実データが1件も無いときだけ既定にする
 */
export async function upsertManifest(filePath: string, dataset: Dataset, label: string): Promise<DataManifest> {
  const file = basename(filePath);
  const current = (await readManifest()) ?? { default: file, datasets: [] };
  const datasets = [
    {
      file,
      asOf: dataset.asOf,
      label,
      isSample: dataset.meta.isSample,
      generatedAt: dataset.meta.generatedAt,
    },
    ...current.datasets.filter((d) => d.file !== file),
  ].sort((a, b) => b.asOf.localeCompare(a.asOf) || Number(a.isSample) - Number(b.isSample));

  const hasReal = datasets.some((d) => !d.isSample);
  const defaultFile =
    !dataset.meta.isSample || !hasReal
      ? file
      : datasets.some((d) => d.file === current.default)
        ? current.default
        : file;

  const manifest: DataManifest = { default: defaultFile, datasets };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
