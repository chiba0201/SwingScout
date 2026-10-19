import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router';
import { Layout } from './components/Layout';
import { CandidateDetailPage } from './pages/CandidateDetailPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { DataUpdatePage } from './pages/DataUpdatePage';
import { DashboardPage } from './pages/DashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReportPage } from './pages/ReportPage';
import { TodayPage } from './pages/TodayPage';
import { DataProvider } from './state/DataContext';

/** 以前のお気に入り詳細（#/favorites/:code・#/candidates/favorites/:code）を銘柄詳細へ転送する */
function LegacyFavoriteDetail() {
  const { code } = useParams();
  return <Navigate to={`/candidates/${code ?? ''}`} replace />;
}

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
            {/* お気に入りは候補一覧のタブ（?tab=favorites）。詳細は他の銘柄と同じ #/candidates/:code */}
            <Route path="candidates/favorites" element={<Navigate to="/candidates?tab=favorites" replace />} />
            <Route path="candidates/favorites/:code" element={<LegacyFavoriteDetail />} />
            {/* 以前のURL（お気に入りタブがナビにあった頃）からの転送 */}
            <Route path="favorites" element={<Navigate to="/candidates?tab=favorites" replace />} />
            <Route path="favorites/:code" element={<LegacyFavoriteDetail />} />
            <Route path="data-update" element={<DataUpdatePage />} />
            <Route path="report" element={<ReportPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </DataProvider>
  );
}
