/**
 * JPX「銘柄別信用取引週末残高」の取り込み（未実装スタブ）。
 *
 * 入手: https://www.jpx.co.jp/markets/statistics-equities/margin/index.html
 *       毎週・第2営業日（通常火曜）に前週末時点の残高がPDFで公表される。
 * 実装方針:
 *   1. PDF を raw-data/jpx/margin/<YYYYMMDD>.pdf に手動保存（またはダウンロードスクリプト）
 *   2. pdfjs-dist 等でテキスト抽出 → 銘柄コード・売残・買残・前週比を正規表現で取り出す
 *   3. 今週分と前週分の2ファイルから MarginSnapshot を組み立てる
 * 実装するまでは空の結果を返し、パイプラインは信用残なし（null）として続行する。
 */
import type { MarginSnapshot } from '../../../src/types/dataset';
import type { MarginSource } from '../types';

export class JpxMarginPdfSource implements MarginSource {
  readonly id = 'jpx-margin-pdf';

  async getMarginBalances(): Promise<Map<string, MarginSnapshot>> {
    console.warn('[jpx-margin-pdf] 未実装のため信用残は空で続行します');
    return new Map();
  }
}
