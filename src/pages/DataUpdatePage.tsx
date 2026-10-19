/**
 * データ更新：銘柄リスト・日足・地合いから、ブラウザ内で候補データを作る作業台。
 *
 *   上：今日の運用ステップ（どこまで済んだか・次に何をするか）
 *   左：入力（毎日触る順：日足 → 銘柄リスト〈入れ替えるときだけ〉→ 地合い → 補助データ）
 *   右：データ生成（候補を生成＝このブラウザの画面に反映 → 生成に使うデータ → 公開用のJSON保存 → 入力内容の控え）
 *
 * 銘柄リスト（お気に入りの favorite 列を含む）は DataContext、日足は IndexedDB（state/priceStore.ts）に保存する。
 * 生成ロジックは src/lib/browserDatasetBuilder.ts、ステップ判定は src/lib/workflow.ts。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router';
import { downloadJson, downloadText } from '../components/download';
import { LocalApiNotice } from '../components/LocalApiNotice';
import { HelpTip } from '../components/HelpTip';
import { IconClose } from '../components/icons';
import { cx, PageTitle, Panel, StanceBadge } from '../components/ui';
import { WorkflowSteps } from '../components/WorkflowSteps';
import { buildDatasetInBrowser, type BrowserDatasetResult } from '../lib/browserDatasetBuilder';
import { formatDateJa, latestCloseDate, toTime } from '../lib/calendar';
import { datasetModeFromSource } from '../lib/datasetMode';
import { formatDateTime } from '../lib/format';
import { fetchYahooPrices } from '../lib/localApi';
import { marketContextOutdated } from '../lib/market';
import { marketContextFromToday } from '../lib/marketContextFromToday';
import { chunk, lastBarDate, summarizePriceDates } from '../lib/priceSummary';
import {
  carryOverFavorites,
  decodeCsvBytes,
  favoriteCodes,
  FAVORITE_COLUMN,
  validateUniverseCsv,
  withBom,
} from '../lib/universeCsv';
import { isTodayFresh, priceCoverage, universeCodes } from '../lib/workflow';
import { useData } from '../state/DataContext';
import { clearPrices, loadAllPrices, readPriceIndex, savePrices, writePriceIndex } from '../state/priceStore';
import { useLocalApi } from '../state/useLocalApi';
import { useWorkflow } from '../state/useWorkflow';
import { parseWorkSetFile, readWorkSet, writeWorkSet, type StoredWorkSet, type WorkSetFile } from '../state/workSet';
import type { MarketContext } from '../types/dataset';

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

/** 日足の取得期間（年）。52週高値（約245営業日）に足りる分だけ取る */
const PRICE_YEARS = 1.1;
/** 1回の取得で頼む銘柄数（進捗を出すため・途中で止められるように小分けにする） */
const FETCH_CHUNK = 20;
/** 1銘柄あたりの取得時間の目安（秒） */
const SECONDS_PER_CODE = 0.7;

/** 地合いを Today に連動させず固定しているときの、固定した理由 */
type MarketFixed = 'dataset' | 'restored' | 'edited';

const MARKET_FIXED_LABEL: Record<MarketFixed, string> = {
  dataset: '表示中の候補データの地合いに固定',
  restored: '作業セットの内容に固定',
  edited: '手で編集した内容に固定',
};

/** IndexedDB に日足を保存できるか。unavailable のときはこのタブの中だけで使う */
type PriceStorage = 'loading' | 'ready' | 'unavailable';

interface FetchProgress {
  done: number;
  total: number;
}

/** 日足CSVファイルを読み込む。ファイル名（拡張子・.T を除く）を銘柄コードとして扱う */
async function readPriceFiles(files: FileList | null): Promise<[string, string][]> {
  const out: [string, string][] = [];
  if (!files) return out;
  for (const file of Array.from(files)) {
    const code = file.name.replace(/\.[^.]+$/, '').replace(/\.T$/i, '');
    if (code) out.push([code, await file.text()]);
  }
  return out;
}

function scrollToRef(ref: RefObject<HTMLElement | null>) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function estimate(count: number): string {
  const sec = Math.ceil(count * SECONDS_PER_CODE);
  return sec < 60 ? `約${sec}秒` : `約${Math.ceil(sec / 60)}分`;
}

function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1 block">
      <span className="block text-[12px] font-semibold text-ink-2">{children}</span>
      {hint && <span className="block text-[11.5px] leading-snug text-muted">{hint}</span>}
    </span>
  );
}

/** 銘柄リストの要約の1マス */
function Stat({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[17px] leading-tight font-bold text-ink">{children}</dd>
      {note && <dd className="mt-0.5 text-[11.5px] leading-snug">{note}</dd>}
    </div>
  );
}

/** 生成前チェックの1行（✓ そろっている / ! 不足 / ・未入力） */
type CheckState = 'ok' | 'warn' | 'none';

/** ✓ / ! / ・ の丸い印。「生成に使うデータ」と日足ブロックの注意で同じ印を使い、同じ情報だと分かるようにする */
function StateMark({ state }: { state: CheckState }) {
  return (
    <>
      <span
        className={cx(
          'mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
          state === 'ok' ? 'bg-accent text-panel' : state === 'warn' ? 'bg-caution-fill text-panel' : 'border border-rule-strong text-muted',
        )}
        aria-hidden
      >
        {state === 'ok' ? '✓' : state === 'warn' ? '!' : '・'}
      </span>
      <span className="sr-only">{state === 'ok' ? 'OK：' : state === 'warn' ? '要確認：' : '未入力：'}</span>
    </>
  );
}

function Check({ state, children }: { state: CheckState; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <StateMark state={state} />
      <span>{children}</span>
    </li>
  );
}

export function DataUpdatePage() {
  const {
    todayLoad,
    todayOverride,
    analysis,
    patternId,
    datasetOverride,
    setDatasetOverride,
    universeCsv,
    universeUpdatedAt,
    setUniverseCsv,
    favorites,
  } = useData();
  const localApi = useLocalApi();
  const latestClose = latestCloseDate();

  const saved = useMemo(readWorkSet, []);
  // 以前の形式（mode あり）の asOf は「入力した基準日」なので引き継がない（いまは日足から自動で決める）
  const [asOfOverride, setAsOfOverride] = useState(saved?.mode ? '' : (saved?.asOf ?? ''));
  const [marginCsv, setMarginCsv] = useState(saved?.marginCsv ?? defaultMargin);
  const [earningsCsv, setEarningsCsv] = useState(saved?.earningsCsv ?? defaultEarnings);

  // 地合いは Today の市況に連動するのが既定（Today に市況メモを反映すると、ここも自動で変わる）。
  // 手で編集したとき・候補データの地合いを選んだときだけ固定する
  const todayMarket = todayOverride ?? (todayLoad.status === 'ready' ? todayLoad.data : null);
  const [marketFixed, setMarketFixed] = useState<MarketFixed | null>(saved?.marketSource === 'manual' ? 'restored' : null);
  const [fixedMarketJson, setFixedMarketJson] = useState(saved?.marketSource === 'manual' ? (saved.marketJson ?? '') : '');
  const linkedMarketJson = useMemo(
    () => JSON.stringify(todayMarket ? marketContextFromToday(todayMarket) : (analysis?.dataset.marketContext ?? null), null, 2),
    [todayMarket, analysis],
  );
  const marketJson = marketFixed ? fixedMarketJson : linkedMarketJson;
  const todayFresh = isTodayFresh(todayMarket?.asOf);
  const marketLabel = marketFixed
    ? MARKET_FIXED_LABEL[marketFixed]
    : todayMarket
      ? `Todayに連動（${formatDateJa(todayMarket.asOf)} ${todayMarket.session}${todayFresh ? '' : '・今日の分はまだ'}）`
      : 'Todayの市況がまだないため、表示中の候補データの地合い';

  const [pricesByCode, setPricesByCode] = useState<Map<string, string>>(new Map());
  const pricesNow = useRef<Map<string, string>>(new Map());
  const [priceStorage, setPriceStorage] = useState<PriceStorage>('loading');
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState<string | null>(() => readPriceIndex().updatedAt);
  const [priceStatus, setPriceStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const cancelFetch = useRef(false);

  const [universeStatus, setUniverseStatus] = useState<{ ok: boolean; message: string; undo?: string } | null>(null);
  const [result, setResult] = useState<BrowserDatasetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workStatus, setWorkStatus] = useState<string | null>(saved ? '前回の入力内容を復元しました' : null);
  const [storageOk, setStorageOk] = useState(true);

  const pricesSectionRef = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLElement>(null);

  const replacePrices = (next: Map<string, string>) => {
    pricesNow.current = next;
    setPricesByCode(next);
  };

  // 保存済みの日足を IndexedDB から読む。以前の形式（localStorage の作業セット）に日足があれば移す
  useEffect(() => {
    let alive = true;
    const legacy = saved?.prices ?? [];
    (async () => {
      try {
        const stored = await loadAllPrices();
        const moved = legacy.filter(([code]) => !stored.has(code));
        if (moved.length > 0) {
          await savePrices(moved);
          for (const [code, csv] of moved) stored.set(code, csv);
          writePriceIndex({ codes: [...stored.keys()], updatedAt: saved?.pricesUpdatedAt ?? new Date().toISOString() });
          if (alive) setPricesUpdatedAt(saved?.pricesUpdatedAt ?? null);
        }
        if (!alive) return;
        replacePrices(stored);
        setPriceStorage('ready');
      } catch {
        if (!alive) return;
        replacePrices(new Map(legacy));
        setPriceStorage('unavailable');
      }
    })();
    return () => {
      alive = false;
    };
  }, [saved]);

  const codes = useMemo(() => universeCodes(universeCsv), [universeCsv]);
  const favoriteCount = favorites.size;
  const coverage = useMemo(
    () => priceCoverage(universeCsv, pricesByCode.keys(), pricesUpdatedAt),
    [universeCsv, pricesByCode, pricesUpdatedAt],
  );
  const dates = useMemo(() => summarizePriceDates(codes, pricesByCode), [codes, pricesByCode]);
  // 基準日 = 日足の最後の日（手で指定したときはその日）
  const asOf = asOfOverride || dates.latest || latestClose;
  const asOfBehind = toTime(asOf) < toTime(latestClose);
  // 「最新の日足を取得」の対象：日足が無い銘柄と、最新の引けまで届いていない銘柄
  const toFetch = useMemo(
    () =>
      codes.filter((code) => {
        const csv = pricesByCode.get(code);
        const last = csv ? lastBarDate(csv) : null;
        return !last || toTime(last) < toTime(latestClose);
      }),
    [codes, pricesByCode, latestClose],
  );

  const workflow = useWorkflow(priceStorage === 'loading' ? undefined : coverage);
  // 保存できるのは、いま生成したデータ、またはこのブラウザで表示中の生成データ（画面を移って戻っても保存できるように）
  const savable = result?.dataset ?? datasetOverride ?? null;
  const outputFile = `${savable?.asOf ?? asOf}.json`;

  const market: MarketContext | null = useMemo(() => {
    try {
      const v = JSON.parse(marketJson) as MarketContext | null;
      return v && typeof v === 'object' && Array.isArray(v.indices) ? v : null;
    } catch {
      return null;
    }
  }, [marketJson]);

  const storedWork: StoredWorkSet = useMemo(
    () => ({ asOf: asOfOverride, marginCsv, earningsCsv, marketJson, marketSource: marketFixed ? 'manual' : 'today' }),
    [asOfOverride, earningsCsv, marginCsv, marketJson, marketFixed],
  );

  // 入力はこのブラウザに自動保存（入力が止まってから）。
  // 以前の形式の日足を IndexedDB に移し終えるまでは上書きしない（移せなかったときに消さないため）
  const canPersistWork = priceStorage === 'ready' || !saved?.prices?.length;
  useEffect(() => {
    if (!canPersistWork) return;
    const timer = setTimeout(() => setStorageOk(writeWorkSet(storedWork)), 500);
    return () => clearTimeout(timer);
  }, [storedWork, canPersistWork]);

  // ---- 銘柄リスト --------------------------------------------------------

  const uploadUniverse = async (file: File) => {
    const text = decodeCsvBytes(await file.arrayBuffer());
    const check = validateUniverseCsv(text);
    if (!check.ok) {
      setUniverseStatus({ ok: false, message: `${file.name}：${check.message}` });
      return;
    }
    const next = carryOverFavorites(text, favorites);
    const carried = next !== text;
    const before = universeCsv;
    const stored = setUniverseCsv(next);
    setResult(null);
    setUniverseStatus({
      ok: true,
      message:
        `${file.name} を入稿しました：${check.count}銘柄（お気に入り ${favoriteCodes(next).size}）` +
        (carried ? '。favorite 列が無かったので、いまのお気に入りを引き継ぎました' : '') +
        (stored ? '' : '。このブラウザに保存できませんでした（容量不足など）'),
      undo: before,
    });
  };

  const downloadUniverse = () =>
    downloadText(`swingscout-universe-${asOf}.csv`, withBom(universeCsv), 'text/csv;charset=utf-8');

  // ---- 日足 --------------------------------------------------------------

  const mergePrices = async (incoming: [string, string][]) => {
    if (incoming.length === 0) return;
    const next = new Map(pricesNow.current);
    for (const [code, csv] of incoming) next.set(code, csv);
    replacePrices(next);
    const at = new Date().toISOString();
    setPricesUpdatedAt(at);
    setResult(null);
    if (priceStorage === 'unavailable') return;
    try {
      await savePrices(incoming);
      writePriceIndex({ codes: [...next.keys()], updatedAt: at });
    } catch {
      setPriceStorage('unavailable');
    }
  };

  const fetchYahoo = async (targets: string[]) => {
    if (targets.length === 0) return;
    cancelFetch.current = false;
    const failed: string[] = [];
    let done = 0;
    let got = 0;
    setProgress({ done, total: targets.length });
    setPriceStatus(null);
    try {
      for (const batch of chunk(targets, FETCH_CHUNK)) {
        if (cancelFetch.current) break;
        const { prices, errors } = await fetchYahooPrices(batch, PRICE_YEARS);
        await mergePrices(prices);
        got += prices.length;
        failed.push(...errors.map((e) => e.code));
        done += batch.length;
        setProgress({ done, total: targets.length });
      }
      setPriceStatus(
        `${cancelFetch.current ? '途中で止めました。' : ''}${got}銘柄を取得しました` +
          (failed.length ? `。取得できなかった銘柄：${failed.slice(0, 8).join(', ')}${failed.length > 8 ? ` ほか${failed.length - 8}銘柄` : ''}` : ''),
      );
    } catch (e) {
      setPriceStatus(`${got > 0 ? `${got}銘柄を取得したところで止まりました。` : ''}${e instanceof Error ? e.message : String(e)}`);
      localApi.recheck();
    } finally {
      setProgress(null);
    }
  };

  const clearAllPrices = async () => {
    if (!window.confirm('このブラウザに保存した日足をすべて消しますか？')) return;
    replacePrices(new Map());
    setPricesUpdatedAt(null);
    setResult(null);
    writePriceIndex({ codes: [], updatedAt: null });
    try {
      await clearPrices();
    } catch {
      /* 保存できない環境ではもともと残っていない */
    }
    setPriceStatus('日足を消しました');
  };

  // ---- 地合い・生成 ------------------------------------------------------

  const fixMarket = (reason: MarketFixed, json: string) => {
    setFixedMarketJson(json);
    setMarketFixed(reason);
    setResult(null);
  };

  const canGenerate = codes.length > 0 && coverage.have > 0 && !!market && !progress;
  const generate = () => {
    setError(null);
    if (!market) {
      setError('地合いの形式が正しくありません。地合いの欄の「Todayに連動させる」を押すか、JSONを確認してください。');
      return;
    }
    let built: BrowserDatasetResult;
    try {
      built = buildDatasetInBrowser({
          asOf,
          patternId,
          source: 'browser-universe',
          universeCsv,
          marginCsv,
          earningsCsv,
          market,
          pricesByCode,
          // 全銘柄タブ・お気に入りのため、採点した銘柄はすべて残す
          keep: Number.POSITIVE_INFINITY,
          topN: 6,
          minTurnoverOku: 1,
          minPrice: 200,
          lookbackDays: 260,
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setResult(built);
    // 生成したらそのままこのブラウザの画面（ダッシュボード・候補一覧・レポート）に反映する
    if (!setDatasetOverride(built.dataset)) {
      setError(
        'この画面には反映しましたが、ブラウザに保存できませんでした（容量不足など）。再読み込みすると消えます。残したいときは「JSONファイルを保存」してください。',
      );
    }
  };

  // ---- 作業セット --------------------------------------------------------

  const workFile = (): WorkSetFile => ({
    ...storedWork,
    universeCsv,
    prices: [...pricesByCode.entries()],
    pricesUpdatedAt,
  });

  const loadWork = async (work: WorkSetFile) => {
    setAsOfOverride(work.asOf ?? '');
    setMarginCsv(work.marginCsv ?? defaultMargin);
    setEarningsCsv(work.earningsCsv ?? defaultEarnings);
    if (work.marketJson && work.marketSource !== 'today') fixMarket('restored', work.marketJson);
    else setMarketFixed(null);
    setUniverseCsv(work.universeCsv);
    replacePrices(new Map(work.prices));
    setPricesUpdatedAt(work.pricesUpdatedAt ?? null);
    setResult(null);
    setError(null);
    setWorkStatus('作業セットを読み込みました');
    if (priceStorage === 'unavailable') return;
    try {
      await clearPrices();
      await savePrices(work.prices);
      writePriceIndex({ codes: work.prices.map(([code]) => code), updatedAt: work.pricesUpdatedAt ?? null });
    } catch {
      setPriceStorage('unavailable');
    }
  };

  const complete = coverage.need > 0 && coverage.missing.length === 0;
  const fetching = progress !== null;

  return (
    <div className="space-y-4">
      <PageTitle title="データ更新">
        <span className="text-[12px] text-muted">候補データを作る作業台。入力も処理もこのブラウザの中だけで行います</span>
      </PageTitle>

      <WorkflowSteps
        workflow={workflow}
        actions={{
          prices: [{ label: '日足の欄へ', onClick: () => scrollToRef(pricesSectionRef) }],
          generate: [{ label: '生成ボタンへ', onClick: () => scrollToRef(nextRef) }],
        }}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-4">
          {/* 日足 */}
          <section ref={pricesSectionRef} className="panel scroll-mt-4 overflow-hidden" aria-labelledby="prices-title">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-2.5">
              <h2 id="prices-title" className="text-[13px] font-bold">
                日足（過去1年分の株価）
              </h2>
              {priceStorage === 'loading' ? (
                <span className="text-[12px] text-muted">読み込み中…</span>
              ) : (
                <span className={cx('text-[12px] font-semibold', complete ? 'text-accent' : 'text-caution')}>
                  <span className="num">
                    {coverage.have}/{coverage.need}
                  </span>
                  銘柄{complete ? '　そろっています' : '　不足あり'}
                </span>
              )}
            </header>
            <div className="space-y-2.5 px-4 py-3">
              <h3 className="relative flex items-center gap-1 text-[13px] font-bold">
                Yahooから取得
                <HelpTip label="Yahooからの取得について">
                  Yahoo Finance の非公式の仕組みを使います。{FETCH_CHUNK}銘柄ずつ取得し、取った分から保存します。取得できない銘柄は下の「CSVファイルを読み込む」で補ってください。
                </HelpTip>
              </h3>
              <LocalApiNotice state={localApi.state} recheck={localApi.recheck} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cx('btn', localApi.state === 'online' && toFetch.length > 0 && 'btn-primary')}
                  onClick={() => fetchYahoo(toFetch)}
                  disabled={fetching || priceStorage === 'loading' || toFetch.length === 0 || localApi.state !== 'online'}
                >
                  {toFetch.length === 0 && priceStorage !== 'loading' ? 'すべて最新です' : `最新の日足を取得（${toFetch.length}銘柄）`}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => fetchYahoo(codes)}
                  disabled={fetching || priceStorage === 'loading' || codes.length === 0 || localApi.state !== 'online'}
                >
                  全銘柄を取り直す
                </button>
              </div>
              {progress ? (
                <div className="space-y-1" role="status">
                  <div className="flex items-center justify-between gap-2 text-[12px] text-ink-2">
                    <span>
                      取得中 <span className="num">{progress.done}</span>/<span className="num">{progress.total}</span>銘柄
                      <span className="text-muted">（残り{estimate(progress.total - progress.done)}）</span>
                    </span>
                    <button
                      type="button"
                      className="font-semibold text-accent hover:underline"
                      onClick={() => {
                        cancelFetch.current = true;
                      }}
                    >
                      中止
                    </button>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-300"
                      style={{ width: `${Math.max(4, (progress.done / progress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                toFetch.length > 0 &&
                priceStorage !== 'loading' && (
                  <p className="text-[12px] text-muted">
                    日足が無いか、最新の引け（{formatDateJa(latestClose)}）まで届いていない銘柄だけを取ります。{estimate(toFetch.length)}かかります。
                  </p>
                )
              )}
              {priceStatus && (
                <p className="text-[12px] text-ink-2" role="status">
                  {priceStatus}
                </p>
              )}
            </div>
            {priceStorage !== 'loading' && (coverage.missing.length > 0 || dates.stale.length > 0 || pricesUpdatedAt || priceStorage === 'unavailable') && (
              <div className="space-y-1 border-t border-rule px-4 py-2 text-[12px]">
                {coverage.missing.length > 0 && (
                  <p className="flex items-start gap-2 text-caution">
                    <StateMark state="warn" />
                    <span>
                      日足がない銘柄（候補から外れます）：
                      <span className="num">
                        {coverage.missing.slice(0, 12).join(', ')}
                        {coverage.missing.length > 12 ? ` ほか${coverage.missing.length - 12}銘柄` : ''}
                      </span>
                    </span>
                  </p>
                )}
                {dates.stale.length > 0 && (
                  <p className="flex items-start gap-2 text-caution">
                    <StateMark state="warn" />
                    <span>
                      基準日の足がない銘柄（売買停止・取得漏れなど。候補から外れます）：
                      <span className="num">
                        {dates.stale.slice(0, 12).join(', ')}
                        {dates.stale.length > 12 ? ` ほか${dates.stale.length - 12}銘柄` : ''}
                      </span>
                    </span>
                  </p>
                )}
                {pricesUpdatedAt && <p className="text-muted">日足の最終更新：{formatDateTime(pricesUpdatedAt)}</p>}
                {priceStorage === 'unavailable' && (
                  <p className="text-caution">
                    このブラウザでは日足を保存できません（プライベートモードなど）。タブを閉じると消えるので、必要なら作業セットをファイルに保存してください。
                  </p>
                )}
              </div>
            )}
            <details className="border-t border-rule px-4 py-2 text-[12px] text-ink-2">
              <summary className="cursor-pointer font-semibold">CSVファイルを読み込む（Yahooから取れない銘柄を補うとき）</summary>
              <div className="mt-2 space-y-2">
                <p className="leading-relaxed">
                  ファイル名を銘柄コードにして（例：6857.csv）、まとめて選びます。列は Date・Open・High・Low・Close・Volume。
                  すでにある銘柄は上書きされます。
                </p>
                <input
                  className="field w-full text-[12px]"
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  aria-label="日足CSVファイル"
                  disabled={fetching}
                  onChange={async (e) => {
                    const input = e.currentTarget;
                    const files = await readPriceFiles(input.files);
                    input.value = '';
                    if (files.length > 0) {
                      await mergePrices(files);
                      setPriceStatus(`${files.length}銘柄のCSVを読み込みました`);
                    }
                  }}
                />
                {pricesByCode.size > 0 && (
                  <button
                    type="button"
                    className="font-semibold text-ink-2 hover:text-accent hover:underline"
                    onClick={clearAllPrices}
                    disabled={fetching}
                  >
                    保存した日足をすべて消す
                  </button>
                )}
              </div>
            </details>
            <details className="border-t border-rule px-4 py-2 text-[12px] text-ink-2">
              <summary className="cursor-pointer font-semibold">基準日を指定する（過去の日で作り直すとき）</summary>
              <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                <label className="block">
                  <FieldLabel hint="ふだんは空欄のまま（日足の最後の日を使います）">基準日</FieldLabel>
                  <input className="field" type="date" value={asOfOverride} onChange={(e) => setAsOfOverride(e.target.value)} />
                </label>
                {asOfOverride && (
                  <button type="button" className="pb-1.5 font-semibold text-accent hover:underline" onClick={() => setAsOfOverride('')}>
                    日足の最後の日に戻す
                  </button>
                )}
              </div>
            </details>
          </section>

          {/* 銘柄リスト */}
          <Panel
            title="銘柄リスト"
            aside={
              <Link to="/candidates?tab=all" className="font-semibold text-accent hover:underline">
                全銘柄の一覧・お気に入り →
              </Link>
            }
            bodyClassName=""
          >
            <dl className="grid grid-cols-3 divide-x divide-rule border-b border-rule">
              <Stat label="銘柄数">
                <span className="num">{codes.length}</span>
              </Stat>
              <Stat label="お気に入り">
                <span className="num">{favoriteCount}</span>
              </Stat>
              <Stat
                label="基準日"
                note={
                  priceStorage === 'loading' ? (
                    <span className="text-muted">日足を確認中…</span>
                  ) : !dates.latest ? (
                    <span className="text-muted">日足がまだありません</span>
                  ) : asOfBehind ? (
                    <span className="text-caution">最新の引けより前</span>
                  ) : (
                    <span className="text-muted">日足の最後の日</span>
                  )
                }
              >
                <span className="num">{priceStorage === 'loading' || !dates.latest ? '—' : formatDateJa(asOf)}</span>
              </Stat>
            </dl>
            <div className="space-y-2.5 px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <label className="btn cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                  CSVを入稿
                  <input
                    className="sr-only"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.currentTarget.value = '';
                      if (file) await uploadUniverse(file);
                    }}
                  />
                </label>
                <button type="button" className="btn" onClick={downloadUniverse}>
                  現在のCSVをダウンロード
                </button>
              </div>
              {universeStatus && (
                <p
                  className={cx(
                    'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm px-3 py-1.5 text-[12px]',
                    universeStatus.ok ? 'bg-accent-soft text-ink-2' : 'border border-down/30 bg-down-soft text-down',
                  )}
                  role="status"
                >
                  <span>{universeStatus.message}</span>
                  {universeStatus.undo !== undefined && (
                    <button
                      type="button"
                      className="font-semibold whitespace-nowrap text-accent underline underline-offset-2"
                      onClick={() => {
                        setUniverseCsv(universeStatus.undo!);
                        setResult(null);
                        setUniverseStatus({ ok: true, message: '入稿前の銘柄リストに戻しました' });
                      }}
                    >
                      元に戻す
                    </button>
                  )}
                </p>
              )}
              <p className="text-[11.5px] text-muted">
                {universeUpdatedAt
                  ? `最終更新：${formatDateTime(universeUpdatedAt)}（このブラウザに保存）`
                  : 'まだ入稿していません。表示中のデータから作った初期リストです。'}
              </p>
              <details className="text-[12px] text-ink-2">
                <summary className="cursor-pointer font-semibold">CSVの形式</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  <li>1行目に列名、2行目から1行1銘柄。Excel で保存した CSV（Shift_JIS）も読めます</li>
                  <li>
                    必須：code（銘柄コード）・name（銘柄名）・sector（業種）
                  </li>
                  <li>
                    <span className="font-mono">{FAVORITE_COLUMN}</span>：お気に入りは 1（空欄はお気に入りでない）。
                    お気に入りは候補一覧の「全銘柄」でチェックして付け外しでき、ダウンロードするCSVのこの列に入ります。
                    この列が無いCSVを入稿すると、いまのお気に入りを引き継ぎます
                  </li>
                  <li>任意：market（市場）・theme（テーマ。相関リスクの判定に使う）</li>
                  <li>任意：usdJpy（円安で追い風なら正、−1〜1）・beta（日経平均に対する感応度）</li>
                  <li>任意：fundamentalNote（定性メモ）・pattern（形の名前）・flags・skipConditions（複数は | 区切り）</li>
                </ul>
              </details>
            </div>
          </Panel>

          {/* 地合い */}
          <Panel title="地合い（指数・為替・市況コメント）" aside={marketLabel}>
            {market ? (
              <div className="flex flex-wrap items-start gap-2">
                {(['bullish', 'neutral', 'bearish'] as const).includes(market.stance) && <StanceBadge stance={market.stance} />}
                <p className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{market.headline || '（一言コメントなし）'}</p>
              </div>
            ) : (
              <p className="text-[12.5px] text-down">地合いの形式が正しくありません。{marketFixed ? '「Todayに連動させる」を押すか、' : ''}JSONを確認してください。</p>
            )}
            {marketFixed ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <button type="button" className="btn" onClick={() => setMarketFixed(null)}>
                  Todayに連動させる
                </button>
                <p className="text-[12px] text-muted">固定中です。Todayの市況を更新しても、ここは変わりません。</p>
              </div>
            ) : todayMarket ? (
              <p className={cx('mt-2 text-[12px]', todayFresh ? 'text-muted' : 'text-caution')}>
                {todayFresh ? (
                  'Todayに反映した市況がそのまま入ります。操作は不要です。'
                ) : (
                  <>
                    Todayの市況が今日の分ではありません。
                    <Link to="/today?update=1" className="mx-0.5 font-semibold text-accent hover:underline">
                      Todayで今朝の市況メモを反映
                    </Link>
                    すると、ここにも自動で入ります。
                  </>
                )}
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-muted">
                <Link to="/today?update=1" className="mr-0.5 font-semibold text-accent hover:underline">
                  Todayで市況メモを反映
                </Link>
                すると、ここにも自動で入ります。
              </p>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer text-[12px] font-semibold text-ink-2">地合いを手で決める（上級者向け）</summary>
              <p className="mt-2 text-[12px] text-muted">ここで変えると、Todayとの連動を止めて固定します。</p>
              <button
                type="button"
                className="btn mt-2"
                onClick={() => analysis && fixMarket('dataset', JSON.stringify(analysis.dataset.marketContext, null, 2))}
                disabled={!analysis}
              >
                表示中の候補データの地合いに固定
              </button>
              <textarea
                className="field mt-2 min-h-[12rem] w-full font-mono text-[12px]"
                value={marketJson}
                onChange={(e) => fixMarket('edited', e.target.value)}
                spellCheck={false}
                aria-label="地合い（JSON）"
              />
            </details>
          </Panel>

          {/* 補助データ */}
          <details className="panel group overflow-hidden">
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
              <h2 className="text-[13px] font-bold">補助データ（任意）</h2>
              <span className="text-[12px] text-muted">信用残・決算予定日。無くても生成できます</span>
              <span className="ml-auto text-[12px] font-semibold text-accent">
                <span className="group-open:hidden">開く ▾</span>
                <span className="hidden group-open:inline">閉じる ▴</span>
              </span>
            </summary>
            <div className="grid grid-cols-1 gap-4 border-t border-rule px-4 py-3 lg:grid-cols-2">
              <label className="block min-w-0">
                <FieldLabel hint="入れると需給スコア（信用倍率・買残/売残の変化）の精度が上がります。列：code, asOf, buyBalance, sellBalance, buyBalancePrev, sellBalancePrev">
                  信用残（CSV）
                </FieldLabel>
                <textarea
                  className="field min-h-[9rem] w-full font-mono text-[12px]"
                  value={marginCsv}
                  onChange={(e) => setMarginCsv(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className="block min-w-0">
                <FieldLabel hint="決算またぎの警告に使います。列：code, date（YYYY-MM-DD）, timing（pre-market / intraday / after-close / unknown）, period">
                  決算予定日（CSV）
                </FieldLabel>
                <textarea
                  className="field min-h-[9rem] w-full font-mono text-[12px]"
                  value={earningsCsv}
                  onChange={(e) => setEarningsCsv(e.target.value)}
                  spellCheck={false}
                />
              </label>
            </div>
          </details>
        </div>

        {/* データ生成（生成 → 生成に使うデータ → 公開用の保存 → 入力内容の控え） */}
        <aside ref={nextRef} className="scroll-mt-4 lg:sticky lg:top-4">
          <section className="panel overflow-hidden" aria-labelledby="next-title">
            <header className="border-b border-rule px-4 py-2.5">
              <h2 id="next-title" className="text-[13px] font-bold">
                データ生成
              </h2>
            </header>

            <div className="space-y-2.5 px-4 py-3">
              <button type="button" className="btn btn-primary w-full justify-center" onClick={generate} disabled={!canGenerate}>
                候補を生成
              </button>
              {/* いつ押したか：このブラウザで生成して表示中のデータの作成日時 */}
              <p className="text-[12px] text-muted">
                {datasetOverride ? (
                  <>
                    最終生成 <span className="num font-semibold text-ink-2">{formatDateTime(datasetOverride.meta.generatedAt)}</span>
                    {marketContextOutdated(datasetOverride.marketContext, todayMarket) && (
                      <span className="block text-caution">その後 Today を更新しています。生成し直すと地合いに反映されます</span>
                    )}
                  </>
                ) : (
                  'このブラウザではまだ生成していません'
                )}
              </p>
              {!canGenerate && (
                <p className="text-[12px] text-muted">
                  {fetching
                    ? '日足の取得が終わるまでお待ちください。'
                    : codes.length === 0
                      ? '銘柄リストを入稿してください。'
                      : coverage.have === 0
                        ? '先に日足を用意してください。'
                        : '地合いを確認してください。'}
                </p>
              )}
              {error && <p className="rounded-sm border border-down/30 bg-down-soft px-3 py-2 text-[12px] text-down">{error}</p>}
              {result && (
                <div className="relative rounded-sm bg-panel-2 py-2 pr-8 pl-3 text-[12.5px]" role="status">
                  <button
                    type="button"
                    className="absolute top-1.5 right-1.5 rounded p-1 text-muted hover:bg-panel hover:text-ink"
                    onClick={() => setResult(null)}
                    aria-label="生成結果を閉じる"
                    title="閉じる"
                  >
                    <IconClose className="h-3.5 w-3.5" />
                  </button>
                  <p className="font-bold text-ink">
                    生成して画面に反映しました：採点 <span className="num">{result.dataset.candidates.length}</span>銘柄（
                    {formatDateJa(result.dataset.asOf)}引け）
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-2">
                    銘柄 <span className="num">{result.stats.universe}</span> → 日足あり <span className="num">{result.stats.withPrices}</span> →
                    採点 <span className="num">{result.stats.screened}</span>。上位6件が今週の候補です
                  </p>
                  <p className="text-[11.5px] text-muted">条件：売買代金1億円以上・株価200円以上（お気に入りは条件に関係なく採点）</p>
                  <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-semibold">
                    <Link to="/" className="text-accent hover:underline">
                      ダッシュボードで見る →
                    </Link>
                    <Link to="/candidates" className="text-accent hover:underline">
                      候補一覧で見る →
                    </Link>
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-rule px-4 py-3">
              <h3 className="mb-1.5 text-[12px] font-bold text-ink-2">生成に使うデータ</h3>
              <ul className="space-y-1.5 text-[12.5px] text-ink-2">
                <Check state={codes.length > 0 ? 'ok' : 'none'}>
                  銘柄リスト <span className="num">{codes.length}</span>銘柄（お気に入り <span className="num">{favoriteCount}</span>）
                </Check>
                {/* 日足が無い銘柄・基準日の足が無い銘柄があれば「!」（日足ブロックの注意と同じ印） */}
                <Check state={complete && dates.stale.length === 0 ? 'ok' : coverage.have > 0 ? 'warn' : 'none'}>
                  日足 <span className="num">{coverage.have}/{coverage.need}</span>銘柄
                </Check>
                <Check state={!dates.latest ? 'none' : asOfBehind ? 'warn' : 'ok'}>
                  基準日 <span className="num">{dates.latest ? formatDateJa(asOf) : '—'}</span>
                  {dates.latest && asOfBehind && '（最新の引けより前）'}
                </Check>
                <Check state={!market || (!marketFixed && !todayFresh) ? 'warn' : 'ok'}>
                  地合い：{market ? marketLabel : '形式に誤りがあります'}
                </Check>
              </ul>
            </div>

            <div className="space-y-2.5 border-t border-rule px-4 py-3">
              <h3 className="text-[12.5px] font-bold">公開サイト・ほかの端末で見せる</h3>
              <div>
                <button
                  type="button"
                  className="btn w-full justify-center"
                  disabled={!savable}
                  onClick={() => savable && downloadJson(outputFile, savable)}
                >
                  JSONファイルを保存
                </button>
                <p className="mt-1 text-[11.5px] leading-snug text-muted">
                  保存した <span className="font-mono">{outputFile}</span> を data/ に置いてアップロードします。
                </p>
              </div>
              <details className="text-[12px] text-ink-2">
                <summary className="cursor-pointer font-semibold">ファイルの置き場所（上級者向け）</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  <li>
                    <span className="font-mono">{outputFile}</span> は data/ に置きます
                  </li>
                  <li>全銘柄の一覧とお気に入り（favorite 列）もこのファイルに入ります</li>
                  <li>data/manifest.json に登録すると、ヘッダーの下の帯のデータ選択に出ます</li>
                  <li>静的サイトなので、この画面からサーバーへ直接は保存しません</li>
                </ul>
                {savable && (
                  <button
                    type="button"
                    className="btn mt-2"
                    onClick={() =>
                      downloadJson('manifest.patch.json', {
                        default: outputFile,
                        datasets: [
                          {
                            file: outputFile,
                            asOf: savable.asOf,
                            label: `${formatDateJa(savable.asOf)} 代表銘柄スクリーニング`,
                            isSample: false,
                            generatedAt: savable.meta.generatedAt,
                          },
                        ],
                      })
                    }
                  >
                    manifest 登録用のメモを保存
                  </button>
                )}
              </details>
            </div>

            {datasetOverride && (
              <div className="space-y-1 border-t border-rule bg-accent-soft/50 px-4 py-2.5 text-[12px]">
                <p className="font-bold text-accent">このブラウザで表示中の生成データ</p>
                <p className="flex items-center justify-between gap-2 text-ink-2">
                  {formatDateJa(datasetOverride.asOf)} {datasetModeFromSource(datasetOverride.meta.source).label}
                  <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setDatasetOverride(null)}>
                    解除してファイルのデータに戻す
                  </button>
                </p>
              </div>
            )}

            <div className="space-y-2 border-t border-rule px-4 py-3">
              <h3 className="text-[12.5px] font-bold">入力内容の控え（作業セット）</h3>
              <p className="text-[11.5px] leading-relaxed text-muted">
                銘柄リスト・日足・地合いなどの入力は、このブラウザに自動で保存されています。
                別のPCで続けたいときやバックアップに、ファイルとして保存できます（生成結果ではなく入力の控えです）。
              </p>
              {!storageOk && (
                <p className="text-[12px] text-caution">ブラウザへの自動保存に失敗しました（容量不足など）。作業セットをファイルに保存してください。</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn" onClick={() => downloadJson(`swingscout-work-${asOf}.json`, workFile())}>
                  作業セットを保存
                </button>
                <label className="btn cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                  作業セットを読み込む
                  <input
                    className="sr-only"
                    type="file"
                    accept="application/json,.json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.currentTarget.value = '';
                      if (!file) return;
                      try {
                        await loadWork(parseWorkSetFile(await file.text()));
                      } catch (err) {
                        setWorkStatus(err instanceof Error ? err.message : String(err));
                      }
                    }}
                  />
                </label>
              </div>
              {workStatus && (
                <p className="text-[12px] text-accent" role="status">
                  {workStatus}
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
