/**
 * モック用の架空銘柄。コード・社名・数値はすべて架空（実在企業とは無関係）。
 * 日付は保有ウィンドウからの相対（営業日オフセット）で持つので、--as-of を変えても破綻しない。
 */
import type { Catalyst, EarningsTimingOfDay, Sensitivity } from '../../../src/types/dataset';

export type Scenario = 'breakout' | 'pullback' | 'trend' | 'surge' | 'sideways' | 'rebound' | 'grind';

export interface MockStock {
  code: string;
  name: string;
  market: string;
  sector: string;
  theme: string;
  scenario: Scenario;
  /** 基準日の終値（この値に合わせて合成チャートをスケールする） */
  close: number;
  /** 平常時の出来高（株） */
  baseVolume: number;
  /** 日次ボラティリティ（%） */
  noisePct: number;
  seed: number;
  sensitivity: Sensitivity;
  /** 信用残（買残・売残・前週買残・前週売残） */
  margin: [number, number, number, number] | null;
  /** エントリー日からの営業日オフセット。null は未定 */
  earnings: { offset: number; timing: EarningsTimingOfDay; period: string; lastSurprise?: 'beat' | 'inline' | 'miss'; progressRate?: number } | null;
  catalysts: Omit<Catalyst, 'date'>[];
  fundamentalNote: string;
  flags?: string[];
}

export const MOCK_UNIVERSE: MockStock[] = [
  {
    code: 'S101', name: '北辰エレクトロン', market: 'プライム', sector: '電気機器', theme: '半導体',
    scenario: 'breakout', close: 2480, baseVolume: 1_800_000, noisePct: 1.8, seed: 101,
    sensitivity: { usdJpy: 0.5, beta: 1.5 },
    margin: [1_200_000, 750_000, 1_310_000, 620_000],
    earnings: { offset: 17, timing: 'after-close', period: '2027年3月期 2Q', lastSurprise: 'beat', progressRate: 54 },
    catalysts: [{ label: '受注残高が過去最高', impact: 'positive' }],
    fundamentalNote: '前工程向け装置の受注が回復基調（サンプル）',
  },
  {
    code: 'S102', name: '東和マテリアル', market: 'プライム', sector: '化学', theme: '半導体',
    scenario: 'pullback', close: 3315, baseVolume: 900_000, noisePct: 1.5, seed: 102,
    sensitivity: { usdJpy: 0.3, beta: 1.2 },
    margin: [900_000, 350_000, 1_000_000, 300_000],
    earnings: { offset: 6, timing: 'after-close', period: '2027年3月期 2Q', lastSurprise: 'inline', progressRate: 48 },
    catalysts: [{ label: '自己株式取得枠の設定', impact: 'positive' }],
    fundamentalNote: '先端材料の採用拡大で数量回復（サンプル）',
  },
  {
    code: 'S103', name: 'みなと銀行ホールディングス', market: 'プライム', sector: '銀行業', theme: '金利上昇',
    scenario: 'trend', close: 1286, baseVolume: 6_500_000, noisePct: 1.2, seed: 103,
    sensitivity: { usdJpy: 0, beta: 0.9 },
    margin: [8_000_000, 900_000, 7_600_000, 1_000_000],
    earnings: { offset: 22, timing: 'after-close', period: '2027年3月期 2Q', lastSurprise: 'beat', progressRate: 58 },
    catalysts: [],
    fundamentalNote: '利ざや改善期待。ただし買残の積み上がりが重い（サンプル）',
  },
  {
    code: 'S104', name: '大和防衛システムズ', market: 'プライム', sector: '機械', theme: '防衛',
    scenario: 'surge', close: 4120, baseVolume: 600_000, noisePct: 2.2, seed: 104,
    sensitivity: { usdJpy: 0, beta: 1.3 },
    margin: [500_000, 400_000, 450_000, 250_000],
    earnings: { offset: 20, timing: 'after-close', period: '2027年3月期 2Q', lastSurprise: 'inline', progressRate: 41 },
    catalysts: [{ label: '大型受注の報道', impact: 'positive' }],
    fundamentalNote: '受注報道で急伸。材料の織り込み度合いを見極めたい（サンプル）',
  },
  {
    code: 'S105', name: 'さくら観光リゾート', market: 'プライム', sector: 'サービス業', theme: 'インバウンド',
    scenario: 'pullback', close: 1742, baseVolume: 1_100_000, noisePct: 1.6, seed: 105,
    sensitivity: { usdJpy: 0.4, beta: 1.0 },
    margin: [600_000, 500_000, 700_000, 450_000],
    earnings: { offset: 12, timing: 'after-close', period: '2027年3月期 2Q', lastSurprise: 'beat', progressRate: 52 },
    catalysts: [{ label: '月次の客室稼働率が改善', impact: 'positive' }],
    fundamentalNote: '訪日客の回復で客室単価が上昇（サンプル）',
  },
  {
    code: 'S106', name: '富岳ソフトウェア', market: 'プライム', sector: '情報・通信業', theme: 'AI・DX',
    scenario: 'breakout', close: 5630, baseVolume: 450_000, noisePct: 1.6, seed: 306,
    sensitivity: { usdJpy: -0.1, beta: 1.2 },
    margin: [300_000, 380_000, 340_000, 250_000],
    earnings: { offset: 2, timing: 'after-close', period: '2027年2月期 2Q', lastSurprise: 'beat', progressRate: 49 },
    catalysts: [
      { label: '生成AI関連の新サービス発表', impact: 'positive' },
      { label: '大手SIerとの業務提携', impact: 'positive' },
    ],
    fundamentalNote: '受託開発の採算改善が続く（サンプル）',
  },
  {
    code: 'S107', name: '日本グリッド電工', market: 'プライム', sector: '電気機器', theme: '電力インフラ',
    scenario: 'breakout', close: 3080, baseVolume: 800_000, noisePct: 1.6, seed: 107,
    sensitivity: { usdJpy: 0.2, beta: 1.1 },
    margin: [700_000, 300_000, 750_000, 280_000],
    earnings: { offset: 14, timing: 'after-close', period: '2027年3月期 2Q', lastSurprise: 'beat', progressRate: 51 },
    catalysts: [{ label: 'データセンター向け受電設備を受注', impact: 'positive' }],
    fundamentalNote: '送配電・データセンター向けの需要が強い（サンプル）',
  },
  {
    code: 'S108', name: '瀬戸内海運', market: 'プライム', sector: '海運業', theme: '海運市況',
    scenario: 'sideways', close: 2215, baseVolume: 1_500_000, noisePct: 1.8, seed: 208,
    sensitivity: { usdJpy: 0.6, beta: 1.1 },
    margin: [1_400_000, 500_000, 1_350_000, 550_000],
    earnings: { offset: 16, timing: 'after-close', period: '2027年3月期 2Q', lastSurprise: 'miss', progressRate: 38 },
    catalysts: [],
    fundamentalNote: '運賃市況が弱含み（サンプル）',
  },
  {
    code: 'S109', name: '青葉フーズ', market: 'プライム', sector: '食料品', theme: 'ディフェンシブ',
    scenario: 'grind', close: 2864, baseVolume: 500_000, noisePct: 0.9, seed: 109,
    sensitivity: { usdJpy: -0.3, beta: 0.6 },
    margin: [200_000, 150_000, 210_000, 140_000],
    earnings: { offset: 11, timing: 'after-close', period: '2027年3月期 2Q', lastSurprise: 'inline', progressRate: 50 },
    catalysts: [{ label: '価格改定の浸透', impact: 'positive' }],
    fundamentalNote: '値上げ効果で利益率が改善（サンプル）',
  },
  {
    code: 'S110', name: 'ネクスト創薬', market: 'グロース', sector: '医薬品', theme: 'バイオ',
    scenario: 'rebound', close: 486, baseVolume: 350_000, noisePct: 3.5, seed: 110,
    sensitivity: { beta: 1.6 },
    margin: [2_500_000, 100_000, 2_400_000, 100_000],
    earnings: null,
    catalysts: [{ label: '治験データの学会発表予定', impact: 'neutral' }],
    fundamentalNote: 'パイプラインの進捗待ち。値動きは材料次第（サンプル）',
    flags: ['材料待ち'],
  },
  {
    code: 'S111', name: '北都自動車部品', market: 'プライム', sector: '輸送用機器', theme: 'EV・円安メリット',
    scenario: 'trend', close: 1568, baseVolume: 1_300_000, noisePct: 1.4, seed: 111,
    sensitivity: { usdJpy: 0.8, beta: 1.1 },
    margin: [900_000, 600_000, 1_000_000, 500_000],
    earnings: { offset: 18, timing: 'after-close', period: '2027年3月期 2Q', lastSurprise: 'beat', progressRate: 53 },
    catalysts: [],
    fundamentalNote: '円安が続けば想定為替レートとの差で上振れ余地（サンプル）',
  },
  {
    code: 'S112', name: '光陽商事', market: 'プライム', sector: '卸売業', theme: '商社',
    scenario: 'pullback', close: 3940, baseVolume: 1_000_000, noisePct: 1.3, seed: 112,
    sensitivity: { usdJpy: 0.4, beta: 0.9 },
    margin: [1_100_000, 500_000, 1_150_000, 480_000],
    earnings: { offset: 24, timing: 'after-close', period: '2027年3月期 2Q', lastSurprise: 'inline', progressRate: 47 },
    catalysts: [{ label: '累進配当の方針を公表', impact: 'positive' }],
    fundamentalNote: '資源価格は横ばいも、非資源分野が堅調（サンプル）',
  },
];
