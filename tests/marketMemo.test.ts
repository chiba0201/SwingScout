import { describe, expect, it } from 'vitest';
import { parseMarketMemo } from '../src/lib/marketMemo';
import { renderMarkdown } from '../src/lib/markdown';

const MEMO = `# 10/6 寄り前メモ

**結論**：SOX高は追い風。寄り追いはせず押し目待ち

### 海外市場
- NYダウ +0.3%
- SOX +1.9%

| 指標 | 終値 |
|---|---:|
| SOX | 6,420 |

### 国内材料
決算の前倒し観測あり（未確認）。詳細は[公式発表](https://example.com/ir)を参照。
https://example.com/raw-url

\`\`\`
# これは見出しではない
\`\`\`

![チャート](https://example.com/chart.png)
`;

describe('parseMarketMemo', () => {
  const m = parseMarketMemo(MEMO);

  it('タイトルと、ラベル付き太字から headline を取る', () => {
    expect(m.title).toBe('10/6 寄り前メモ');
    expect(m.headline).toBe('SOX高は追い風。寄り追いはせず押し目待ち');
  });

  it('### 見出しごとにセクションを分け、箇条書きを要約にする', () => {
    expect(m.sections.map((s) => s.heading)).toEqual(['海外市場', '国内材料']);
    expect(m.sections[0]!.summary).toBe('NYダウ +0.3% / SOX +1.9%');
    expect(m.sections[1]!.summary).toMatch(/^決算の前倒し観測あり/);
  });

  it('テーブルを見出し付きで取り出す', () => {
    expect(m.tables).toHaveLength(1);
    expect(m.tables[0]).toMatchObject({ section: '海外市場', headers: ['指標', '終値'], rows: [['SOX', '6,420']] });
  });

  it('リンクと裸のURLを参照元にする（画像は除く）', () => {
    expect(m.sources).toEqual([
      { label: '公式発表', url: 'https://example.com/ir' },
      { label: 'https://example.com/raw-url', url: 'https://example.com/raw-url' },
    ]);
  });

  it('「未確認」があれば needsReview', () => {
    expect(m.needsReview).toBe(true);
    expect(m.reviewHits[0]!.term).toBe('未確認');
    expect(parseMarketMemo('### 海外\n- 特になし').needsReview).toBe(false);
  });

  it('活用形の揺れも拾う（取得できていない → 取得できない）', () => {
    expect(parseMarketMemo('日程は取得できていない').reviewHits[0]!.term).toBe('取得できない');
  });

  it('コードブロック内の # は見出しにしない', () => {
    expect(m.sections.some((s) => s.heading.includes('見出しではない'))).toBe(false);
  });

  it('見出しも表も無いメモは sparse で、最初の本文を headline にし原文要約を持つ', () => {
    const plain = parseMarketMemo('今日は材料に乏しく様子見。\r\n先物は横ばい。');
    expect(plain.sparse).toBe(true);
    expect(plain.headline).toBe('今日は材料に乏しく様子見。');
    expect(plain.excerpt).toContain('先物は横ばい');
    expect(plain.raw).not.toContain('\r');
  });

  it('空でも落ちない', () => {
    expect(parseMarketMemo('')).toMatchObject({ headline: null, sections: [], sparse: true });
  });
});

describe('renderMarkdown（貼り付けメモの安全な表示）', () => {
  it('画像は読み込まず、危険なリンクは無効化する', () => {
    const html = renderMarkdown('![x](https://example.com/a.png) [ok](https://example.com) [bad](javascript:alert(1))');
    expect(html).not.toContain('<img');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">ok</a>');
    expect(html).not.toContain('javascript:');
  });
});
