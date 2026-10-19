/**
 * 銘柄リスト（CSV）の読み書き。ブラウザ・Node 共通。
 *
 * 銘柄リストはスクリーニングの母集団で、お気に入りは favorite 列で持つ（1 / true / ○ など）。
 * 画面ではCSVを丸ごと入稿・ダウンロードし、お気に入りのチェックはこのCSVの favorite 列を書き換える。
 */
import type { Dataset, UniverseRow } from '../types/dataset';
import { csvToRecords, parseCsv } from './csv';

export const UNIVERSE_REQUIRED_COLUMNS = ['code', 'name', 'sector'] as const;
export const FAVORITE_COLUMN = 'favorite';

/** 銘柄リストが空のときの初期値（以前のお気に入り3銘柄をお気に入りとして持つ） */
export const DEFAULT_UNIVERSE_CSV = `code,name,market,sector,theme,usdJpy,beta,fundamentalNote,flags,skipConditions,pattern,favorite
6857,アドバンテスト,プライム,電気機器,半導体,0.4,1.6,AI向け半導体テスタ需要に連動しやすい,,決算日程を確認する,高値ブレイク,1
8035,東京エレクトロン,プライム,電気機器,半導体,0.3,1.5,前工程投資の見通しに反応しやすい,,SOXが弱い日は追わない,高値ブレイク,1
8306,三菱UFJフィナンシャル・グループ,プライム,銀行業,銀行・金利,0.1,1.0,金利上昇局面で注目されやすい,,米金利が急低下したら見送り,押し目,1
`;

/** 以前のデータ更新画面の初期値（favorite 列なし）。これのままなら「ユーザーが編集していない」とみなす */
export const LEGACY_DEFAULT_UNIVERSE_CSV = `code,name,market,sector,theme,usdJpy,beta,fundamentalNote,flags,skipConditions,pattern
6857,アドバンテスト,プライム,電気機器,半導体,0.4,1.6,AI向け半導体テスタ需要に連動しやすい,,決算日程を確認する,高値ブレイク
8035,東京エレクトロン,プライム,電気機器,半導体,0.3,1.5,前工程投資の見通しに反応しやすい,,SOXが弱い日は追わない,高値ブレイク
8306,三菱UFJフィナンシャル・グループ,プライム,銀行業,銀行・金利,0.1,1.0,金利上昇局面で注目されやすい,,米金利が急低下したら見送り,押し目
`;

/** favorite 列の値を真偽にする（1 / true / yes / ○ / ★ など） */
export function isFavoriteValue(value: string | undefined): boolean {
  return /^(1|true|yes|y|on|○|◯|★|✓|✔)$/i.test((value ?? '').trim());
}

export interface UniverseListEntry {
  code: string;
  name: string;
  sector: string;
  market?: string;
  theme?: string;
  favorite: boolean;
}

const codeOf = (r: Record<string, string>) => (r.code ?? r['コード'] ?? '').trim();

/** 銘柄リストの行（必須列がそろった行だけ） */
export function readUniverseEntries(csv: string): UniverseListEntry[] {
  return csvToRecords(csv)
    .map((r) => ({
      code: codeOf(r),
      name: (r.name ?? r['銘柄名'] ?? '').trim(),
      sector: (r.sector ?? r['業種'] ?? '').trim(),
      market: (r.market ?? r['市場'] ?? '').trim() || undefined,
      theme: (r.theme ?? r['テーマ'] ?? '').trim() || undefined,
      favorite: isFavoriteValue(r[FAVORITE_COLUMN] ?? r['お気に入り']),
    }))
    .filter((e) => e.code && e.name && e.sector);
}

export function favoriteCodes(csv: string): Set<string> {
  return new Set(readUniverseEntries(csv).filter((e) => e.favorite).map((e) => e.code));
}

/** 入稿したCSVの検証。問題があればメッセージを返す */
export function validateUniverseCsv(csv: string): { ok: true; count: number } | { ok: false; message: string } {
  const header = (parseCsv(csv)[0] ?? []).map((h) => h.trim());
  const has = (col: string, ja: string) => header.includes(col) || header.includes(ja);
  const missing = [
    ['code', 'コード'],
    ['name', '銘柄名'],
    ['sector', '業種'],
  ]
    .filter(([en, ja]) => !has(en!, ja!))
    .map(([en]) => en);
  if (missing.length > 0) return { ok: false, message: `必須の列がありません：${missing.join('、')}（1行目に列名が必要です）` };
  const count = readUniverseEntries(csv).length;
  if (count === 0) return { ok: false, message: 'code・name・sector がそろった行がありません' };
  return { ok: true, count };
}

// ---------------------------------------------------------------------------
// 書き換え・書き出し
// ---------------------------------------------------------------------------

const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function serializeCsv(headers: string[], rows: Record<string, string>[]): string {
  return `${[headers, ...rows.map((r) => headers.map((h) => r[h] ?? ''))].map((cols) => cols.map(quote).join(',')).join('\n')}\n`;
}

function withFavoriteColumn(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const headers = (parseCsv(csv)[0] ?? []).map((h) => h.trim());
  const rows = csvToRecords(csv);
  if (!headers.includes(FAVORITE_COLUMN)) headers.push(FAVORITE_COLUMN);
  return { headers, rows };
}

/** 1銘柄のお気に入りを付け外しした CSV を返す（favorite 列が無ければ足す） */
export function setFavorite(csv: string, code: string, on: boolean): string {
  const { headers, rows } = withFavoriteColumn(csv);
  for (const r of rows) {
    if (codeOf(r) === code) r[FAVORITE_COLUMN] = on ? '1' : '';
    else r[FAVORITE_COLUMN] = isFavoriteValue(r[FAVORITE_COLUMN] ?? r['お気に入り']) ? '1' : '';
  }
  return serializeCsv(headers, rows);
}

/**
 * 入稿したCSVに favorite 列が無い場合は、いまのお気に入り（codes）を引き継ぐ。
 * favorite 列があれば入稿した内容をそのまま使う。
 */
export function carryOverFavorites(csv: string, codes: Set<string>): string {
  const header = (parseCsv(csv)[0] ?? []).map((h) => h.trim());
  if (header.includes(FAVORITE_COLUMN) || header.includes('お気に入り') || codes.size === 0) return csv;
  const { headers, rows } = withFavoriteColumn(csv);
  for (const r of rows) r[FAVORITE_COLUMN] = codes.has(codeOf(r)) ? '1' : '';
  return serializeCsv(headers, rows);
}

/** 生成済みデータから銘柄リストを作る（その端末に銘柄リストが無いときの初期値） */
export function universeCsvFromDataset(dataset: Dataset): string | null {
  const rows: UniverseRow[] =
    dataset.universe ??
    dataset.candidates.map((c) => ({
      code: c.code,
      name: c.name,
      sector: c.sector,
      market: c.market,
      theme: c.theme,
      favorite: !!c.favorite,
      status: 'scored' as const,
    }));
  if (rows.length === 0) return null;
  return serializeCsv(
    ['code', 'name', 'market', 'sector', 'theme', FAVORITE_COLUMN],
    rows.map((r) => ({
      code: r.code,
      name: r.name,
      market: r.market ?? '',
      sector: r.sector,
      theme: r.theme ?? '',
      [FAVORITE_COLUMN]: r.favorite ? '1' : '',
    })),
  );
}

// ---------------------------------------------------------------------------
// ファイルの文字コード
// ---------------------------------------------------------------------------

/** 入稿ファイルを文字列にする。UTF-8 として読めなければ Shift_JIS（Excel の既定）として読む */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    text = new TextDecoder('shift_jis').decode(data);
  }
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/** ダウンロード用。Excel で開いても文字化けしないよう BOM を付ける */
export function withBom(csv: string): string {
  return `﻿${csv}`;
}
