import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useZPlan, planDayLabel, shortDate } from '../lib/zitoun';
import { useRegionState, useScene } from '../lib/scene';
import { tap, useCompactScreen } from '../lib/device';
import { fmt } from '../lib/format';
import { IconDrop, IconLeaf, IconPause, IconPlay, IconSun, IconGauge } from '../components/Icons';
import { EASE, Range } from '../components/ui';

const PLAY_SECONDS = 24;

function Instrument({ label, value, tone, icon, fill }: { label: string; value: string; tone: string; icon: ReactNode; fill?: number }) {
  return (
    <div className="relative min-w-[124px] overflow-hidden rounded-[14px] border border-line bg-surface px-3 py-2">
      {fill !== undefined && <motion.span className="absolute inset-x-0 bottom-0 opacity-25" style={{ background: tone }} animate={{ height: `${Math.min(1, fill) * 100}%` }} transition={{ duration: 0.5, ease: EASE }} />}
      <div className="relative flex items-center gap-1.5 truncate text-[12px] font-semibold text-ink-2">
        <span className="shrink-0" style={{ color: tone }}>
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className="num relative mt-0.5 text-[17px] font-extrabold" style={{ color: tone === 'var(--ink-2)' ? 'var(--ink)' : tone }}>
        {value}
      </div>
    </div>
  );
}

const LEGEND = [
  { c: 'var(--margine)', t: 'Margine' },
  { c: 'var(--olive)', t: 'Allowed grove' },
  { c: 'var(--cut)', t: 'Never' },
  { c: 'var(--water)', t: 'Wadi & well' },
  { c: 'var(--solar)', t: 'Grignon' },
];

export default function TwinPage() {
  const { input, plan } = useZPlan();
  const state = useRegionState();
  const cursor = useScene((s) => s.cursor);
  const setCursor = useScene((s) => s.setCursor);
  const forceRain = useScene((s) => s.forceRain);
  const setForceRain = useScene((s) => s.setForceRain);
  const [playing, setPlaying] = useState(false);
  // Phones: the title card stays one line so the 3D stays visible; tap to see the live numbers.
  const [info, setInfo] = useState(false);
  const compact = useCompactScreen();
  const show = !compact || info;
  const raf = useRef<number | null>(null);
  const N = plan.days.length;
  const [log, setLog] = useState<Array<{ id: number; text: string; tone: string }>>([]);
  const ids = useRef(0);
  const prev = useRef(state);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const next = useScene.getState().cursor + (dt * N) / PLAY_SECONDS;
      if (next >= N) {
        setPlaying(false);
        setCursor(N - 0.001);
        return;
      }
      setCursor(next);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, N, setCursor]);

  // A dispatcher's log: one line per grove or buyer served, newest first.
  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    const at = `${planDayLabel(state.day, state.date)} ${String(Math.floor(state.hour)).padStart(2, '0')}:00`;
    const spread = new Map<string, number>();
    const fuel = new Map<string, number>();
    for (const t of state.trucks) {
      const fresh = t.unloading && !p.trucks.some((x) => x.key === t.key && x.unloading);
      if (!fresh) continue;
      const m = t.kind === 'margine' ? spread : fuel;
      m.set(t.toId, (m.get(t.toId) ?? 0) + t.m3);
    }
    const ev: Array<{ text: string; tone: string }> = [];
    for (const [id, m3] of spread) ev.push({ text: `${at} · ${fmt(m3)} m³ on ${input.groves.find((g) => g.id === id)?.owner ?? 'a grove'}'s olives`, tone: 'var(--margine)' });
    for (const [id, t] of fuel) ev.push({ text: `${at} · ${fmt(t)} t of grignon to ${input.buyers.find((b) => b.id === id)?.name ?? 'a buyer'}`, tone: 'var(--solar)' });
    if (state.rain > 0 && p.rain === 0) ev.push({ text: `${at} · Rain: tankers stay at the mills`, tone: 'var(--water)' });
    if (ev.length) setLog((l) => [...ev.map((e) => ({ ...e, id: ids.current++ })), ...l].slice(0, 5));
  }, [state, input]);

  const onRoad = state.trucks.filter((t) => t.kind === 'margine').length;
  const instruments = (
    <>
      <Instrument label="Rain today" value={`${fmt(state.rainMm, state.rainMm % 1 ? 1 : 0)} mm`} tone={state.rain > 0 ? 'var(--water)' : 'var(--ink-2)'} icon={<IconDrop width={14} height={14} />} />
      <Instrument label="Spreading" value={state.blocked ? 'Paused' : 'Allowed'} tone={state.blocked ? 'var(--water)' : 'var(--ok)'} icon={<IconLeaf width={14} height={14} />} />
      {input.mills.map((m) => {
        const p = state.ponds.find((x) => x.id === m.id)!;
        return <Instrument key={m.id} label={`${m.name.replace('Maâsra ', '')} pond`} value={`${fmt(p.share * 100)}%`} tone={p.share >= 0.9 ? 'var(--cut)' : 'var(--margine)'} icon={<IconGauge width={14} height={14} />} fill={p.share} />;
      })}
      <Instrument label="Tankers out" value={`${onRoad}`} tone="var(--margine)" icon={<IconGauge width={14} height={14} />} />
      <Instrument label="Spread so far" value={`${fmt(state.spreadSoFarM3)} m³`} tone="var(--olive)" icon={<IconLeaf width={14} height={14} />} />
      <Instrument label="Buyers served" value={`${state.buyersServed.length}`} tone="var(--solar)" icon={<IconSun width={14} height={14} />} />
    </>
  );

  return (
    <div className="relative -mx-4 md:-mx-8" style={{ height: 'calc(100dvh - max(12px, env(safe-area-inset-top)) - 92px)' }}>
      {/* Title */}
      <motion.div
        className="glass glass-edge pointer-events-auto absolute left-3 right-3 top-0 rounded-[20px] px-4 py-2.5 md:left-8 md:right-auto md:w-[360px] md:rounded-[24px] md:p-4"
        initial={{ opacity: 0, x: -30, filter: 'blur(10px)' }}
        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
      >
        <div className={`items-center justify-between gap-3 ${show ? 'flex' : 'hidden'}`}>
          <div className="eyebrow flex items-center gap-2">
            <span className="dot dot-pulse" style={{ color: state.blocked ? 'var(--water)' : 'var(--ok)' }} />
            Digital twin · Sfax olive belt
          </div>
          <span lang="ja" className="hidden font-jp text-[18px] text-ink-3 md:inline">双子</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <h1 className={`leading-tight font-extrabold ${compact ? 'text-[16px]' : 'text-[17px] md:mt-1.5 md:text-[26px]'}`}>
            <span className={`dot dot-pulse me-2 align-middle ${show ? "hidden" : "inline-block"}`} style={{ color: state.blocked ? 'var(--water)' : 'var(--ok)' }} />
            The olive region, <span className="text-gradient-water">live in 3D</span>
          </h1>
          <button
            className={`h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 ${compact ? 'grid' : 'hidden'}`}
            style={{ background: 'color-mix(in oklab, var(--ink) 8%, transparent)' }}
            onClick={() => {
              tap();
              setInfo((v) => !v);
            }}
            aria-expanded={info}
            aria-label={info ? 'Hide the live numbers' : 'Show the live numbers'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: info ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
        <p className="mt-1 hidden text-[14px] text-ink-2 md:block">Drag to orbit. Play the week, or make it rain and watch the tankers stop.</p>
        <ul className="mt-2.5 hidden flex-wrap gap-x-3 gap-y-1 md:flex">
          {LEGEND.map((l) => (
            <li key={l.t} className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
              <span className="h-2 w-2 rounded-full" style={{ background: l.c, boxShadow: `0 0 6px ${l.c}` }} />
              {l.t}
            </li>
          ))}
        </ul>
        <div className={`no-scrollbar -mx-1 mt-2.5 gap-2 overflow-x-auto px-1 md:mt-3 lg:hidden ${show ? 'flex' : 'hidden'}`}>{instruments}</div>
      </motion.div>

      {/* Right rail (large screens): instruments, then the log, never taller than the space above the dock */}
      <motion.aside
        className="pointer-events-auto absolute bottom-6 right-8 top-0 hidden w-[300px] flex-col gap-2 lg:flex"
        initial={{ opacity: 0, x: 30, filter: 'blur(10px)' }}
        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, delay: 0.3, ease: EASE }}
      >
        <div className="glass glass-edge grid shrink-0 grid-cols-2 gap-2 rounded-[22px] p-2.5">{instruments}</div>
        <div className="glass glass-edge flex min-h-0 flex-col rounded-[22px] p-4">
          <div className="text-[14px] font-bold">Dispatch log</div>
          <ul className="no-scrollbar mt-2 flex min-h-0 flex-col gap-1.5 overflow-y-auto" aria-live="polite">
            {log.length === 0 && <li className="text-[13px] text-ink-3">Press play to watch the tankers work.</li>}
            <AnimatePresence initial={false}>
              {log.map((e) => (
                <motion.li key={e.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex gap-2 text-[12.5px] leading-snug text-ink-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: e.tone }} />
                  {e.text}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </motion.aside>

      {/* Control dock: left of the rail on large screens, above the tab bar on phones */}
      <motion.div
        className="glass glass-edge glass-strong pointer-events-auto absolute inset-x-3 bottom-[calc(max(12px,env(safe-area-inset-bottom))+var(--dock-h))] flex items-center gap-2.5 rounded-[24px] p-2.5 md:inset-x-8 md:gap-3 md:p-3 lg:bottom-6 md:flex-nowrap lg:right-[348px]"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.4, ease: EASE }}
      >
        <button
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-white transition-transform duration-200 active:scale-90"
          style={{ background: 'linear-gradient(135deg, var(--olive), color-mix(in oklab, var(--olive) 45%, #1d2a10))', boxShadow: '0 8px 24px -8px var(--olive)' }}
          onClick={() => {
            tap();
            if (!playing && cursor >= N - 0.01) setCursor(0);
            setPlaying((p) => !p);
          }}
          aria-label={playing ? 'Pause' : 'Play the week'}
        >
          {playing ? <IconPause width={20} height={20} /> : <IconPlay width={20} height={20} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
            <span className="truncate font-bold">
              {planDayLabel(state.day, state.date)} · {shortDate(state.date)}
            </span>
            <span className="num shrink-0 text-ink-2">
              {String(Math.floor(state.hour)).padStart(2, '0')}:{String(Math.floor((state.hour % 1) * 60)).padStart(2, '0')}
            </span>
          </div>
          <Range
            tone="olive"
            className="mt-0.5 w-full"
            min={0}
            max={N - 0.001}
            step={0.005}
            value={cursor}
            aria-label="Moment of the week"
            onChange={(e) => {
              setPlaying(false);
              setCursor(Number(e.target.value));
            }}
          />
          <div className="flex justify-between text-[11px] text-ink-3" aria-hidden>
            {plan.days.map((d) => (
              <span key={d.day} className={d.blocked ? 'text-[var(--water)]' : ''}>
                {planDayLabel(d.day, d.date).slice(0, 3)}
              </span>
            ))}
          </div>
        </div>
        <button
          className={`btn ${forceRain ? 'btn-primary' : 'btn-quiet'} h-12 w-12 shrink-0 !p-0 md:h-auto md:w-auto md:!px-4 md:!py-2.5`}
          title={forceRain ? 'Stop the rain' : 'Make it rain'}
          onClick={() => {
            tap('medium');
            setForceRain(!forceRain);
          }}
          aria-pressed={forceRain}
        >
          <IconDrop width={17} height={17} /> <span className="sr-only md:not-sr-only">{forceRain ? 'Stop the rain' : 'Make it rain'}</span>
        </button>
      </motion.div>
    </div>
  );
}
