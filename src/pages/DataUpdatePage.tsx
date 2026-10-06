import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { PageTitle, Panel } from '../components/ui';
import { buildDatasetInBrowser, type BrowserDatasetResult } from '../lib/browserDatasetBuilder';
import { formatDateJa } from '../lib/calendar';
import { marketContextFromToday } from '../lib/marketContextFromToday';
import { useData } from '../state/DataContext';
import type { MarketContext } from '../types/dataset';

const WORK_KEY = 'swingscout:data-update-work:v1';

interface WorkSet {
  mode: 'universe' | 'favorites';
  asOf: string;
  universeCsv: string;
  marginCsv: string;
  earningsCsv: string;
  marketJson: string;
  prices: [string, string][];
}

const defaultUniverse = `code,name,market,sector,theme,usdJpy,beta,fundamentalNote,flags,skipConditions,pattern
6857,アドバンテスト,プライム,電気機器,半導体,0.4,1.6,AI向け半導体テスタ需要に連動しやすい,,決算日程を確認する,高値ブレイク
8035,東京エレクトロン,プライム,電気機器,半導体,0.3,1.5,前工程投資の見通しに反応しやすい,,SOXが弱い日は追わない,高値ブレイク
8306,三菱UFJフィナンシャル・グループ,プライム,銀行業,銀行・金利,0.1,1.0,金利上昇局面で注目されやすい,,米金利が急低下したら見送り,押し目
`;

const defaultMargin = `code,asOf,buyBalance,sellBalance,buyBalancePrev,sellBalancePrev
6857,2026-10-02,69000,85200,138000,72100
8035,2026-10-02,458000,563000,936000,458000
8306,2026-10-02,2544000,3085000,5088000,2544000
`;

const defaultEarnings = `code,date,timing,period
6857,,unknown,
8035,,unknown,
8306,,unknown,
`;

function jstToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readWorkSet(): Partial<WorkSet> | null {
  try {
    const v = JSON.parse(localStorage.getItem(WORK_KEY) ?? 'null') as Partial<WorkSet> | null;
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function writeWorkSet(work: WorkSet) {
  try {
    localStorage.setItem(WORK_KEY, JSON.stringify(work));
  } catch {
    /* 容量超過など。作業自体は継続する */
  }
}

async function readWorkSetFile(file: File | null): Promise<WorkSet | null> {
  if (!file) return null;
  const json = JSON.parse(await file.text()) as WorkSet;
  if (!json || !Array.isArray(json.prices) || typeof json.universeCsv !== 'string') throw new Error('作業セットJSONの形式が正しくありません。');
  return json;
}

async function readPriceFiles(files: FileList | null): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!files) return out;
  for (const file of Array.from(files)) {
    const code = file.name.replace(/\.[^.]+$/, '').replace(/\.T$/i, '');
    if (!code) continue;
    out.set(code, await file.text());
  }
  return out;
}

function statText(result: BrowserDatasetResult | null) {
  if (!result) return '未生成';
  const { stats, dataset } = result;
  return `母集団 ${stats.universe}件 / 日足あり ${stats.withPrices}件 / 足切り通過 ${stats.screened}件 / 保存 ${dataset.candidates.length}件`;
}

export function DataUpdatePage() {
  const { todayAnalysis, analysis, patternId, datasetOverride, favoritesOverride, setDatasetOverride, setFavoritesOverride } = useData();
  const navigate = useNavigate();
  const saved = useMemo(readWorkSet, []);
  const [mode, setMode] = useState<'universe' | 'favorites'>(saved?.mode ?? 'universe');
  const [asOf, setAsOf] = useState(saved?.asOf ?? analysis?.dataset.asOf ?? jstToday());
  const [universeCsv, setUniverseCsv] = useState(saved?.universeCsv ?? defaultUniverse);
  const [marginCsv, setMarginCsv] = useState(saved?.marginCsv ?? defaultMargin);
  const [earningsCsv, setEarningsCsv] = useState(saved?.earningsCsv ?? defaultEarnings);
  const [marketJson, setMarketJson] = useState(() =>
    saved?.marketJson ?? JSON.stringify(todayAnalysis ? marketContextFromToday(todayAnalysis.today) : (analysis?.dataset.marketContext ?? null), null, 2),
  );
  const [pricesByCode, setPricesByCode] = useState<Map<string, string>>(new Map(saved?.prices ?? []));
  const [result, setResult] = useState<BrowserDatasetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workStatus, setWorkStatus] = useState<string | null>(saved ? '前回の作業セットを復元しました' : null);

  const outputFile = mode === 'favorites' ? 'favorites.json' : `${asOf}.json`;
  const market: MarketContext | null = useMemo(() => {
    try {
      return JSON.parse(marketJson) as MarketContext;
    } catch {
      return null;
    }
  }, [marketJson]);

  const workSet: WorkSet = useMemo(
    () => ({ mode, asOf, universeCsv, marginCsv, earningsCsv, marketJson, prices: [...pricesByCode.entries()] }),
    [asOf, earningsCsv, marginCsv, marketJson, mode, pricesByCode, universeCsv],
  );

  useEffect(() => {
    const timer = setTimeout(() => writeWorkSet(workSet), 500);
    return () => clearTimeout(timer);
  }, [workSet]);

  const generate = () => {
    setError(null);
    if (!market) {
      setError('地合いJSONの形式を確認してください。');
      return;
    }
    try {
      const next = buildDatasetInBrowser({
        asOf,
        patternId,
        source: mode === 'favorites' ? 'browser-favorites' : 'browser-universe',
        universeCsv,
        marginCsv,
        earningsCsv,
        market,
        pricesByCode,
        keep: mode === 'favorites' ? 50 : 12,
        topN: 6,
        minTurnoverOku: 1,
        minPrice: 200,
        lookbackDays: 260,
      });
      setResult(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const openInBrowser = () => {
    if (!result) return;
    if (mode === 'favorites') {
      setFavoritesOverride(result.dataset);
      navigate('/favorites');
    } else {
      setDatasetOverride(result.dataset);
      navigate('/');
    }
  };

  const loadWork = (work: WorkSet) => {
    setMode(work.mode);
    setAsOf(work.asOf);
    setUniverseCsv(work.universeCsv);
    setMarginCsv(work.marginCsv);
    setEarningsCsv(work.earningsCsv);
    setMarketJson(work.marketJson);
    setPricesByCode(new Map(work.prices));
    setResult(null);
    setError(null);
    setWorkStatus('作業セットを読み込みました');
  };

  return (
    <div className="space-y-4">
      <PageTitle title="データ更新">
        <span className="text-[12px] text-muted">CSV/JSONを読み込んで、候補データをブラウザ内で生成します</span>
      </PageTitle>

      <section className="panel px-4 py-3">
        <p className="text-[13px] leading-relaxed text-ink-2">
          ターミナルの `data:universe` / `data:favorites` 相当を画面で行うための作業台です。
          日足CSVだけは外部から用意して、`6857.csv` のように銘柄コード名で複数選択してください。
        </p>
        {(datasetOverride || favoritesOverride) && (
          <p className="mt-2 text-[12px] text-caution">
            このブラウザでは生成データを一時反映中です。公開用にする場合はJSONを保存して `data/` へ置いてください。
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Panel title="基本設定">
            <div className="grid gap-3 sm:grid-cols-3">
              <label>
                <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">生成するデータ</span>
                <select className="field w-full" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                  <option value="universe">代表銘柄スクリーニング</option>
                  <option value="favorites">お気に入り</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">基準日</span>
                <input className="field w-full" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
              </label>
              <label>
                <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">日足CSV</span>
                <input
                  className="field w-full text-[12px]"
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  onChange={async (e) => setPricesByCode(await readPriceFiles(e.target.files))}
                />
              </label>
            </div>
            <p className="mt-2 text-[12px] text-muted">
              読み込み済みの日足CSV: <span className="num">{pricesByCode.size}</span>件
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="btn" onClick={() => downloadJson(`swingscout-work-${asOf}.json`, workSet)}>
                作業セットを保存
              </button>
              <label className="btn cursor-pointer">
                作業セットを読み込み
                <input
                  className="sr-only"
                  type="file"
                  accept="application/json,.json"
                  onChange={async (e) => {
                    try {
                      const work = await readWorkSetFile(e.target.files?.[0] ?? null);
                      if (work) loadWork(work);
                    } catch (err) {
                      setWorkStatus(err instanceof Error ? err.message : String(err));
                    } finally {
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </label>
              {workStatus && <span className="text-[12px] text-accent">{workStatus}</span>}
            </div>
          </Panel>

          <Panel title="銘柄CSV">
            <textarea className="field min-h-[12rem] w-full font-mono text-[12px]" value={universeCsv} onChange={(e) => setUniverseCsv(e.target.value)} />
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="信用残CSV">
              <textarea className="field min-h-[10rem] w-full font-mono text-[12px]" value={marginCsv} onChange={(e) => setMarginCsv(e.target.value)} />
            </Panel>
            <Panel title="決算予定CSV">
              <textarea className="field min-h-[10rem] w-full font-mono text-[12px]" value={earningsCsv} onChange={(e) => setEarningsCsv(e.target.value)} />
            </Panel>
          </div>

          <Panel title="地合いJSON">
            <div className="mb-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => todayAnalysis && setMarketJson(JSON.stringify(marketContextFromToday(todayAnalysis.today), null, 2))}
                disabled={!todayAnalysis}
              >
                Todayから作る
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => analysis && setMarketJson(JSON.stringify(analysis.dataset.marketContext, null, 2))}
                disabled={!analysis}
              >
                現在の地合いを使う
              </button>
            </div>
            <textarea className="field min-h-[12rem] w-full font-mono text-[12px]" value={marketJson} onChange={(e) => setMarketJson(e.target.value)} />
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Panel title="生成">
            <div className="space-y-3">
              <button type="button" className="btn btn-primary w-full justify-center" onClick={generate}>
                候補JSONを生成
              </button>
              <p className="text-[12.5px] leading-relaxed text-ink-2">{statText(result)}</p>
              {error && <p className="rounded-sm border border-down/30 bg-down-soft px-3 py-2 text-[12px] text-down">{error}</p>}
              {result && result.stats.missingPrices.length > 0 && (
                <p className="text-[12px] leading-relaxed text-caution">
                  日足CSVなし: {result.stats.missingPrices.slice(0, 12).join(', ')}
                  {result.stats.missingPrices.length > 12 ? '…' : ''}
                </p>
              )}
              <button type="button" className="btn w-full justify-center" disabled={!result} onClick={() => result && downloadJson(outputFile, result.dataset)}>
                {outputFile} を保存
              </button>
              <button type="button" className="btn w-full justify-center" disabled={!result} onClick={openInBrowser}>
                このブラウザで開く
              </button>
              {mode === 'universe' && result && (
                <button
                  type="button"
                  className="btn w-full justify-center"
                  onClick={() =>
                    downloadJson('manifest.patch.json', {
                      default: outputFile,
                      datasets: [
                        {
                          file: outputFile,
                          asOf,
                          label: `${formatDateJa(asOf)} 代表銘柄スクリーニング`,
                          isSample: false,
                          generatedAt: result.dataset.meta.generatedAt,
                        },
                      ],
                    })
                  }
                >
                  manifest用メモを保存
                </button>
              )}
              {(datasetOverride || favoritesOverride) && (
                <button
                  type="button"
                  className="btn w-full justify-center"
                  onClick={() => {
                    if (mode === 'favorites') setFavoritesOverride(null);
                    else setDatasetOverride(null);
                  }}
                >
                  一時反映を解除
                </button>
              )}
            </div>
          </Panel>

          <Panel title="置き場所">
            <ul className="list-disc space-y-1 pl-4 text-[12.5px] text-ink-2">
              <li>`{outputFile}` は `data/` に置きます。</li>
              <li>`favorites.json` は上タブのお気に入りで読みます。</li>
              <li>代表銘柄の場合は `data/manifest.json` に登録するとヘッダーのデータ選択に出ます。</li>
              <li>静的サイトなので、この画面からサーバーへ直接保存はしません。</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
