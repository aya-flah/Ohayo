import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useZPlan, planDayLabel, shortDate } from '../lib/zitoun';
import { useRegionState, useScene } from '../lib/scene';
import { tap } from '../lib/device';
import { fmt } from '../lib/format';
import { IconDrop, IconLeaf, IconPause, IconPlay, IconSun, IconGauge } from '../components/Icons';
import { EASE } from '../components/ui';

const PLAY_SECONDS = 20;

function Instrument({ label, value, tone, icon, fill }: { label: string; value: string; tone: string; icon: ReactNode; fill?: number }) {
  return (
    <div className="relative min-w-[132px] overflow-hidden rounded-[16px] border border-line bg-surface px-3.5 py-2.5">
      {fill !== undefined && <motion.span className="absolute inset-x-0 bottom-0 opacity-25" style={{ background: tone }} animate={{ height: `${Math.min(1, fill) * 100}%` }} transition={{ duration: 0.5, ease: EASE }} />}
      <div className="relative flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
        <span style={{ color: tone }}>{icon}</span>
        {label}
      </div>
      <div className="num relative mt-0.5 text-[19px] font-extrabold" style={{ color: tone === 'var(--ink-2)' ? 'var(--ink)' : tone }}>
        {value}
      </div>
    </div>
  );
}

const LEGEND = [
  { c: 'var(--margine)', t: 'Margine: ponds and tankers' },
  { c: 'var(--olive)', t: 'Olive groves that may receive it' },
  { c: 'var(--cut)', t: 'Never: near a well, the wadi, or steep' },
  { c: 'var(--water)', t: 'Wadi, rain and the drinking well' },
  { c: 'var(--solar)', t: 'Grignon going to fuel buyers' },
];

export default function TwinPage() {
  const { input, plan } = useZPlan();
  const state = useRegionState();
  const cursor = useScene((s) => s.cursor);
  const setCursor = useScene((s) => s.setCursor);
  const forceRain = useScene((s) => s.forceRain);
  const setForceRain = useScene((s) => s.setForceRain);
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number | null>(null);
  const N = plan.days.length;
  const [log, setLog] = useState<Array<{ id: number; text: string; tone: string }>>([]);
  const ids = useRef(0);
  const prev = useRef(state);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      const c = useScene.getState().cursor;
      const next = c + (dt * N) / PLAY_SECONDS;
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

  // A short event log, like a dispatcher's radio.
  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    const at = `${planDayLabel(state.day, state.date)} ${String(Math.floor(state.hour)).padStart(2, '0')}:00`;
    const ev: Array<{ text: string; tone: string }> = [];
    for (const t of state.trucks) {
      if (t.kind === 'margine' && t.unloading && !p.trucks.some((x) => x.key === t.key && x.unloading)) {
        const g = input.groves.find((x) => x.id === t.toId);
        ev.push({ text: `${at} ${fmt(t.m3)} m³ spread on ${g?.owner ?? 'a grove'}'s olives`, tone: 'var(--margine)' });
      }
      if (t.kind === 'grignon' && t.unloading && !p.trucks.some((x) => x.key === t.key && x.unloading)) {
        const b = input.buyers.find((x) => x.id === t.toId);
        ev.push({ text: `${at} ${fmt(t.m3)} t of grignon to ${b?.name ?? 'a buyer'}`, tone: 'var(--solar)' });
      }
    }
    if (state.rain > 0 && p.rain === 0) ev.push({ text: `${at} Rain: tankers stay at the mills`, tone: 'var(--water)' });
    if (ev.length) setLog((l) => [...ev.map((e) => ({ ...e, id: ids.current++ })), ...l].slice(0, 6));
  }, [state, input]);

  const onRoad = state.trucks.filter((t) => t.kind === 'margine').length;
  const instruments = (
    <>
      <Instrument label="Rain today" value={`${fmt(state.rainMm, state.rainMm % 1 ? 1 : 0)} mm`} tone={state.rain > 0 ? 'var(--water)' : 'var(--ink-2)'} icon={<IconDrop width={15} height={15} />} />
      <Instrument label="Spreading" value={state.blocked ? 'Paused' : 'Allowed'} tone={state.blocked ? 'var(--water)' : 'var(--ok)'} icon={<IconLeaf width={15} height={15} />} />
      {input.mills.map((m) => {
        const p = state.ponds.find((x) => x.id === m.id)!;
        return <Instrument key={m.id} label={`Pond ${m.name.replace('Maâsra ', '')}`} value={`${fmt(p.share * 100)}%`} tone={p.share >= 0.9 ? 'var(--cut)' : 'var(--margine)'} icon={<IconGauge width={15} height={15} />} fill={p.share} />;
      })}
      <Instrument label="Tankers on the road" value={`${onRoad}`} tone="var(--margine)" icon={<IconGauge width={15} height={15} />} />
      <Instrument label="Spread this week" value={`${fmt(state.spreadSoFarM3)} m³`} tone="var(--olive)" icon={<IconLeaf width={15} height={15} />} />
      <Instrument label="Grignon buyers served" value={`${state.buyersServed.length}`} tone="var(--solar)" icon={<IconSun width={15} height={15} />} />
    </>
  );

  return (
    <div className="relative -mx-4 md:-mx-8" style={{ height: 'calc(100dvh - max(12px, env(safe-area-inset-top)) - 92px)' }}>
      <motion.div
        className="glass glass-edge pointer-events-auto absolute left-3 right-3 top-0 rounded-[26px] p-4 md:left-8 md:right-auto md:w-[400px] md:p-5"
        initial={{ opacity: 0, x: -30, filter: 'blur(10px)' }}
        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, delay: 0.25, ease: EASE }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <span className="dot dot-pulse" style={{ color: state.blocked ? 'var(--water)' : 'var(--ok)' }} />
            Digital twin · Sfax olive belt
          </div>
          <span lang="ja" className="font-jp text-[20px] text-ink-3">双子</span>
        </div>
        <h1 className="mt-2 text-[26px] leading-tight font-extrabold md:text-[30px]">
          Every tanker, pond and grove, <span className="text-gradient-water">in 3D</span>
        </h1>
        <p className="mt-1.5 hidden text-[15px] text-ink-2 md:block">Drag to orbit. Play the week, or make it rain and watch the tankers stop.</p>
        <ul className="mt-3 hidden flex-col gap-1.5 md:flex">
          {LEGEND.map((l) => (
            <li key={l.t} className="flex items-center gap-2 text-[13.5px] text-ink-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.c, boxShadow: `0 0 8px ${l.c}` }} />
              {l.t}
            </li>
          ))}
        </ul>
        <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 md:hidden">{instruments}</div>
      </motion.div>

      <motion.aside
        className="pointer-events-auto absolute right-8 top-0 hidden w-[300px] flex-col gap-2 lg:flex"
        initial={{ opacity: 0, x: 30, filter: 'blur(10px)' }}
        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, delay: 0.35, ease: EASE }}
      >
        <div className="glass glass-edge grid grid-cols-2 gap-2 rounded-[24px] p-3">{instruments}</div>
        <div className="glass glass-edge rounded-[24px] p-4">
          <div className="text-[14px] font-bold">Dispatch log</div>
          <ul className="mt-2 flex flex-col gap-1.5" aria-live="polite">
            {log.length === 0 && <li className="text-[13.5px] text-ink-3">Press play to watch the tankers work.</li>}
            {log.map((e) => (
              <motion.li key={e.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className="flex gap-2 text-[13px] text-ink-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: e.tone }} />
                {e.text}
              </motion.li>
            ))}
          </ul>
        </div>
      </motion.aside>

      <motion.div
        className="glass glass-edge glass-strong pointer-events-auto absolute inset-x-3 flex flex-wrap items-center gap-3 rounded-[28px] p-3 md:left-1/2 md:right-auto md:w-[min(760px,calc(100%-4rem))] md:-translate-x-1/2 md:flex-nowrap md:p-3.5"
        style={{ bottom: 'calc(max(12px, env(safe-area-inset-bottom)) + 92px)' }}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.45, ease: EASE }}
      >
        <button
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-white transition-transform duration-200 active:scale-90"
          style={{ background: 'linear-gradient(135deg, var(--olive), color-mix(in oklab, var(--olive) 45%, #1d2a10))' }}
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
            <span className="font-bold">
              {planDayLabel(state.day, state.date)} · {shortDate(state.date)}
            </span>
            <span className="num text-ink-2">{String(Math.floor(state.hour)).padStart(2, '0')}:{String(Math.floor((state.hour % 1) * 60)).padStart(2, '0')}</span>
          </div>
          <input
            type="range"
            className="range mt-1.5 w-full"
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
        </div>
        <button
          className={`btn ${forceRain ? 'btn-primary' : 'btn-quiet'} w-full md:w-auto`}
          onClick={() => {
            tap('medium');
            setForceRain(!forceRain);
          }}
          aria-pressed={forceRain}
        >
          <IconDrop width={17} height={17} /> {forceRain ? 'Stop the rain' : 'Make it rain'}
        </button>
      </motion.div>
    </div>
  );
}
