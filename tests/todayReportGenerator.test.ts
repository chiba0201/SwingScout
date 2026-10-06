import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeDataset } from '../src/lib/analysis';
import { parseMarketMemo } from '../src/lib/marketMemo';
import { DEFAULT_REPORT_OPTIONS, DISCLAIMER, generateWeeklyReport } from '../src/lib/reportGenerator';
import { analyzeToday } from '../src/lib/todayAnalysis';
import { generateTodayReport, renderTodaySection } from '../src/lib/todayReportGenerator';
import { validateDataset, validateTodayMarket } from '../src/lib/validate';

const swing = analyzeDataset(validateDataset(JSON.parse(readFileSync('data/mock-candidates.json', 'utf8'))));
const today = validateTodayMarket(JSON.parse(readFileSync('data/today-market.json', 'utf8')));
const memo = parseMarketMemo(today.memoMarkdown!, { source: 'json' });
const t = analyzeToday(today, swing, memo);

describe('renderTodaySection', () => {
  const md = renderTodaySection({ today: t });

  it('見出し・スタンス・想定寄り・サイズを含む', () => {
    expect(md.startsWith('## 今日の市況（10/6(火) 寄り前・')).toBe(true);
    expect(md).toContain('**スタンス: 押し目待ち**');
    expect(md).toContain('想定寄り: ややGU（+0.4%）');
    expect(md).toContain('サイズ目安: 通常の70%');
    expect(md).toContain('サンプルデータ');
  });

  it('外部指標・シナリオ（想定に印）・イベント・監視銘柄の表を含む', () => {
    expect(md).toContain('### 外部指標');
    expect(md).toContain('| SOX指数 | 6,420.5 |');
    expect(md).toContain('| 小幅GU/横ばい（想定） |');
    expect(md).toContain('### 今日のイベント');
    expect(md).toMatch(/\| S106 \| 富岳ソフトウェア \| 見送り \|/);
  });

  it('市況メモの要点（要確認・見出し要約・表・参照元）を含む', () => {
    expect(md).toContain('### 市況メモの要点');
    expect(md).toContain('⚠ **要確認**');
    expect(md).toContain('「未確認」「取得できない」');
    expect(md).toContain('- **海外市場**:');
    expect(md).toContain('| 日経先物（夜間） | 48,520 | +0.39% |');
    expect(md).toContain('- [出典の例](https://example.com/news/semiconductor)');
  });

  it('メモだけ（JSONなし）でも出力し、見出しも表も無いメモは原文の要約を入れる', () => {
    const only = renderTodaySection({ today: null, memo: parseMarketMemo('今日は様子見。先物は横ばい。') });
    expect(only).toContain('読み込めていません');
    expect(only).toContain('原文の要約: 今日は様子見。先物は横ばい。');
  });

  it('どちらも無ければその旨の1行だけ', () => {
    expect(renderTodaySection({ today: null, memo: null })).toMatch(/^## 今日の市況\n\n.*ありません。$/);
  });
});

describe('generateTodayReport', () => {
  it('単体レポートはタイトルと注意書きを持つ', () => {
    const md = generateTodayReport({ today: t }, DISCLAIMER);
    expect(md.startsWith('# 今日の市況（10/6(火)）')).toBe(true);
    expect(md).toContain(DISCLAIMER);
  });
});

describe('週次レポートへの差し込み', () => {
  it('「今日の市況」を含めるとヘッダー直後・地合いより前に入る', () => {
    const md = generateWeeklyReport(
      swing,
      { ...DEFAULT_REPORT_OPTIONS, sections: { ...DEFAULT_REPORT_OPTIONS.sections, today: true } },
      { today: t },
    );
    const todayAt = md.indexOf('## 今日の市況');
    expect(todayAt).toBeGreaterThan(md.indexOf('# 今週の作戦'));
    expect(todayAt).toBeLessThan(md.indexOf('## 地合い'));
    expect(md).toContain(DISCLAIMER);
  });

  it('既定（チェックOFF）では今日の市況は入らない', () => {
    expect(generateWeeklyReport(swing, DEFAULT_REPORT_OPTIONS, { today: t })).not.toContain('## 今日の市況');
  });
});
