/**
 * TDnet 適時開示から材料（Catalyst）を作る（未実装スタブ）。
 *
 * 方針:
 *   - 適時開示一覧（日付別）をローカルに保存し、タイトルからルールで分類する
 *     例: 「上方修正」「自己株式取得」「増配」→ positive / 「下方修正」「公募増資」→ negative
 *   - 分類ルールはこのファイル内に表で持ち、運用しながら育てる
 */
import type { Catalyst } from '../../../src/types/dataset';
import type { DisclosureSource } from '../types';

export class TdnetDisclosureSource implements DisclosureSource {
  readonly id = 'tdnet';

  async getCatalysts(): Promise<Map<string, Catalyst[]>> {
    console.warn('[tdnet] 未実装のため材料は空で続行します');
    return new Map();
  }
}
