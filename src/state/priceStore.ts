/**
 * 日足CSVのブラウザ内保存（IndexedDB）。
 *
 * 日足は1銘柄 約10〜20KB あり、200〜300銘柄で localStorage の上限（約5MB）に届くため、
 * 容量の大きい IndexedDB に置く。IndexedDB が使えない環境（一部のプライベートモード等）では
 * 保存せずに続行する（そのタブを閉じるまでは画面上で使える）。
 *
 * 運用ステップの表示用に、銘柄コードの一覧と取得日時だけは localStorage にも持つ（同期で読めるように）。
 */
const DB_NAME = 'swingscout';
const DB_VERSION = 1;
const STORE = 'prices';
const INDEX_KEY = 'swingscout:price-index:v1';

export interface PriceIndex {
  codes: string[];
  /** 日足を最後に取得・読み込みした日時（ISO） */
  updatedAt: string | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB を使えません'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB を開けません'));
    req.onblocked = () => reject(new Error('IndexedDB がほかのタブで使用中です'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB への書き込みに失敗しました'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB への書き込みが中断されました'));
  });
}

/** 保存済みの日足（銘柄コード → CSV） */
export async function loadAllPrices(): Promise<Map<string, string>> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const [keys, values] = await Promise.all([
      new Promise<IDBValidKey[]>((resolve, reject) => {
        const r = store.getAllKeys();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
      new Promise<string[]>((resolve, reject) => {
        const r = store.getAll();
        r.onsuccess = () => resolve(r.result as string[]);
        r.onerror = () => reject(r.error);
      }),
    ]);
    return new Map(keys.map((k, i) => [String(k), values[i] ?? '']));
  } finally {
    db.close();
  }
}

/** 日足を追加・上書き保存する */
export async function savePrices(entries: Iterable<[string, string]>): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const [code, csv] of entries) store.put(csv, code);
    await done(tx);
  } finally {
    db.close();
  }
}

export async function clearPrices(): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await done(tx);
  } finally {
    db.close();
  }
}

export function readPriceIndex(): PriceIndex {
  try {
    const v = JSON.parse(localStorage.getItem(INDEX_KEY) ?? 'null') as PriceIndex | null;
    return v && Array.isArray(v.codes) ? v : { codes: [], updatedAt: null };
  } catch {
    return { codes: [], updatedAt: null };
  }
}

export function writePriceIndex(index: PriceIndex) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* 表示用の索引なので、保存できなくても動作には影響しない */
  }
}
