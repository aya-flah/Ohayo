import { NavLink, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { IconPlan, IconReplay, IconSettings, IconTwin, IconWifiOff, IconYui } from './Icons';
import { useOnline } from '../lib/device';
import { useSonae } from '../lib/store';

const NAV = [
  { to: '/', label: 'Plan', icon: IconPlan },
  { to: '/twin', label: 'Twin', icon: IconTwin },
  { to: '/yui', label: 'Yui', icon: IconYui },
  { to: '/replay', label: 'Replay', icon: IconReplay },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-baseline gap-2.5 select-none">
      <span lang="ja" className="font-display text-[28px] leading-none font-extrabold text-accent-strong">
        備え
      </span>
      {!compact && <span className="font-display text-[20px] leading-none font-extrabold tracking-tight">Sonae</span>}
    </div>
  );
}

function OfflineNote({ className = '' }: { className?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div className={`flex items-center gap-2 rounded-lg bg-solar-soft px-3 py-2 text-[13px] text-ink ${className}`} role="status">
      <IconWifiOff width={16} height={16} />
      Offline. The plan still works.
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const theme = useSonae((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      {/* Desktop rail */}
      <aside className="hidden md:flex md:flex-col md:sticky md:top-0 md:h-screen border-r border-line bg-surface px-5 py-6">
        <BrandMark />
        <p className="mt-2 text-[12.5px] leading-snug text-ink-2">Prepared, nothing to fear.</p>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14.5px] transition-colors duration-150 ${
                  isActive ? 'bg-accent-soft text-accent-strong font-medium' : 'text-ink-2 hover:text-ink hover:bg-surface-2'
                }`
              }
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <OfflineNote />
          <p className="text-[12px] leading-snug text-ink-3">GDA Sidi Ali (demo), Kairouan. Weather by Open-Meteo.</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <BrandMark />
        <OfflineNote className="py-1.5" />
      </header>

      <main className="min-w-0 px-4 pb-28 pt-5 md:px-10 md:pb-12 md:pt-9">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.15, ease: [0.7, 0, 0.84, 0] } }}
            className="mx-auto max-w-[1180px]"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile tab bar */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Main"
      >
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-[11.5px] transition-colors duration-150 ${isActive ? 'text-accent-strong font-medium' : 'text-ink-2'}`
            }
          >
            <Icon width={22} height={22} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
