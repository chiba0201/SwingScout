import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeDataset } from '../src/lib/analysis';
import {
  countXWeight,
  DEFAULT_SNS_OPTIONS,
  generateSnsPost,
  splitThread,
  X_WEIGHTED_LIMIT,
} from '../src/lib/snsPostGenerator';
import { validateDataset } from '../src/lib/validate';

const dataset = validateDataset(JSON.parse(readFileSync('data/mock-candidates.json', 'utf8')));
const analysis = analyzeDataset(dataset);

describe('countXWeight', () => {
  it('半角は1、全角は2として数える（絵文字の異体字セレクタは無視）', () => {
    expect(countXWeight('abc')).toBe(3);
    expect(countXWeight('日本株')).toBe(6);
    expect(countXWeight('⚠️')).toBe(2);
  });
});

describe('generateSnsPost (1投稿)', () => {
  const post = generateSnsPost(analysis);

  it('上位6銘柄を1位〜6位で並べる', () => {
    expect(post.match(/^\d位｜/gm)).toEqual(['1位｜', '2位｜', '3位｜', '4位｜', '5位｜', '6位｜']);
  });

  it('運用メモは最後（注意書きの直前）にまとまっている', () => {
    const memo = post.indexOf('運用メモ');
    expect(memo).toBeGreaterThan(post.indexOf('6位｜'));
    expect(memo).toBeLessThan(post.indexOf('売買をおすすめするものではありません'));
  });

  it('サンプル表示と柔らかい注意書き・ハッシュタグを含む', () => {
    expect(post).toContain('架空の銘柄・数値を使ったサンプル');
    expect(post).toContain('最終判断はご自身でお願いします');
    expect(post.trimEnd().endsWith('#日本株 #スイングトレード')).toBe(true);
  });

  it('Markdown記法を含まない（SNSにそのまま貼れる）', () => {
    expect(post).not.toMatch(/^#{1,6} /m);
    expect(post).not.toContain('**');
  });

  it('オプションで価格・絵文字・タグを外せる', () => {
    const plain = generateSnsPost(analysis, { ...DEFAULT_SNS_OPTIONS, includeLevels: false, emoji: false, hashtags: '' });
    expect(plain).not.toContain('損切り2,');
    expect(plain).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(plain).not.toContain('#');
  });
});

describe('generateSnsPost (スレッド)', () => {
  const posts = splitThread(generateSnsPost(analysis, { ...DEFAULT_SNS_OPTIONS, layout: 'thread' }));

  it('すべての投稿が X の上限に収まり、通し番号が付く', () => {
    posts.forEach((p, i) => {
      expect(countXWeight(p)).toBeLessThanOrEqual(X_WEIGHTED_LIMIT);
      expect(p.endsWith(`(${i + 1}/${posts.length})`)).toBe(true);
    });
  });

  it('1投稿目に注意書きが入り、最後の投稿に締めの注意書きが入る', () => {
    expect(posts[0]).toContain('個人の分析メモです');
    expect(posts[posts.length - 1]).toContain('最終判断はご自身で');
  });
});
