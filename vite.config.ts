import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const DATA_DIR = resolve(import.meta.dirname, 'data');

/** data/ 配下の JSON を再帰的に列挙する */
function listJsonFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listJsonFiles(full);
    return name.endsWith('.json') ? [full] : [];
  });
}

/**
 * プロジェクト直下の data/*.json を静的ファイルとして扱うプラグイン。
 * - dev: /data/** を data/ から配信し、JSONが更新されたらフルリロード
 * - build: dist/data/** にそのままコピー（バンドルには含めない）
 * これにより「ローカルCLIでJSONを更新 → dist/data/ だけ差し替えてアップロード」が可能になる。
 */
function staticDataDir(): Plugin {
  return {
    name: 'swingscout:static-data',
    configureServer(server) {
      server.watcher.add(DATA_DIR);
      server.watcher.on('change', (file) => {
        if (file.startsWith(DATA_DIR) && file.endsWith('.json')) {
          server.ws.send({ type: 'full-reload' });
        }
      });
      server.middlewares.use('/data', (req, res, next) => {
        const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
        const file = resolve(DATA_DIR, `.${urlPath}`);
        if (!file.startsWith(DATA_DIR + sep) || !file.endsWith('.json')) return next();
        try {
          const body = readFileSync(file);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(body);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const file of listJsonFiles(DATA_DIR)) {
        this.emitFile({
          type: 'asset',
          fileName: `data/${relative(DATA_DIR, file).split(sep).join('/')}`,
          source: readFileSync(file),
        });
      }
    },
  };
}

export default defineConfig({
  // 相対パスで出力し、さくらのサブディレクトリ（例: /swingscout/）にもそのまま置けるようにする
  base: './',
  plugins: [react(), tailwindcss(), staticDataDir()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
