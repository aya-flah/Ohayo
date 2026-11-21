import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { Shell } from './components/Shell';
import PlanPage from './pages/PlanPage';

const TwinPage = lazy(() => import('./pages/TwinPage'));
const YuiPage = lazy(() => import('./pages/YuiPage'));
const ReplayPage = lazy(() => import('./pages/ReplayPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function Loading() {
  return (
    <div className="py-24 text-center text-ink-2" role="status">
      Loading…
    </div>
  );
}

export default function App() {
  const location = useLocation();
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <Routes location={location}>
          <Route path="/" element={<PlanPage />} />
          <Route path="/twin" element={<TwinPage />} />
          <Route path="/yui" element={<YuiPage />} />
          <Route path="/replay" element={<ReplayPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<PlanPage />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
