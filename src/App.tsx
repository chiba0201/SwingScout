import { HashRouter, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { CandidateDetailPage } from './pages/CandidateDetailPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReportPage } from './pages/ReportPage';
import { TodayPage } from './pages/TodayPage';
import { DataProvider } from './state/DataContext';

/**
 * HashRouter を使う理由：さくらのレンタルサーバー等の静的ホスティングで、
 * .htaccess のリライト設定なしに直リンク・リロードができるため（URLは #/candidates のようになる）。
 */
export function App() {
  return (
    <DataProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="today" element={<TodayPage />} />
            <Route path="candidates" element={<CandidatesPage />} />
            <Route path="candidates/:code" element={<CandidateDetailPage />} />
            <Route path="report" element={<ReportPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </DataProvider>
  );
}
