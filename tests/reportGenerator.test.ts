import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeDataset } from '../src/lib/analysis';
import { buildStandaloneHtml, renderMarkdown } from '../src/lib/markdown';
import { DEFAULT_REPORT_OPTIONS, DISCLAIMER, generateWeeklyReport } from '../src/lib/reportGenerator';
import { validateDataset } from '../src/lib/validate';

const dataset = validateDataset(JSON.parse(readFileSync('data/mock-candidates.json', 'utf8')));
const analysis = analyzeDataset(dataset);

describe('generateWeeklyReport', () => {
  const md = generateWeeklyReport(analysis);

  it('タイトルは保有パターンから作られる', () => {
    expect(md.startsWith('# 今週の作戦（火曜In金曜out）')).toBe(true);
  });

  it('上位6銘柄の見出しと必須項目を含む', () => {
    expect(md.match(/^### \d+\. S\d+/gm)).toHaveLength(6);
    for (const label of ['需給', 'テクニカル', 'ファンダ/イベント', '入り方', '損切り', '利確', '見送り条件']) {
      expect(md).toContain(`**${label}**`);
    }
  });

  it('運用上の注意（相関・GU・SQ・決算・米指標・連休）を含む', () => {
    for (const s of ['### 相関リスク', '### GU時の入り方', '**SQ**', '**決算**', '**米指標・金融政策**', '**連休**']) {
      expect(md).toContain(s);
    }
  });

  it('サンプル表示と免責文を必ず含む', () => {
    expect(md).toContain('サンプルデータ');
    expect(md).toContain(DISCLAIMER);
  });

  it('セクションを外せる・簡潔モードでも銘柄は出る', () => {
    const compact = generateWeeklyReport(analysis, {
      ...DEFAULT_REPORT_OPTIONS,
      detail: 'compact',
      sections: { today: false, market: false, events: false, picks: true, operations: false, table: false },
    });
    expect(compact).not.toContain('## 地合い');
    expect(compact).not.toContain('## 運用上の注意');
    expect(compact.match(/^\*\*\d+\. S\d+/gm)).toHaveLength(6);
  });
});

describe('markdown', () => {
  it('生HTMLはエスケープされる', () => {
    const html = renderMarkdown('テスト <script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('単体HTMLにタイトルと表が入る', () => {
    const html = buildStandaloneHtml('週次', '| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<title>週次</title>');
    expect(html).toContain('<table>');
  });
});
