/**
 * ローカル補助API（npm run local:api）との通信。
 * dataLoader.ts と同じく**ブラウザ専用**（fetch と location を使う）。
 *
 * 静的サイト本体は外部通信なしで動く。Yahoo 日足の取得だけは、ブラウザから Yahoo へ直接
 * アクセスできないため、手元のPCで動かす補助API（127.0.0.1）を経由する。
 */
export const LOCAL_API_ORIGIN = 'http://127.0.0.1:8787';
export const LOCAL_API_COMMAND = 'npm run local:api';

/** 画面を手元の開発サーバー（npm run dev / preview）で開いているか */
export function isLocalDevHost(hostname: string = location.hostname): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname) || hostname.endsWith('.localhost');
}

/** 補助APIが起動しているか（応答が無ければ false） */
export async function checkLocalApi(timeoutMs = 1500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${LOCAL_API_ORIGIN}/api/health`, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface YahooFetchResult {
  /** [銘柄コード, 日足CSV] */
  prices: [string, string][];
  errors: { code: string; message: string }[];
}

export async function fetchYahooPrices(codes: string[], years = 2): Promise<YahooFetchResult> {
  let res: Response;
  try {
    res = await fetch(`${LOCAL_API_ORIGIN}/api/prices/yahoo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ codes, years, delayMs: 200 }),
    });
  } catch {
    throw new Error('補助APIに接続できませんでした。起動しているか確認してください。');
  }
  const body = (await res.json()) as Partial<YahooFetchResult> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `補助APIがエラーを返しました（HTTP ${res.status}）`);
  return { prices: body.prices ?? [], errors: body.errors ?? [] };
}
