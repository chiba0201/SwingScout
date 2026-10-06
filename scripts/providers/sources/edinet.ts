/**
 * EDINET 由来の業績データ（進捗率・前回サプライズ）の取り込み（未実装スタブ）。
 *
 * 方針:
 *   - EDINET の書類（四半期報告書・決算短信XBRL）や、それを蓄積したローカルDBから
 *     「通期計画に対する営業利益の進捗率」「前回決算の会社計画比」を計算する
 *   - APIキーが必要な取得経路は使わず、ローカルに保存した XBRL/CSV を読む前提にする
 *   - CsvEarningsSource の結果に progressRate / lastSurprise をマージする形で使う
 */
import type { EarningsInfo } from '../../../src/types/dataset';
import type { EarningsSource } from '../types';

export class EdinetFundamentalsSource implements EarningsSource {
  readonly id = 'edinet-fundamentals';

  async getEarnings(): Promise<Map<string, EarningsInfo>> {
    console.warn('[edinet] 未実装のため業績データは空で続行します');
    return new Map();
  }
}
