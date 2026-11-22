import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { Shell } from './components/Shell';
import PlanPage from './pages/PlanPage';

const TwinPage = lazy(() => import('./pages/TwinPage'));
const YuiPage = lazy(() => import('./pages/YuiPage'));
const ProcessPage = lazy(() => import('./pages/ProcessPage'));
const CheckPage = lazy(() => import('./pages/CheckPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const ReplayPage = lazy(() => import('./pages/ReplayPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const Process3DPage = lazy(() => import('./pages/Process3DPage'));
const VideoPage = lazy(() => import('./pages/VideoPage'));
const CertificatePage = lazy(() => import('./pages/CertificatePage'));

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
  // The 3D process on its own (for the QR code): no site menus around it.
  if (location.pathname.startsWith('/certificate/')) {
    return (
      <Suspense fallback={null}>
        <Routes location={location}>
          <Route path="/certificate/:id" element={<CertificatePage />} />
        </Routes>
      </Suspense>
    );
  }
  if (location.pathname === '/video') {
    return (
      <Suspense fallback={null}>
        <VideoPage />
      </Suspense>
    );
  }
  if (location.pathname === '/3d' || location.pathname.startsWith('/3d/')) {
    return (
      <Suspense fallback={null}>
        <Process3DPage />
      </Suspense>
    );
  }
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <Routes location={location}>
          <Route path="/" element={<PlanPage />} />
          <Route path="/twin" element={<TwinPage />} />
          <Route path="/process" element={<ProcessPage />} />
          <Route path="/check" element={<CheckPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/yui" element={<YuiPage />} />
          <Route path="/replay" element={<ReplayPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<PlanPage />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
