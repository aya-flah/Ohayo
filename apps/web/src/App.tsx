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
    <div className="flex flex-col items-center gap-4 py-32 text-ink-2" role="status">
      <span className="relative h-12 w-12">
        <span className="absolute inset-0 animate-ping rounded-full border border-[var(--water)] opacity-40" />
        <span className="absolute inset-2 rounded-full" style={{ background: 'linear-gradient(135deg, var(--water), var(--water-deep))', boxShadow: 'var(--glow-water)' }} />
      </span>
      <span className="text-[15px] font-semibold">Loading the olive region…</span>
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
