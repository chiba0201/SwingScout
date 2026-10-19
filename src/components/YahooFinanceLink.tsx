/** 銘柄の Yahoo!ファイナンスのページを新しいタブで開くボタン。サンプル・架空コードでは出さない */
import { yahooFinanceUrl } from '../lib/links';
import { IconExternal } from './icons';

export function YahooFinanceLink({ code, isSample }: { code: string; isSample: boolean }) {
  const url = isSample ? null : yahooFinanceUrl(code);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn px-2.5 py-1 text-[12px]">
      Yahoo!ファイナンスで見る
      <IconExternal className="h-3.5 w-3.5 text-ink-2" />
      <span className="sr-only">（新しいタブで開きます）</span>
    </a>
  );
}
