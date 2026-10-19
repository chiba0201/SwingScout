/**
 * ローカル補助API（npm run local:api）の状態表示と、未起動時の案内。
 * 「なぜ必要か」「どう起動するか」「次に何をするか」を1か所で伝える。
 */
import { useState } from 'react';
import { LOCAL_API_COMMAND } from '../lib/localApi';
import type { LocalApiState } from '../state/useLocalApi';
import { copyToClipboard } from './download';
import { cx } from './ui';

function Dot({ tone }: { tone: 'accent' | 'caution' | 'muted' }) {
  return (
    <span
      className={cx('inline-block h-2 w-2 shrink-0 rounded-full', tone === 'accent' ? 'bg-accent' : tone === 'caution' ? 'bg-caution-fill' : 'bg-rule-strong')}
      aria-hidden
    />
  );
}

function CommandLine() {
  const [copied, setCopied] = useState(false);
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <code className="rounded-sm border border-rule-strong bg-panel px-2 py-0.5 font-mono text-[12px] text-ink">{LOCAL_API_COMMAND}</code>
      <button
        type="button"
        className="text-[12px] font-semibold text-accent hover:underline"
        onClick={async () => {
          setCopied(await copyToClipboard(LOCAL_API_COMMAND));
          setTimeout(() => setCopied(false), 1800);
        }}
      >
        {copied ? 'コピーしました' : 'コピー'}
      </button>
    </span>
  );
}

export function LocalApiNotice({ state, recheck }: { state: LocalApiState; recheck: () => void }) {
  if (state === 'online') {
    return (
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-accent" role="status">
        <Dot tone="accent" />
        補助APIは起動中です。取得できます
      </p>
    );
  }
  if (state === 'checking') {
    return (
      <p className="flex items-center gap-1.5 text-[12.5px] text-muted" role="status">
        <Dot tone="muted" />
        補助APIの起動を確認しています…
      </p>
    );
  }
  if (state === 'remote') {
    return (
      <div className="text-[12.5px] leading-relaxed text-ink-2">
        <p>
          この取得方法は、手元のPCで画面を開いているとき（<span className="font-mono">npm run dev</span>）向けです。
          公開サイトでは「CSVファイルを読み込む」を使ってください。
        </p>
        <button type="button" className="mt-1 text-[12px] font-semibold text-accent hover:underline" onClick={recheck}>
          補助APIへの接続を確認する
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-sm border border-caution/50 bg-caution-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink" role="status">
      <p className="flex items-center gap-1.5 font-bold text-caution">
        <Dot tone="caution" />
        補助APIが起動していません
      </p>
      <p className="mt-1 text-ink-2">
        ブラウザからYahooへは直接アクセスできないため、手元のPCで小さな中継プログラム（補助API）を動かします。
      </p>
      <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-ink-2">
        <li>
          このプロジェクトのフォルダでターミナルを開き、次を実行
          <CommandLine />
        </li>
        <li>起動すると、この表示が自動で「起動中」に変わります</li>
        <li>「Yahooから日足を取得」を押す（終わったらターミナルで Ctrl+C を押して止めてOK）</li>
      </ol>
      <button type="button" className="mt-1.5 text-[12px] font-semibold text-accent hover:underline" onClick={recheck}>
        今すぐ確認
      </button>
    </div>
  );
}
