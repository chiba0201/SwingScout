/**
 * 候補一覧。PC はテーブル、スマホは1銘柄1ブロックのリストで表示する。
 */
import { Link, useNavigate } from 'react-router';
import type { AnalyzedCandidate } from '../lib/analysis';
import { formatPrice, formatScore } from '../lib/format';
import { Sparkline } from './charts';
import { ChangePct, cx, ScoreBar, ScoreCell, WarningTags } from './ui';

function NameCell({ c, detailBasePath }: { c: AnalyzedCandidate; detailBasePath: string }) {
  return (
    <div className="min-w-0">
      <Link
        to={`${detailBasePath}/${c.code}`}
        className="font-semibold text-ink hover:text-accent hover:underline hover:underline-offset-2"
      >
        <span className="num mr-1.5 text-[12px] font-medium text-ink-2">{c.code}</span>
        {c.name}
      </Link>
      <div className="truncate text-[11.5px] text-muted">
        {c.sector}・{c.theme}
        {c.technical.pattern && <span className="ml-1.5 text-ink-2">／{c.technical.pattern}</span>}
      </div>
    </div>
  );
}

function TotalCell({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="num w-7 text-right text-[15px] font-semibold text-ink">{formatScore(value)}</span>
      <ScoreBar value={value} className="w-16" />
    </div>
  );
}

export function CandidateTable({
  candidates,
  variant = 'full',
  dimFrom,
  detailBasePath = '/candidates',
}: {
  candidates: AnalyzedCandidate[];
  /** compact: ダッシュボード用（サブスコア列を省略） */
  variant?: 'full' | 'compact';
  /** この順位以降を薄く表示（上位N件の外） */
  dimFrom?: number;
  detailBasePath?: string;
}) {
  const navigate = useNavigate();
  const full = variant === 'full';

  return (
    <>
      {/* PC: テーブル */}
      <div className="hidden overflow-x-auto md:block">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-10 text-right">順位</th>
              <th>銘柄</th>
              <th className="text-right">終値 / 前日比</th>
              {full && <th>60日</th>}
              <th>総合</th>
              {full && (
                <>
                  <th className="text-right">需給</th>
                  <th className="text-right">テク</th>
                  <th className="text-right">イベ</th>
                  <th className="text-right" title="高いほど危険">
                    リスク
                  </th>
                </>
              )}
              <th>警告</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr
                key={c.code}
                className={cx(
                  'cursor-pointer hover:bg-panel-2',
                  dimFrom !== undefined && c.rank >= dimFrom && 'opacity-60 hover:opacity-100',
                )}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a')) return;
                  navigate(`${detailBasePath}/${c.code}`);
                }}
              >
                <td className="num text-right text-[15px] font-semibold text-ink-2">{c.rank}</td>
                <td className="max-w-[18rem]">
                  <NameCell c={c} detailBasePath={detailBasePath} />
                </td>
                <td className="text-right">
                  <div className="num">{formatPrice(c.price.close)}</div>
                  <ChangePct pct={c.price.changePct} className="text-[11.5px]" />
                </td>
                {full && (
                  <td>{c.price.history && <Sparkline values={c.price.history} label={`${c.name}の終値推移`} />}</td>
                )}
                <td>
                  <TotalCell value={c.scores.total} />
                </td>
                {full && (
                  <>
                    <td>
                      <ScoreCell value={c.scores.supplyDemand} label="需給" />
                    </td>
                    <td>
                      <ScoreCell value={c.scores.technical} label="テクニカル" />
                    </td>
                    <td>
                      <ScoreCell value={c.scores.event} label="イベント" />
                    </td>
                    <td>
                      <ScoreCell value={c.scores.risk} tone="caution" label="リスク" />
                    </td>
                  </>
                )}
                <td className="min-w-[8rem]">
                  <WarningTags warnings={c.warnings} max={full ? undefined : 2} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* スマホ: リスト */}
      <ol className="divide-y divide-rule md:hidden">
        {candidates.map((c) => (
          <li
            key={c.code}
            className={cx('px-4 py-3', dimFrom !== undefined && c.rank >= dimFrom && 'opacity-70')}
          >
            <div className="flex items-start gap-3">
              <span className="num w-5 shrink-0 pt-0.5 text-right text-[15px] font-semibold text-ink-2">{c.rank}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <NameCell c={c} detailBasePath={detailBasePath} />
                  <div className="shrink-0 text-right">
                    <div className="num text-[16px] leading-tight font-semibold">{formatScore(c.scores.total)}</div>
                    <div className="text-[10px] text-muted">総合</div>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px]">
                  <span>
                    <span className="num mr-1.5">{formatPrice(c.price.close)}</span>
                    <ChangePct pct={c.price.changePct} />
                  </span>
                  <span className="num text-ink-2">
                    需{formatScore(c.scores.supplyDemand)} テ{formatScore(c.scores.technical)} イ
                    {formatScore(c.scores.event)} <span className="text-caution">リ{formatScore(c.scores.risk)}</span>
                  </span>
                </div>
                {c.warnings.length > 0 && (
                  <div className="mt-1.5">
                    <WarningTags warnings={c.warnings} />
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
