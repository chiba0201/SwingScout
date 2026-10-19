/**
 * レポート画面。
 *   レポート … 今週の作戦・イベント・候補を「読む」ためのビュー（WeeklyReportView）。編集はせず .md 保存のみ
 *   SNS投稿  … X・Threads 向けの投稿文を作る（SnsPostPanel）
 * 表示モードは URL（?mode=sns）に持たせて、直リンク・再読み込みでも同じ画面を開く。
 */
import { useSearchParams } from 'react-router';
import { downloadText } from '../components/download';
import { IconDownload } from '../components/icons';
import { SnsPostPanel } from '../components/SnsPostPanel';
import { cx, PageTitle } from '../components/ui';
import { WeeklyReportView } from '../components/WeeklyReportView';
import { DEFAULT_REPORT_OPTIONS, generateWeeklyReport } from '../lib/reportGenerator';
import { useAnalysis, useData } from '../state/DataContext';

type Mode = 'report' | 'sns';

const MODES: { id: Mode; label: string; description: string }[] = [
  { id: 'report', label: 'レポート', description: '今週の作戦・イベント・候補をまとめて読む' },
  { id: 'sns', label: 'SNS投稿', description: 'X・Threads 向けの投稿文を作る' },
];

export function ReportPage() {
  const a = useAnalysis();
  const { todayAnalysis, memo } = useData();
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get('mode') === 'sns' ? 'sns' : 'report';

  // 画面と同じ内容（今日の市況があれば冒頭に含める）を Markdown で保存する
  const saveMarkdown = () => {
    const markdown = generateWeeklyReport(
      a,
      { ...DEFAULT_REPORT_OPTIONS, sections: { ...DEFAULT_REPORT_OPTIONS.sections, today: !!todayAnalysis } },
      { today: todayAnalysis, memo },
    );
    downloadText(`${a.dataset.asOf}-${a.window.pattern.id}.md`, markdown, 'text/markdown;charset=utf-8');
  };

  return (
    <div className="space-y-4">
      <PageTitle title="レポート">
        <span className="hidden text-[12px] text-muted sm:inline">{MODES.find((m) => m.id === mode)?.description}</span>
        <div role="radiogroup" aria-label="表示の切り替え" className="inline-flex rounded border border-rule-strong bg-panel p-0.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setParams(m.id === 'report' ? {} : { mode: m.id }, { replace: true })}
              className={cx(
                'rounded-sm px-3 py-1 text-[12px] font-semibold',
                mode === m.id ? 'bg-accent text-panel' : 'text-ink-2 hover:text-ink',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === 'report' && (
          <button type="button" className="btn" onClick={saveMarkdown}>
            <IconDownload />
            .md を保存
          </button>
        )}
      </PageTitle>

      {mode === 'report' ? <WeeklyReportView analysis={a} today={todayAnalysis} memo={memo} /> : <SnsPostPanel base={a} />}
    </div>
  );
}
