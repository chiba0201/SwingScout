/**
 * データセットの構造チェック（ブラウザ・Node 共通。import.meta.env に依存しない）。
 */
import { SCHEMA_VERSION, type Dataset } from '../types/dataset';
import { TODAY_SCHEMA_VERSION, type TodayMarket } from '../types/today';

export class DataLoadError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'DataLoadError';
  }
}

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 最低限の構造チェック。詳細なスキーマ検証が必要になったら zod 等に置き換える */
export function validateDataset(json: unknown, file = 'dataset'): Dataset {
  const fail = (what: string) => {
    throw new DataLoadError(`${file}: ${what}`, 'src/types/dataset.ts の Dataset 型と照合してください。');
  };
  if (!isObject(json)) return fail('オブジェクトではありません');
  if (!isObject(json.meta)) return fail('meta がありません');
  if (json.meta.schemaVersion !== SCHEMA_VERSION) {
    return fail(`schemaVersion が ${String(json.meta.schemaVersion)} です（期待値 ${SCHEMA_VERSION}）`);
  }
  if (typeof json.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(json.asOf)) return fail('asOf が YYYY-MM-DD ではありません');
  if (!isObject(json.marketContext)) return fail('marketContext がありません');
  if (!Array.isArray(json.candidates)) return fail('candidates が配列ではありません');
  if (json.universe !== undefined && !Array.isArray(json.universe)) fail('universe が配列ではありません');
  json.candidates.forEach((c, i) => {
    if (!isObject(c) || typeof c.code !== 'string' || !isObject(c.price) || !isObject(c.technical)) {
      fail(`candidates[${i}] の必須項目（code, price, technical）が不足しています`);
    }
  });
  return json as unknown as Dataset;
}

/** data/today-market.json の構造チェック */
export function validateTodayMarket(json: unknown, file = 'today-market.json'): TodayMarket {
  const fail = (what: string): never => {
    throw new DataLoadError(`${file}: ${what}`, 'src/types/today.ts の TodayMarket 型と照合してください。');
  };
  if (!isObject(json)) return fail('オブジェクトではありません');
  if (!isObject(json.meta)) return fail('meta がありません');
  if (json.meta.schemaVersion !== TODAY_SCHEMA_VERSION) {
    return fail(`schemaVersion が ${String(json.meta.schemaVersion)} です（期待値 ${TODAY_SCHEMA_VERSION}）`);
  }
  if (typeof json.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(json.asOf)) return fail('asOf が YYYY-MM-DD ではありません');
  for (const key of ['session', 'stance', 'headline'] as const) {
    if (typeof json[key] !== 'string' || json[key] === '') fail(`${key} がありません`);
  }
  if (!isObject(json.expectedOpen) || typeof json.expectedOpen.gapPct !== 'number' || typeof json.expectedOpen.label !== 'string') {
    fail('expectedOpen（label, gapPct）が不足しています');
  }
  if (!isObject(json.positionSize) || typeof json.positionSize.label !== 'string') fail('positionSize.label がありません');
  for (const key of ['externalQuotes', 'scenarios', 'events', 'domesticNotes'] as const) {
    if (!Array.isArray(json[key])) fail(`${key} が配列ではありません`);
  }
  const rules = json.watchlistRules;
  if (!isObject(rules) || typeof rules.gapUpAllowedPct !== 'number' || typeof rules.avoidIfRiskScoreOver !== 'number') {
    fail('watchlistRules（gapUpAllowedPct, avoidIfRiskScoreOver）が不足しています');
  }
  if (json.memoMarkdown !== undefined && typeof json.memoMarkdown !== 'string') fail('memoMarkdown は文字列で指定してください');
  return json as unknown as TodayMarket;
}
