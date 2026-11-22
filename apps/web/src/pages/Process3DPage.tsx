import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SHORT, STEP_SECONDS, STEPS, TRACK, useProcess } from '../lib/process';
import { tap, usePrefersReducedMotion } from '../lib/device';
import { LangPicker } from '../components/LangPicker';
import { IconPause, IconPlay } from '../components/Icons';
import { EASE } from '../components/ui';

const ProcessScene = lazy(() => import('./twin/ProcessScene').then((m) => ({ default: m.ProcessScene })));

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
);

/**
 * The 3D process on its own, for a QR code: full-screen scene, one step card, no site menus.
 * Upright phone: card at the bottom. Phone on its side: card on the left. Desktop: card on the left.
 */
export default function Process3DPage() {
  const { step, setStep, playing, setPlaying } = useProcess();
  const reduced = usePrefersReducedMotion();
  const [more, setMore] = useState(false);
  const [ready, setReady] = useState(false);
  const last = STEPS.length - 1;
  const s = STEPS[step]!;
  const tone = TRACK[s.track].tone;

  // A dark stage, a clear tab title, and the walkthrough starting by itself.
  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    const title = document.title;
    document.title = 'Sonae Zitoun · 3D process';
    setStep(0);
    const t = setTimeout(() => {
      setReady(true);
      if (!reduced) setPlaying(true);
    }, 1400);
    return () => {
      clearTimeout(t);
      setPlaying(false);
      document.title = title;
      if (prev) document.documentElement.setAttribute('data-theme', prev);
    };
  }, [reduced, setPlaying, setStep]);

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setStep(step + 1), STEP_SECONDS * 1000);
    return () => clearTimeout(id);
  }, [playing, step, last, setStep, setPlaying]);

  useEffect(() => setMore(false), [step]);

  const go = (n: number) => {
    if (n < 0 || n > last) return;
    tap();
    setPlaying(false);
    setStep(n);
  };
  const toggle = () => {
    tap();
    if (!playing && step >= last) setStep(0);
    setPlaying(!playing);
  };

  // Keyboard on laptops: arrows change step, space plays or pauses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(step + 1);
      else if (e.key === 'ArrowLeft') go(step - 1);
      else if (e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Swipe the card left or right to change step.
  const startX = useRef<number | null>(null);
  const onDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
  };
  const onUp = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    const rtl = document.documentElement.dir === 'rtl';
    if (Math.abs(dx) > 50) go(step + ((dx < 0) !== rtl ? 1 : -1));
  };

  return (
    <div className="p3d fixed inset-0 overflow-hidden" style={{ background: 'radial-gradient(120% 80% at 70% 20%, #1c3d60 0%, #13283f 55%, #0b1626 100%)' }}>
      <style>{`
        .p3d-card { left: 10px; right: 10px; bottom: max(10px, env(safe-area-inset-bottom)); max-height: 58dvh; }
        @media (min-width: 768px) { .p3d-card { left: 0; right: 0; margin: 0 auto; width: min(640px, calc(100% - 48px)); bottom: 24px; } }
        @media (min-width: 1100px) { .p3d-card { left: 28px; right: auto; margin: 0; width: 410px; top: 92px; bottom: auto; max-height: calc(100dvh - 120px); } }
        @media (orientation: landscape) and (max-height: 560px) {
          .p3d-card { left: max(12px, env(safe-area-inset-left)); right: auto; margin: 0; width: min(46vw, 420px); top: 64px; bottom: 10px; max-height: none; }
          .p3d-top { padding-top: 8px; }
        }
      `}</style>

      {/* The scene */}
      <div className="absolute inset-0">
        <Suspense fallback={null}>
          <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2, ease: EASE }}>
            <ProcessScene step={step} reduced={reduced} framing="standalone" />
          </motion.div>
        </Suspense>
      </div>

      {/* Loading veil */}
      <AnimatePresence>
        {!ready && (
          <motion.div className="pointer-events-none absolute inset-0 grid place-items-center" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            <div className="flex flex-col items-center gap-3 text-[15px] font-semibold text-white/80" role="status">
              <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[#5ab4f0]" />
              Loading the 3D process…
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <div className="p3d-top pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-3 md:px-6" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <a href="/" className="glass glass-edge pointer-events-auto flex min-w-0 items-center gap-2.5 rounded-full p-1.5 pr-4" aria-label="Open the full Sonae site">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] font-jp text-[18px] font-extrabold text-white" style={{ background: 'linear-gradient(145deg, var(--water), var(--water-deep))' }} lang="ja">
            備
          </span>
          <span className="flex min-w-0 flex-col leading-none">
            <span className="whitespace-nowrap text-[15px] font-extrabold text-white">
              Sonae <span className="font-semibold text-white/60">Zitoun</span>
            </span>
            <span className="mt-1 truncate text-[11.5px] font-semibold text-white/60">From olive waste to water, fertiliser and fuel</span>
          </span>
        </a>
        <div className="pointer-events-auto shrink-0">
          <LangPicker size={44} tone="white" />
        </div>
      </div>

      {/* Step card */}
      <motion.section
        className="p3d-card glass glass-edge glass-strong absolute z-30 flex touch-pan-y flex-col rounded-[22px] px-3.5 py-3 text-ink md:rounded-[24px] md:p-5"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3, ease: EASE }}
        onPointerDown={onDown}
        onPointerUp={onUp}
        aria-live="polite"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ color: tone, background: `color-mix(in oklab, ${tone} 16%, transparent)` }}>
            {TRACK[s.track].label}
          </span>
          <span className="num text-[13px] font-semibold text-ink-2">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>

        <div className="mt-1.5 min-h-0 flex-1 overflow-y-auto overscroll-contain md:mt-2">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: EASE }}>
              <h1 className="text-[17px] leading-tight font-extrabold md:text-[22px]">{s.title}</h1>
              <p className={`mt-1.5 text-[14px] leading-relaxed text-ink-2 md:block md:text-[15px] ${more ? 'block' : 'hidden'}`}>{s.body}</p>
              <div className={more ? 'block' : 'hidden md:block'}>
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {s.facts.map((f) => (
                    <li key={f} className="flex gap-2 text-[13.5px]">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone }} />
                      {f}
                    </li>
                  ))}
                </ul>
                {s.note && (
                  <p className="mt-2.5 rounded-[14px] border px-3 py-2 text-[13px] text-ink-2" style={{ borderColor: 'color-mix(in oklab, var(--solar) 35%, transparent)', background: 'var(--solar-soft)' }}>
                    {s.note}
                  </p>
                )}
              </div>
              <button className="mt-1.5 text-[13px] font-semibold text-[var(--water)] md:hidden" onClick={() => setMore((m) => !m)}>
                {more ? 'Show less' : 'Read more'}
              </button>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress: one segment per step, tap to jump */}
        <div className="mt-2 flex gap-1 md:mt-3" role="tablist" aria-label="Steps">
          {STEPS.map((st, i) => {
            const t = TRACK[st.track].tone;
            return (
              <button key={i} role="tab" aria-selected={i === step} aria-label={`Step ${i + 1}: ${SHORT[i]}`} title={SHORT[i]} onClick={() => go(i)} className="relative h-6 flex-1">
                <span className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 overflow-hidden rounded-full" style={{ background: i < step ? t : 'color-mix(in oklab, var(--ink) 14%, transparent)' }}>
                  {i === step && (
                    <motion.span
                      key={`${step}-${playing}`}
                      className="absolute inset-y-0 left-0 w-full origin-left rounded-full"
                      style={{ background: t }}
                      initial={{ scaleX: playing ? 0 : 1 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: playing ? STEP_SECONDS : 0, ease: 'linear' }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="mt-2 flex items-center gap-2">
          <button className="btn btn-quiet h-11 w-11 shrink-0 !p-0" disabled={step === 0} onClick={() => go(step - 1)} aria-label="Previous step">
            <span className="rtl:rotate-180">
              <Chevron dir="left" />
            </span>
          </button>
          <button
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-bold text-white transition-transform duration-200 active:scale-[.97]"
            style={{ background: 'linear-gradient(135deg, var(--olive), color-mix(in oklab, var(--olive) 45%, #1d2a10))', boxShadow: '0 8px 24px -10px var(--olive)' }}
            onClick={toggle}
          >
            {playing ? <IconPause width={18} height={18} /> : <IconPlay width={18} height={18} />}
            {playing ? 'Pause' : step >= last ? 'Watch again' : 'Play'}
          </button>
          <button className="btn btn-quiet h-11 w-11 shrink-0 !p-0" disabled={step === last} onClick={() => go(step + 1)} aria-label="Next step">
            <span className="rtl:rotate-180">
              <Chevron dir="right" />
            </span>
          </button>
        </div>
        <p className="mt-2 hidden text-center text-[12px] text-ink-3 lg:block">Drag the scene to look around · arrow keys change step</p>
      </motion.section>
    </div>
  );
}
