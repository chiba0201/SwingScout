/**
 * 日々の運用ステップ（今日の市況 → 日足 → 候補生成 → 確認 → レポート）の進み具合を判定する。
 * 画面（データ更新・ダッシュボード）はここの結果を表示するだけにする。
 *
 * 「済み」の基準
 *   ① 今日の市況 … Today データの対象日が日本時間の今日以降
 *   ② 日足       … 銘柄リストの全銘柄に日足があり、最新の引けの後に取得したもの
 *                   （③ が最新なら、日足は済んでいるとみなす）
 *   ③ 候補生成   … 表示中の候補データ（サンプル以外）が最新の引けの日付以降
 */
import type { ISODate } from '../types/dataset';
import { formatDateJa, latestCloseDate, todayJst, toTime } from './calendar';
import { csvToRecords } from './csv';

export type WorkflowStepId = 'market' | 'prices' | 'generate' | 'review' | 'report';

/** done: 済み / todo: 今日まだ / anytime: 状態を持たない（いつでも） */
export type WorkflowStepState = 'done' | 'todo' | 'anytime';

export interface WorkflowStep {
  id: WorkflowStepId;
  no: number;
  title: string;
  state: WorkflowStepState;
  /** いまの状態を一言で */
  detail: string;
}

export interface PriceCoverage {
  have: number;
  need: number;
  missing: string[];
  /** 日足を最後に取得・読み込みした日時（ISO） */
  updatedAt?: string | null;
}

export interface WorkflowInput {
  now?: Date;
  today: { asOf: ISODate; session: string; fromBrowser: boolean } | null;
  dataset: { asOf: ISODate; isSample: boolean; fromBrowser: boolean } | null;
  /** データ更新画面の作業内容から計算した日足の揃い具合（不明なら null） */
  prices: PriceCoverage | null;
}

export interface Workflow {
  steps: WorkflowStep[];
  /** 最初の未完了ステップ。すべて済みなら null */
  next: WorkflowStep | null;
  /** その時点の最新の引け（候補データの鮮度の基準） */
  latestClose: ISODate;
}

/** 銘柄CSV（code 列 or コード 列）から銘柄コードを取り出す */
export function universeCodes(csv: string): string[] {
  const codes = csvToRecords(csv)
    .map((r) => (r.code ?? r['コード'] ?? '').trim())
    .filter(Boolean);
  return [...new Set(codes)];
}

export function priceCoverage(universeCsv: string, priceCodes: Iterable<string>, updatedAt?: string | null): PriceCoverage {
  const have = new Set(priceCodes);
  const need = universeCodes(universeCsv);
  const missing = need.filter((code) => !have.has(code));
  return { have: need.length - missing.length, need: need.length, missing, updatedAt };
}

/** Today データが今日の分か */
export function isTodayFresh(asOf: ISODate | null | undefined, now?: Date): boolean {
  return !!asOf && toTime(asOf) >= toTime(todayJst(now));
}

/** 日足が「最新の引け」の後に取得されたものか */
function pricesFresh(updatedAt: string | null | undefined, now?: Date): boolean {
  if (!updatedAt) return false;
  const at = new Date(updatedAt);
  return !Number.isNaN(at.getTime()) && latestCloseDate(at) === latestCloseDate(now);
}

export function buildWorkflow(input: WorkflowInput): Workflow {
  const { now, today, dataset, prices } = input;
  const close = latestCloseDate(now);

  const marketDone = isTodayFresh(today?.asOf, now);
  const candidatesDone = !!dataset && !dataset.isSample && toTime(dataset.asOf) >= toTime(close);
  const pricesComplete = !!prices && prices.need > 0 && prices.missing.length === 0;
  const pricesDone = candidatesDone || (pricesComplete && pricesFresh(prices?.updatedAt, now));

  const marketDetail = marketDone
    ? `${formatDateJa(today!.asOf)} ${today!.session}を反映済み${today!.fromBrowser ? '（このブラウザ）' : ''}`
    : today
      ? `表示中は${formatDateJa(today.asOf)}の市況。今朝のメモを貼って更新`
      : '今日の市況がまだありません。市況メモを貼って作成';

  let pricesDetail: string;
  if (pricesDone && !pricesComplete) pricesDetail = '最新の候補データがあるため不要';
  else if (pricesDone) pricesDetail = `${prices!.have}/${prices!.need}銘柄 取得済み`;
  else if (!prices || prices.need === 0) pricesDetail = '銘柄リストを入れてから日足を取得';
  else if (pricesComplete) pricesDetail = `${prices.need}銘柄そろっているが、最新の引け（${formatDateJa(close)}）より前の取得`;
  else pricesDetail = `${prices.have}/${prices.need}銘柄。不足分を取得`;

  const generateDetail = candidatesDone
    ? `${formatDateJa(dataset!.asOf)}引けの候補を表示中${dataset!.fromBrowser ? '（このブラウザで生成）' : ''}`
    : dataset?.isSample
      ? 'サンプルを表示中。実データで候補を生成'
      : dataset
        ? `表示中は${formatDateJa(dataset.asOf)}引け。最新の引け（${formatDateJa(close)}）で生成`
        : '候補データがありません';

  const steps: WorkflowStep[] = [
    { id: 'market', no: 1, title: '今日の市況を更新', state: marketDone ? 'done' : 'todo', detail: marketDetail },
    { id: 'prices', no: 2, title: '日足を取得', state: pricesDone ? 'done' : 'todo', detail: pricesDetail },
    { id: 'generate', no: 3, title: '候補を生成', state: candidatesDone ? 'done' : 'todo', detail: generateDetail },
    { id: 'review', no: 4, title: '候補を確認', state: 'anytime', detail: 'ダッシュボードと候補一覧（スイング候補・お気に入り）で確認' },
    { id: 'report', no: 5, title: 'レポートを読む', state: 'anytime', detail: '今週の作戦を読む・SNS投稿を作る' },
  ];

  return { steps, next: steps.find((s) => s.state === 'todo') ?? null, latestClose: close };
}
