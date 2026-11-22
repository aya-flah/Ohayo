import { NavLink, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { IconDrop, IconLeaf, IconMoon, IconPlan, IconProcess, IconReplay, IconSettings, IconSunMode, IconTwin, IconWifiOff, IconYui } from './Icons';
import { useIsPhone, useOnline, usePrefersReducedMotion, tap } from '../lib/device';
import { useSonae } from '../lib/store';
import { DEFAULT_CURSOR, poseFor, useFieldMode, useRegionState, useScene } from '../lib/scene';
import { useZPlan } from '../lib/zitoun';
import { useProcess } from '../lib/process';
import { useSession } from '../lib/session';
import { EASE } from './ui';
import { PageErrorBoundary } from './PageErrorBoundary';
import { LangPicker } from './LangPicker';

const ZitounScene = lazy(() => import('../pages/twin/ZitounScene').then((m) => ({ default: m.ZitounScene })));
const ProcessScene = lazy(() => import('../pages/twin/ProcessScene').then((m) => ({ default: m.ProcessScene })));

const NAV = [
  { to: '/', label: 'Plan', jp: '計画', icon: IconPlan },
  { to: '/twin', label: 'Twin', jp: '双子', icon: IconTwin },
  { to: '/process', label: 'Process', jp: '工程', icon: IconProcess },
  { to: '/check', label: 'Check', jp: '診', icon: IconLeaf },
  { to: '/yui', label: 'Yui', jp: '結', icon: IconYui },
  { to: '/replay', label: 'Replay', jp: '再生', icon: IconReplay },
];

const navIndex = (path: string) => Math.max(0, NAV.findIndex((n) => (n.to === '/' ? path === '/' : path.startsWith(n.to))));

/* ── The living farm behind everything ───────────────────────────────── */

function Backdrop() {
  const location = useLocation();
  const pose = poseFor(location.pathname);
  const reduced = usePrefersReducedMotion();
  const field = useFieldMode();
  const state = useRegionState();
  const { input, plan } = useZPlan();
  const step = useProcess((s) => s.step);
  const twin = pose === 'twin' || pose === 'process';
  // Grignon heaps grow while mills press and shrink with each delivery.
  const grignonStock: Record<string, number> = {};
  for (const m of input.mills) {
    let t = m.grignonT;
    for (let i = 0; i <= state.day; i++) {
      t += m.grignonPerDayT;
      for (const g of plan.days[i]!.grignon) if (g.millId === m.id) t -= g.tonnes;
    }
    grignonStock[m.id] = Math.max(0, t);
  }
  return (
    <>
      <div className={`fixed inset-0 z-0 ${twin ? '' : 'pointer-events-none'}`} aria-hidden={!twin}>
        {/* fallback gradient while three.js loads (and behind the canvas) */}
        <div className="absolute inset-0" style={{ background: field ? 'linear-gradient(180deg,#f3ead9,#faf8f5)' : 'radial-gradient(120% 80% at 70% 20%, #13304f 0%, #0b121e 55%, #060b14 100%)' }} />
        <Suspense fallback={null}>
          <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 1.6, ease: EASE } }}>
            {pose === 'process' ? (
              <ProcessScene step={step} reduced={reduced} field={field} />
            ) : (
              <ZitounScene input={input} plan={plan} state={state} grignonStock={grignonStock} reduced={reduced} pose={pose} interactive={twin} field={field} badges={twin} />
            )}
          </motion.div>
        </Suspense>
      </div>
      {/* scrim: keeps the HUD legible, opens up on the Twin page */}
      <motion.div className="pointer-events-none fixed inset-0 z-[1]" style={{ background: 'var(--scrim)' }} animate={{ opacity: twin ? 0 : 1 }} transition={{ duration: 1, ease: EASE }} />
      <motion.div className="pointer-events-none fixed inset-0 z-[1]" style={{ background: 'var(--scrim-twin)' }} animate={{ opacity: twin ? 1 : 0 }} transition={{ duration: 1, ease: EASE }} />
      <div className="noise pointer-events-none fixed inset-0 z-[2]" />
      <RainFlash raining={state.rain > 0} overflow={state.ponds.some((p) => p.overflow)} />
    </>
  );
}

/** A cool pulse from the screen edges when rain starts; a coral glow while a pond overflows. */
function RainFlash({ raining, overflow }: { raining: boolean; overflow: boolean }) {
  const [n, setN] = useState(0);
  const prev = useRef(raining);
  useEffect(() => {
    if (!prev.current && raining) setN((x) => x + 1);
    prev.current = raining;
  }, [raining]);
  return (
    <>
      <AnimatePresence>
        {n > 0 && (
          <motion.div
            key={n}
            className="pointer-events-none fixed inset-0 z-[60]"
            style={{ boxShadow: 'inset 0 0 160px 30px color-mix(in oklab, var(--water) 55%, transparent)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.3, 0.7, 0], transition: { duration: 1.4, times: [0, 0.1, 0.3, 0.45, 1] } }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
      <motion.div
        className="pointer-events-none fixed inset-0 z-[3]"
        style={{ boxShadow: 'inset 0 0 120px 0 color-mix(in oklab, var(--cut) 35%, transparent)' }}
        animate={{ opacity: overflow ? 1 : 0 }}
        transition={{ duration: 0.8 }}
      />
    </>
  );
}

/* ── Brand & status ──────────────────────────────────────────────────── */

function BrandMark() {
  return (
    <NavLink to="/" className="group flex items-center gap-3 select-none" aria-label="Sonae home">
      <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl" style={{ background: 'linear-gradient(145deg, var(--water), var(--water-deep))', boxShadow: 'var(--glow-water), 0 1px 0 rgb(255 255 255 / .35) inset' }}>
        <span lang="ja" className="relative z-[1] font-jp text-[22px] leading-none font-extrabold text-white">備</span>
        <span className="absolute inset-x-0 bottom-0 h-1/2 bg-white/15 transition-transform duration-700 group-hover:-translate-y-1" style={{ borderRadius: '45% 55% 0 0' }} />
      </span>
      <span className="hidden flex-col leading-none sm:flex">
        <span className="whitespace-nowrap text-[19px] font-extrabold tracking-tight">Sonae <span className="font-semibold text-ink-2">Zitoun</span></span>
        <span lang="ja" className="mt-1.5 font-jp text-[11px] tracking-[0.3em] text-ink-2">備え</span>
      </span>
    </NavLink>
  );
}

function StatusCluster({ compact = false }: { compact?: boolean }) {
  const state = useRegionState();
  const online = useOnline();
  const pct = Math.round(state.pondAvg * 100);
  const hot = state.ponds.some((p) => p.share >= 0.9);
  const hh = String(Math.floor(state.hour)).padStart(2, '0');
  return (
    <div className="flex items-center gap-1.5">
      {!online && (
        <span className="chip" style={{ color: 'var(--solar)' }} role="status">
          <IconWifiOff width={15} height={15} />
          {!compact && <span className="text-ink">Offline · plan still works</span>}
        </span>
      )}
      <span className={`chip num whitespace-nowrap ${compact ? 'hidden sm:inline-flex' : ''}`} title="Margine in the mills' ponds" style={{ color: hot ? 'var(--cut)' : 'var(--margine)' }}>
        <span className="relative h-3.5 w-2 overflow-hidden rounded-[3px] border border-current">
          <motion.span className="absolute inset-x-0 bottom-0 bg-current" animate={{ height: `${pct}%` }} transition={{ duration: 0.6, ease: EASE }} />
        </span>
        <span className="text-ink">{compact ? `${pct}%` : `Ponds ${pct}%`}</span>
      </span>
      <motion.span layout className="chip whitespace-nowrap" style={{ color: state.blocked ? 'var(--water)' : 'var(--ok)' }} title="Can margine be spread now?">
        {state.rain > 0 ? <IconDrop width={14} height={14} /> : <span className="dot" />}
        <span className="text-ink">{state.blocked ? (compact ? 'Paused' : state.rain > 0 ? 'Rain · paused' : 'Paused') : compact ? 'Spread' : 'Spreading OK'}</span>
      </motion.span>
      {!compact && (
        <span className="chip num hidden whitespace-nowrap 2xl:inline-flex">
          <span className="text-ink-2">Day {state.day + 1}</span>
          <span className="text-ink">{hh}:00</span>
        </span>
      )}
    </div>
  );
}

function AccountButton() {
  const user = useSession((s) => s.user);
  if (!user)
    return (
      <NavLink to="/login" onClick={() => tap()} className="glass glass-soft flex h-12 items-center whitespace-nowrap rounded-full px-4 text-[14.5px] font-semibold text-ink transition-transform duration-200 active:scale-95">
        Sign in
      </NavLink>
    );
  const tone = user.role === 'mill' ? 'var(--margine)' : user.role === 'farmer' ? 'var(--olive)' : 'var(--water)';
  return (
    <NavLink to="/account" onClick={() => tap()} className="glass glass-soft flex h-12 items-center gap-2 rounded-full pl-1.5 pr-3.5 transition-transform duration-200 active:scale-95" aria-label={`Your account: ${user.name}`}>
      <span className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-extrabold text-white" style={{ background: tone }}>
        {user.name.slice(0, 2).toUpperCase()}
      </span>
      <span className="hidden max-w-[110px] truncate text-[14px] font-semibold min-[1800px]:inline">{user.name}</span>
    </NavLink>
  );
}

function ModeToggle() {
  const field = useFieldMode();
  const setTheme = useSonae((s) => s.setTheme);
  return (
    <button
      onClick={() => {
        tap();
        setTheme(field ? 'dark' : 'light');
      }}
      className="glass glass-soft relative grid h-12 w-12 place-items-center overflow-hidden rounded-full text-ink transition-transform duration-200 active:scale-90"
      aria-label={field ? 'Switch to Spatial Glass mode' : 'Switch to Field (sunlight) mode'}
      title={field ? 'Spatial Glass mode' : 'Field mode for bright sunlight'}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={field ? 'sun' : 'moon'} initial={{ rotate: -90, scale: 0.4, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 90, scale: 0.4, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} style={{ color: field ? 'var(--solar)' : 'var(--water)' }}>
          {field ? <IconSunMode width={22} height={22} /> : <IconMoon width={21} height={21} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/* ── Navigation ──────────────────────────────────────────────────────── */

function DesktopNav() {
  return (
    <nav className="glass glass-edge relative flex items-center gap-1 rounded-full p-1.5" aria-label="Main">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} onClick={() => tap()} className="relative" title={label}>
          {({ isActive }) => (
            <span className={`relative z-[1] flex min-h-[48px] min-w-[62px] flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-[18px] px-2.5 text-[11.5px] font-semibold min-[1560px]:min-h-[44px] min-[1560px]:min-w-0 min-[1560px]:flex-row min-[1560px]:gap-2 min-[1560px]:rounded-full min-[1560px]:px-4 min-[1560px]:text-[15px] transition-colors duration-300 ${isActive ? 'text-on-accent' : 'text-ink-2 hover:text-ink'}`}>
              {isActive && (
                <motion.span
                  layoutId="nav-liquid"
                  className="absolute inset-0 -z-[1] rounded-[18px] min-[1560px]:rounded-full"
                  style={{ background: 'linear-gradient(135deg, var(--water), color-mix(in oklab, var(--water) 55%, var(--water-deep)))', boxShadow: '0 1px 0 rgb(255 255 255 / .35) inset, 0 10px 30px -8px var(--water)' }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <Icon width={19} height={19} />
              <span>{label}</span>
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function MobileDock() {
  return (
    <nav className="fixed inset-x-3 z-50 lg:hidden" style={{ bottom: 'max(12px, env(safe-area-inset-bottom))' }} aria-label="Main">
      <div className="glass glass-edge glass-strong grid grid-cols-6 rounded-[28px] p-1.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} onClick={() => tap()} className="relative">
            {({ isActive }) => (
              <span className={`dock-item relative z-[1] flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[22px] text-[11px] font-semibold transition-colors duration-300 ${isActive ? 'text-on-accent' : 'text-ink-2'}`}>
                {isActive && (
                  <motion.span
                    layoutId="dock-liquid"
                    className="absolute inset-0 -z-[1] rounded-[22px]"
                    style={{ background: 'linear-gradient(160deg, var(--water), color-mix(in oklab, var(--water) 50%, var(--water-deep)))', boxShadow: '0 1px 0 rgb(255 255 255 / .35) inset, 0 8px 24px -6px var(--water)' }}
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <motion.span animate={{ y: isActive ? -1 : 0, scale: isActive ? 1.08 : 1 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }}>
                  <Icon width={22} height={22} />
                </motion.span>
                <span className="dock-label">{label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/* ── Page transition: a tide of light sweeps across ──────────────────── */

function TideSweep({ path, dir }: { path: string; dir: number }) {
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  if (first.current) return null;
  return (
    <motion.div
      key={path}
      aria-hidden
      className="pointer-events-none fixed inset-y-0 z-[45] w-[60vw]"
      style={{ background: 'linear-gradient(90deg, transparent, color-mix(in oklab, var(--water) 16%, transparent) 45%, color-mix(in oklab, var(--water) 30%, transparent) 50%, color-mix(in oklab, var(--water) 16%, transparent) 55%, transparent)', filter: 'blur(20px)' }}
      initial={{ x: dir >= 0 ? '-70vw' : '110vw', opacity: 0 }}
      animate={{ x: dir >= 0 ? '110vw' : '-70vw', opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
    />
  );
}

/* ── First-load intro: 備え fills like a tank, then the world rises ───── */

function Intro() {
  const reduced = usePrefersReducedMotion();
  const [show, setShow] = useState(() => {
    try {
      return !sessionStorage.getItem('sonae:intro');
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!show) return;
    try {
      sessionStorage.setItem('sonae:intro', '1');
    } catch {
      /* fine */
    }
    const t = setTimeout(() => setShow(false), reduced ? 300 : 2300);
    return () => clearTimeout(t);
  }, [show, reduced]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center bg-[#060b14]"
          exit={{ clipPath: 'circle(0% at 50% 50%)', transition: { duration: 0.9, ease: [0.65, 0, 0.35, 1] } }}
          style={{ clipPath: 'circle(150% at 50% 50%)' }}
          onClick={() => setShow(false)}
        >
          <div className="relative flex flex-col items-center">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="absolute left-1/2 top-[38%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#38bdf8]"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 3.2, opacity: [0, 0.5, 0] }}
                transition={{ duration: 2.2, delay: 0.5 + i * 0.35, ease: 'easeOut' }}
              />
            ))}
            <div className="relative">
              <span lang="ja" className="font-jp text-[120px] leading-none font-extrabold text-white/10 md:text-[160px]">備え</span>
              <motion.span
                lang="ja"
                aria-hidden
                className="absolute inset-0 font-jp text-[120px] leading-none font-extrabold md:text-[160px]"
                style={{ background: 'linear-gradient(180deg,#7dd3fc,#38bdf8 40%,#1b4d7e)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
                initial={{ clipPath: 'inset(100% 0 0 0)' }}
                animate={{ clipPath: 'inset(0% 0 0 0)' }}
                transition={{ duration: 1.3, delay: 0.2, ease: [0.65, 0, 0.35, 1] }}
              >
                備え
              </motion.span>
            </div>
            <motion.div className="mt-6 text-[15px] font-semibold tracking-[0.4em] text-white/80 uppercase" initial={{ opacity: 0, y: 10, letterSpacing: '0.8em' }} animate={{ opacity: 1, y: 0, letterSpacing: '0.4em' }} transition={{ duration: 1, delay: 0.9, ease: EASE }}>
              Sonae
            </motion.div>
            <motion.div className="mt-2 text-[14px] text-white/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.3 }}>
              Prepared, nothing to fear.
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Shell ───────────────────────────────────────────────────────────── */

export function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const theme = useSonae((s) => s.theme);
  const twin = location.pathname.startsWith('/twin') || location.pathname.startsWith('/process');
  const idx = navIndex(location.pathname);
  const prevIdx = useRef(idx);
  const dir = idx - prevIdx.current;
  const phone = useIsPhone();
  useEffect(() => {
    prevIdx.current = idx;
  }, [idx]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'light' ? '#faf8f5' : '#0b121e');
  }, [theme]);

  // Leaving the Twin page stops any forced rain; calm pages show today at 10:00, tankers on the road.
  const setForceRain = useScene((s) => s.setForceRain);
  const setSceneCursor = useScene((s) => s.setCursor);
  useEffect(() => {
    if (!twin) setForceRain(false);
    if (idx >= 2 && !twin) setSceneCursor(DEFAULT_CURSOR);
  }, [twin, idx, setForceRain, setSceneCursor]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  // The top bar fades away as soon as the page scrolls, and comes back only at the very top.
  const [atTop, setAtTop] = useState(true);
  useEffect(() => {
    const onScroll = () => setAtTop(window.scrollY < 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen">
      <Intro />
      <Backdrop />
      {!phone && <TideSweep key={location.pathname} path={location.pathname} dir={dir} />}

      {/* Top HUD */}
      <motion.header
        className="pointer-events-none fixed inset-x-0 top-0 z-40"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
        animate={atTop ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: -24, filter: phone ? 'blur(0px)' : 'blur(6px)' }}
        transition={{ duration: atTop ? 0.3 : 0.2, ease: atTop ? EASE : [0.7, 0, 0.84, 0] }}
        aria-hidden={!atTop}
        inert={!atTop}
      >
        <div className={`mx-auto flex max-w-[1720px] items-center justify-between gap-3 px-3 md:px-6 ${atTop ? '' : '[&_*]:!pointer-events-none'}`}>
          <div className="glass glass-edge pointer-events-auto shrink-0 rounded-full p-1.5 sm:pr-5">
            <BrandMark />
          </div>
          <div className="pointer-events-auto hidden lg:block">
            <DesktopNav />
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            <div className="hidden">
              <StatusCluster />
            </div>
            <div className="hidden xl:block">
              <StatusCluster compact />
            </div>
            <AccountButton />
            <NavLink to="/settings" onClick={() => tap()} className={({ isActive }) => `glass glass-soft grid h-12 w-12 place-items-center rounded-full transition-transform duration-200 active:scale-90 ${isActive ? 'text-[var(--water)]' : 'text-ink'}`} aria-label="Settings" title="Settings">
              <IconSettings width={21} height={21} />
            </NavLink>
            <LangPicker />
            <ModeToggle />
          </div>
        </div>
      </motion.header>

      <main className={`relative z-10 min-w-0 px-4 md:px-8 ${twin ? 'pointer-events-none' : ''}`} style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 92px)', paddingBottom: twin ? 0 : 'calc(max(12px, env(safe-area-inset-bottom)) + 108px)' }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            className="mx-auto max-w-[1280px]"
            exit={phone ? { opacity: 0, y: -10, transition: { duration: 0.18, ease: [0.7, 0, 0.84, 0] } } : { opacity: 0, y: -18, scale: 0.985, filter: 'blur(14px)', transition: { duration: 0.32, ease: [0.7, 0, 0.84, 0] } }}
          >
            <PageErrorBoundary>{children}</PageErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>

      <MobileDock />
    </div>
  );
}
