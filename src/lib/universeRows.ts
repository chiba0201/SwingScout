/**
 * 候補一覧の「全銘柄」「お気に入り」タブ用に、銘柄リスト（CSV）と採点結果を突き合わせる。
 * 銘柄リストは変更・入稿した直後でも表示中のデータと食い違うことがあるので、状態で見分ける。
 */
import type { AnalyzedCandidate } from './analysis';
import type { UniverseListEntry } from './universeCsv';
import type { UniverseRow } from '../types/dataset';

/**
 * top：今週の候補（上位N件） / scored：採点済み / filtered：売買代金・株価の条件外 /
 * no-prices：日足なし / not-generated：表示中のデータに無い（データを作った後に追加した銘柄など）
 */
export type UniverseRowStatus = 'top' | 'scored' | 'filtered' | 'no-prices' | 'not-generated';

export const UNIVERSE_STATUS_LABEL: Record<UniverseRowStatus, string> = {
  top: '今週の候補',
  scored: '採点済み',
  filtered: '条件外',
  'no-prices': '日足なし',
  'not-generated': '未生成',
};

export const UNIVERSE_STATUS_HINT: Record<UniverseRowStatus, string> = {
  top: 'スコア上位で、今週の候補に入っています',
  scored: '採点済みです（今週の候補の圏外）',
  filtered: '売買代金1億円未満または株価200円未満のため採点していません（お気に入りにすると次の生成から採点します）',
  'no-prices': '基準日の日足が無いため採点していません（売買停止・取得漏れなど）',
  'not-generated': '表示中のデータを作った後に追加した銘柄です。データ更新で生成し直すと採点されます',
};

/** お気に入りタブで「採点できていない理由」として出す文（すでにお気に入りの銘柄向け） */
export const FAVORITE_UNSCORED_HINT: Record<Exclude<UniverseRowStatus, 'top' | 'scored'>, string> = {
  filtered: '前回の生成では売買代金・株価の条件外でした。お気に入りは条件に関係なく採点するので、データ更新で生成し直すと採点されます',
  'no-prices': '基準日の日足がありません（売買停止・取得漏れなど）。データ更新で日足を取得してください',
  'not-generated': '表示中のデータを作った後に追加した銘柄です。データ更新で生成し直すと採点されます',
};

export interface UniverseListRow extends UniverseListEntry {
  /** 銘柄リストでの並び（0始まり） */
  index: number;
  candidate?: AnalyzedCandidate;
  status: UniverseRowStatus;
}

export function buildUniverseRows(
  entries: UniverseListEntry[],
  ranked: AnalyzedCandidate[],
  topN: number,
  datasetUniverse?: UniverseRow[],
): UniverseListRow[] {
  const byCode = new Map(ranked.map((c) => [c.code, c]));
  const statusByCode = new Map((datasetUniverse ?? []).map((u) => [u.code, u.status]));
  return entries.map((entry, index) => {
    const candidate = byCode.get(entry.code);
    let status: UniverseRowStatus;
    if (candidate) status = candidate.rank <= topN ? 'top' : 'scored';
    else {
      const s = statusByCode.get(entry.code);
      // 古いデータ（上位だけ保存）では採点済みでも候補に無いことがある → 圏外として扱う
      status = s === 'filtered' || s === 'no-prices' ? s : s === 'scored' ? 'scored' : 'not-generated';
    }
    return { ...entry, index, candidate, status };
  });
}

export type UniverseSort = 'rank' | 'code';

/** rank：採点済みを順位順に、その後ろに未採点を銘柄リストの順で / code：銘柄コード順 */
export function sortUniverseRows(rows: UniverseListRow[], sort: UniverseSort): UniverseListRow[] {
  const out = [...rows];
  if (sort === 'code') return out.sort((a, b) => a.code.localeCompare(b.code, 'ja', { numeric: true }));
  return out.sort((a, b) => {
    const ra = a.candidate?.rank ?? Number.POSITIVE_INFINITY;
    const rb = b.candidate?.rank ?? Number.POSITIVE_INFINITY;
    return ra !== rb ? ra - rb : a.index - b.index;
  });
}

/** 銘柄コード・銘柄名・業種・テーマで絞り込む（空白区切りはすべてを含むもの） */
export function filterUniverseRows(rows: UniverseListRow[], query: string): UniverseListRow[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return rows;
  return rows.filter((r) => {
    const hay = [r.code, r.name, r.sector, r.theme ?? '', r.candidate?.theme ?? ''].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
