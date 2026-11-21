import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { usePlan } from '../lib/store';
import { twinAt, twinFromTelemetry, useLiveTelemetry, type TwinState } from '../lib/twin';
import { usePrefersReducedMotion, tap } from '../lib/device';
import { clock, dayLabel, fmt } from '../lib/format';
import { TwinScene } from './twin/Scene';
import { IconCut, IconPause, IconPlay } from '../components/Icons';

const PLAY_SECONDS = 24;

function Instrument({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'ok' | 'cut' | 'sun' | 'water' }) {
  const color = { default: 'var(--ink)', ok: 'var(--ok)', cut: 'var(--cut)', sun: 'var(--solar)', water: 'var(--water)' }[tone];
  return (
    <div className="rounded-[12px] border border-line bg-surface px-3.5 py-3">
      <div className="text-[12.5px] text-ink-2">{label}</div>
      <motion.div key={value} initial={{ opacity: 0.4 }} animate={{ opacity: 1, transition: { duration: 0.2 } }} className="mt-0.5 font-display text-[20px] font-extrabold num" style={{ color }}>
        {value}
      </motion.div>
    </div>
  );
}

export default function TwinPage() {
  const { input, plan } = usePlan();
  const reduced = usePrefersReducedMotion();
  const [source, setSource] = useState<'sim' | 'live'>('sim');
  const [cursor, setCursor] = useState(20);
  const [playing, setPlaying] = useState(false);
  const [forceCut, setForceCut] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const live = useLiveTelemetry(source === 'live');
  const H = plan.pump.length;
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setCursor((c) => {
        const next = c + (dt * H) / PLAY_SECONDS;
        if (next >= H) {
          setPlaying(false);
          return H - 0.01;
        }
        return next;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, H]);

  const simState = useMemo(() => twinAt(plan, input, cursor, forceCut), [plan, input, cursor, forceCut]);
  const state: TwinState = source === 'live' && live.last ? twinFromTelemetry(live.last, input.gda.tank.capacityM3) : simState;

  // A short event log, written when the node's state changes.
  const prev = useRef<TwinState | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    if (!p) return;
    const at = clock(state.timeIso);
    const events: string[] = [];
    if (p.gridOn && !state.gridOn) events.push(`${at} STEG cut: grid off`);
    if (!p.gridOn && state.gridOn) events.push(`${at} Grid back`);
    if (!p.valveOpen && state.valveOpen) events.push(`${at} Valve open${state.farmer ? ` for ${state.farmer}` : ''}: gravity flow`);
    if (p.valveOpen && !state.valveOpen) events.push(`${at} Valve closed`);
    if (!p.pumpOn && state.pumpOn) events.push(`${at} Pump on (${state.source === 'solar' ? 'sun' : state.source})`);
    if (p.pumpOn && !state.pumpOn) events.push(`${at} Pump off`);
    if (events.length) setLog((l) => [...events.reverse(), ...l].slice(0, 7));
  }, [state]);

  const liveNote = {
    off: '',
    connecting: 'Connecting to the MQTT broker…',
    waiting: 'Connected. Waiting for the node: start the Wokwi simulation or power the ESP32.',
    live: 'Live data from the node.',
    error: `MQTT error: ${live.error ?? 'unknown'}`,
    'not-configured': 'Set VITE_MQTT_WS_URL in apps/web/.env.local to receive live data.',
  }[live.status];

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-[640px]">
          <h1 className="font-display text-[30px] leading-tight font-extrabold md:text-[38px]">The farm, live in 3D</h1>
          <p className="mt-2 text-[15.5px] text-ink-2">The same signals the Sonae Node sends: tank level, pump, valve, solar power and the STEG line.</p>
        </div>
        <div className="inline-flex rounded-[11px] border border-line bg-surface p-1" role="radiogroup" aria-label="Data source">
          {(['sim', 'live'] as const).map((s) => (
            <button key={s} role="radio" aria-checked={source === s} onClick={() => setSource(s)} className={`rounded-[8px] px-3 py-1.5 text-[13.5px] transition-colors duration-150 ${source === s ? 'bg-accent-strong text-on-accent' : 'text-ink-2 hover:text-ink'}`}>
              {s === 'sim' ? 'From the plan' : 'Live from the node'}
            </button>
          ))}
        </div>
      </div>
      {source === 'live' && <p className="mt-2 text-[13px] text-ink-2">{liveNote}</p>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_300px]">
        <div>
          <div className="card h-[360px] overflow-hidden md:h-[520px]">
            <TwinScene state={state} reduced={reduced} />
          </div>
          {source === 'sim' && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="btn btn-primary" onClick={() => { tap(); setPlaying((p) => !p); }} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <IconPause width={16} height={16} /> : <IconPlay width={16} height={16} />}
                {playing ? 'Pause' : 'Play'}
              </button>
              <label className="flex min-w-[220px] flex-1 items-center gap-3 text-[13px] text-ink-2">
                <span className="sr-only">Time</span>
                <input type="range" min={0} max={H - 0.01} step={0.05} value={cursor} onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }} className="w-full accent-[var(--accent-strong)]" />
                <span className="w-32 shrink-0 text-ink num">
                  {dayLabel(state.timeIso, input.now)} {clock(state.timeIso)}
                </span>
              </label>
              <button
                className={`btn ${forceCut ? 'bg-danger text-white' : 'btn-quiet'}`}
                onClick={() => {
                  tap('heavy');
                  setForceCut((f) => !f);
                }}
                aria-pressed={forceCut}
              >
                <IconCut width={16} height={16} />
                {forceCut ? 'Bring the grid back' : 'Cut the power now'}
              </button>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Instrument label="Tank" value={`${fmt(state.levelShare * 100)}%`} tone="water" />
            <Instrument label="Grid" value={state.gridOn ? 'On' : 'Cut'} tone={state.gridOn ? 'ok' : 'cut'} />
            <Instrument label="Pump" value={state.pumpOn ? (state.source === 'solar' ? 'Sun' : state.source === 'diesel' ? 'Diesel' : 'Grid') : 'Off'} tone={state.pumpOn ? (state.source === 'solar' ? 'sun' : 'water') : 'default'} />
            <Instrument label="Valve" value={state.valveOpen ? 'Open' : 'Closed'} tone={state.valveOpen ? 'ok' : 'default'} />
            <Instrument label="Gravity flow" value={`${fmt(state.flowM3h)} m³/h`} />
            <Instrument label="Solar" value={`${fmt(state.solarKW, 1)} kW`} tone={state.solarKW > 1 ? 'sun' : 'default'} />
          </div>
          <section className="card p-4">
            <h2 className="font-display text-[17px] font-extrabold">Node events</h2>
            {log.length === 0 ? (
              <p className="mt-2 text-[13px] text-ink-2">Press play or cut the power to see what the node does.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-[13px] num">
                {log.map((e, i) => (
                  <motion.li key={`${e}-${i}`} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0, transition: { duration: 0.2 } }}>
                    {e}
                  </motion.li>
                ))}
              </ul>
            )}
          </section>
          <p className="text-[12.5px] text-ink-3">Mode: {state.mode}. Drag to orbit the farm; scroll to zoom.</p>
        </aside>
      </div>
    </div>
  );
}
