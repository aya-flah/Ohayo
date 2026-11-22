import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SHORT, STEP_SECONDS, STEPS, TRACK, useProcess } from '../lib/process';
import { tap, useCompactScreen } from '../lib/device';
import { IconPause, IconPlay } from '../components/Icons';
import { EASE } from '../components/ui';

export default function ProcessPage() {
  const { step, setStep, playing, setPlaying } = useProcess();
  const s = STEPS[step]!;
  const tone = TRACK[s.track].tone;
  const last = STEPS.length - 1;
  // Phones: only the step title shows over the 3D; tap to read the explanation.
  const [info, setInfo] = useState(false);
  const compact = useCompactScreen();
  const show = !compact || info;

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setStep(step + 1), STEP_SECONDS * 1000);
    return () => clearTimeout(id);
  }, [playing, step, last, setStep, setPlaying]);

  useEffect(() => () => setPlaying(false), [setPlaying]);

  const go = (n: number) => {
    tap();
    setPlaying(false);
    setStep(n);
  };

  return (
    <div className="relative -mx-4 md:-mx-8" style={{ height: 'calc(100dvh - max(12px, env(safe-area-inset-top)) - 92px)' }}>
      {/* Step card */}
      <motion.div
        className="glass glass-edge pointer-events-auto absolute left-3 right-3 top-0 max-h-[52%] overflow-y-auto overscroll-contain rounded-[20px] px-4 py-3 md:left-8 md:right-auto md:w-[390px] md:rounded-[24px] md:p-5"
        initial={{ opacity: 0, x: -30, filter: 'blur(10px)' }}
        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <span className="dot" style={{ color: tone }} />
            How it works · step {step + 1} of {STEPS.length}
          </div>
          <span lang="ja" className="hidden font-jp text-[18px] text-ink-3 md:inline">工程</span>
          <button
            className={`-my-1 h-8 w-8 shrink-0 place-items-center rounded-full text-ink-2 ${compact ? 'grid' : 'hidden'}`}
            style={{ background: 'color-mix(in oklab, var(--ink) 8%, transparent)' }}
            onClick={() => {
              tap();
              setInfo((v) => !v);
            }}
            aria-expanded={info}
            aria-label={info ? 'Hide the explanation' : 'Read the explanation'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: info ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: EASE }}>
            <span className={`mt-3 rounded-full px-2.5 py-1 text-[12px] font-bold ${show ? 'inline-flex' : 'hidden'}`} style={{ color: tone, background: `color-mix(in oklab, ${tone} 15%, transparent)` }}>
              {TRACK[s.track].label}
            </span>
            <h1 className={`mt-1 leading-tight font-extrabold ${compact ? 'text-[16px]' : 'text-[17px] md:mt-2 md:text-[25px]'}`}>{s.title}</h1>
            <p className={`mt-1.5 text-[14px] leading-relaxed text-ink-2 md:text-[15px] ${show ? 'block' : 'hidden'}`}>{s.body}</p>
            <ul className={`mt-3 flex-col gap-1.5 ${show ? 'flex' : 'hidden'}`}>
              {s.facts.map((f) => (
                <li key={f} className="flex gap-2 text-[13.5px]">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone }} />
                  {f}
                </li>
              ))}
            </ul>
            {s.note && (
              <p className={`mt-3 rounded-[14px] border px-3 py-2 text-[13px] text-ink-2 ${show ? 'block' : 'hidden'}`} style={{ borderColor: 'color-mix(in oklab, var(--solar) 35%, transparent)', background: 'var(--solar-soft)' }}>
                {s.note}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
        <div className={`mt-4 gap-2 ${compact ? 'hidden' : 'hidden md:flex'}`}>
          <button className="btn btn-quiet btn-sm" disabled={step === 0} onClick={() => go(step - 1)}>
            Back
          </button>
          <button className="btn btn-primary btn-sm" disabled={step === last} onClick={() => go(step + 1)}>
            Next step
          </button>
        </div>
      </motion.div>

      {/* Step dock */}
      <motion.div
        className="glass glass-edge glass-strong pointer-events-auto absolute inset-x-3 bottom-[calc(max(12px,env(safe-area-inset-bottom))+var(--dock-h))] flex items-center gap-3 rounded-[26px] p-2.5 md:inset-x-auto lg:bottom-6 md:left-1/2 md:w-[min(860px,calc(100%-4rem))] md:-translate-x-1/2 md:p-3"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.4, ease: EASE }}
      >
        <button
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-white transition-transform duration-200 active:scale-90"
          style={{ background: 'linear-gradient(135deg, var(--olive), color-mix(in oklab, var(--olive) 45%, #1d2a10))', boxShadow: '0 8px 24px -8px var(--olive)' }}
          onClick={() => {
            tap();
            if (!playing && step >= last) setStep(0);
            setPlaying(!playing);
          }}
          aria-label={playing ? 'Pause the walkthrough' : 'Play the walkthrough'}
        >
          {playing ? <IconPause width={20} height={20} /> : <IconPlay width={20} height={20} />}
        </button>
        <ol className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto" aria-label="Steps">
          {STEPS.map((st, i) => {
            const active = i === step;
            const t = TRACK[st.track].tone;
            return (
              <li key={i} className="min-w-[64px] flex-1">
                <button
                  onClick={() => go(i)}
                  aria-current={active ? 'step' : undefined}
                  className="relative flex h-full w-full flex-col items-center gap-0.5 overflow-hidden rounded-[16px] border px-1.5 py-1.5 transition-colors duration-200"
                  style={{ borderColor: active ? t : 'var(--line)', background: active ? `color-mix(in oklab, ${t} 18%, transparent)` : 'var(--surface)' }}
                >
                  <span className="num text-[13px] font-extrabold" style={{ color: i <= step ? t : 'var(--ink-3)' }}>
                    {i + 1}
                  </span>
                  <span className={`text-[11.5px] font-semibold ${active ? 'text-ink' : 'text-ink-2'}`}>{SHORT[i]}</span>
                  {active && playing && (
                    <motion.span key={`p${step}`} className="absolute inset-x-0 bottom-0 h-[3px] origin-left" style={{ background: t }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: STEP_SECONDS, ease: 'linear' }} />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </motion.div>
    </div>
  );
}
