/**
 * SwingScout のローカル補助API。
 *
 * 静的サイト本体は外部通信なしで動くが、ローカル開発ではこのAPIを起動すると
 * データ更新画面からYahoo Financeの日足を取得できる。
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { parseArgs } from 'node:util';
import { fetchYahooDailyCsv, sleep } from './lib/yahooPrices';

interface PriceRequest {
  codes?: string[];
  years?: number;
  delayMs?: number;
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(JSON.stringify(body));
};

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function handlePrices(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse((await readBody(req)) || '{}') as PriceRequest;
  const codes = [...new Set((body.codes ?? []).map((c) => c.trim()).filter(Boolean))];
  const years = Number.isFinite(body.years) ? Math.max(0.2, Math.min(10, body.years ?? 2)) : 2;
  const delayMs = Number.isFinite(body.delayMs) ? Math.max(0, body.delayMs ?? 200) : 200;
  if (codes.length === 0) return json(res, 400, { error: 'codes が空です。銘柄CSVを確認してください。' });

  const prices: [string, string][] = [];
  const errors: { code: string; message: string }[] = [];
  for (const code of codes) {
    try {
      prices.push([code, await fetchYahooDailyCsv(code, years)]);
    } catch (e) {
      errors.push({ code, message: e instanceof Error ? e.message : String(e) });
    }
    if (delayMs > 0) await sleep(delayMs);
  }
  return json(res, 200, { prices, errors });
}

async function main() {
  const { values } = parseArgs({ options: { port: { type: 'string', default: '8787' } } });
  const port = Number(values.port);
  const server = createServer((req, res) => {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET' && req.url === '/api/health') return json(res, 200, { ok: true });
    if (req.method === 'POST' && req.url === '/api/prices/yahoo') {
      handlePrices(req, res).catch((e: unknown) => json(res, 500, { error: e instanceof Error ? e.message : String(e) }));
      return;
    }
    return json(res, 404, { error: 'not found' });
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`[local-api] http://127.0.0.1:${port}`);
  });
}

main().catch((e: unknown) => {
  console.error(`[local-api] 失敗: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
