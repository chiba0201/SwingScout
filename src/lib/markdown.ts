/**
 * Markdown → HTML 変換（ブラウザ・Node 共通）。
 * データ由来の文字列に HTML が混ざっても実行されないよう、生HTMLはエスケープして表示する。
 */
import { Marked } from 'marked';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const marked = new Marked({ gfm: true, breaks: false });
marked.use({
  renderer: {
    html: ({ text }) => escapeHtml(text),
  },
});

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false });
}

/** レポートHTMLを単体ファイルとして保存するときのスタイル（外部CSS・フォントに依存しない） */
const STANDALONE_CSS = `
:root { color-scheme: light; }
body { margin: 0; background: #f2f4f7; color: #141a22; font: 15px/1.75 "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", Meiryo, system-ui, sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 32px 20px 64px; background: #fff; }
h1 { font-size: 1.6rem; line-height: 1.35; border-bottom: 3px solid #1d4f7a; padding-bottom: .4rem; }
h2 { font-size: 1.2rem; margin-top: 2.2rem; border-left: 4px solid #1d4f7a; padding-left: .6rem; }
h3 { font-size: 1.02rem; margin-top: 1.6rem; }
blockquote { margin: 1rem 0; padding: .6rem 1rem; background: #eef3f8; border-left: 3px solid #1d4f7a; color: #3a4556; }
blockquote p { margin: .2rem 0; }
table { border-collapse: collapse; width: 100%; font-size: .86rem; margin: 1rem 0; }
th, td { border: 1px solid #dde2e8; padding: .35rem .5rem; text-align: left; vertical-align: top; }
th { background: #f5f7fa; }
ul { padding-left: 1.3rem; }
li { margin: .2rem 0; }
hr { border: 0; border-top: 1px solid #dde2e8; margin: 2rem 0 1rem; }
code { font-family: "IBM Plex Mono", Menlo, Consolas, monospace; font-size: .9em; }
@media print { body { background: #fff; } main { padding: 0; } }
`;

export function buildStandaloneHtml(title: string, markdown: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>${STANDALONE_CSS}</style>
</head>
<body>
<main>
${renderMarkdown(markdown)}
</main>
</body>
</html>
`;
}

/** Markdown の最初の見出しをタイトルとして取り出す */
export function extractTitle(md: string, fallback = 'SwingScout レポート'): string {
  return md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fallback;
}
