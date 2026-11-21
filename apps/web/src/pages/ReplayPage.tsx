import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion } from 'motion/react';
import { replaySeason, syntheticSeason, type ReplayRun, type SeasonKpis } from '@sonae/engine';
import { DEMO_GDA, demoPlots, localHour, toMs, type ForecastHour } from '@sonae/shared';
import { loadSummer2026 } from '../lib/weather';
import { fmt } from '../lib/format';
import { IconReplay } from '../components/Icons';

interface Row {
  key: keyof SeasonKpis;
  label: string;
  unit: string;
  digits?: number;
  better: 'lower' | 'higher';
}

const ROWS: Row[] = [
  { key: 'daysShort', label: 'Days a plot went short of water', unit: 'days', better: 'lower' },
  { key: 'deliveredPct', label: 'Water delivered, share of need', unit: '%', digits: 1, better: 'higher' },
  { key: 'plotStressDays', label: 'Plot-days under water stress', unit: 'plot-days', better: 'lower' },
  { key: 'dieselL', label: 'Diesel burned', unit: 'L', better: 'lower' },
  { key: 'kWhPeak', label: 'Grid energy at peak hours (13:00 to 17:00)', unit: 'kWh', better: 'lower' },
  { key: 'fairnessGapPct', label: 'Gap between best- and worst-served plot', unit: 'points', digits: 1, better: 'lower' },
  { key: 'yieldLossPct', label: 'Estimated yield lost to thirst', unit: '%', digits: 1, better: 'lower' },
];

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

function Rolling({ value, digits = 0 }: { value: number; digits?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !ref.current) {
      if (ref.current) ref.current.textContent = fmt(value, digits);
      return;
    }
    const controls = animate(from, value, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = fmt(v, digits);
      },
    });
    return () => controls.stop();
  }, [value, digits]);
  return <span ref={ref} className="num" />;
}

export default function ReplayPage() {
  const [hourly, setHourly] = useState<ForecastHour[] | null>(null);
  const [real, setReal] = useState(false);
  const [tank, setTank] = useState(DEMO_GDA.tank.capacityM3);
  const [solar, setSolar] = useState(DEMO_GDA.solar?.kWp ?? 0);
  const [seeds, setSeeds] = useState(20);
  const [runs, setRuns] = useState<ReplayRun[]>([]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const cancel = useRef(false);

  useEffect(() => {
    loadSummer2026().then((r) => {
      if (r && r.hourly.length > 24 * 30) {
        setHourly(r.hourly);
        setReal(true);
      } else {
        setHourly(syntheticSeason('2026-06-01T00:00:00+01:00', 122, 7));
      }
    });
  }, []);

  const run = useCallback(async () => {
    if (!hourly) return;
    cancel.current = false;
    setRunning(true);
    setProgress(0);
    const t0 = performance.now();
    const gda = { ...DEMO_GDA, tank: { ...DEMO_GDA.tank, capacityM3: tank, levelM3: Math.min(DEMO_GDA.tank.levelM3, tank) }, solar: solar > 0 ? { kWp: solar } : undefined };
    const plots = demoPlots(toMs('2026-07-20T12:00:00+01:00'));
    const out: ReplayRun[] = [];
    for (let s = 1; s <= seeds; s++) {
      if (cancel.current) break;
      out.push(replaySeason({ gda, plots, hourly, seed: s }));
      setProgress(s / seeds);
      await new Promise((r) => setTimeout(r, 0));
    }
    setRuns(out);
    setElapsed((performance.now() - t0) / 1000);
    setRunning(false);
  }, [hourly, tank, solar, seeds]);

  useEffect(() => {
    if (hourly && runs.length === 0 && !running) run();
  }, [hourly]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    cancel.current = true;
  }, []);

  const days = useMemo(() => {
    if (!hourly) return [];
    const map = new Map<number, number>();
    for (const h of hourly) {
      const ms = toMs(h.time);
      const day = ms - localHour(ms) * 3_600_000;
      map.set(Math.round(day / 86_400_000), Math.max(map.get(Math.round(day / 86_400_000)) ?? -99, h.tempC));
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([d, t]) => ({ day: d, tMax: t }));
  }, [hourly]);

  const example = runs[0];
  const cutDays = useMemo(() => new Set(example?.cuts.map((c) => Math.round((c.startMs - localHour(c.startMs) * 3_600_000) / 86_400_000)) ?? []), [example]);
  const summary = useMemo(() => {
    if (runs.length === 0) return null;
    const pick = (side: 'without' | 'with', k: keyof SeasonKpis) => runs.map((r) => r[side][k]);
    return Object.fromEntries(
      ROWS.map((r) => [r.key, { without: median(pick('without', r.key)), with: median(pick('with', r.key)), withMin: Math.min(...pick('with', r.key)), withMax: Math.max(...pick('with', r.key)), woMin: Math.min(...pick('without', r.key)), woMax: Math.max(...pick('without', r.key)) }]),
    ) as Record<string, { without: number; with: number; withMin: number; withMax: number; woMin: number; woMax: number }>;
  }, [runs]);

  const tMin = Math.min(...days.map((d) => d.tMax), 30);
  const tMaxAll = Math.max(...days.map((d) => d.tMax), 40);
  const hottest = days.length ? Math.round(tMaxAll) : null;
  const hot40 = days.filter((d) => d.tMax >= 40).length;

  return (
    <div>
      <div className="max-w-[720px]">
        <h1 className="font-display text-[30px] leading-tight font-extrabold md:text-[38px]">Summer 2026, replayed twice</h1>
        <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">
          Kairouan's {real ? 'real' : 'synthetic'} summer weather, run once without Sonae and once with it, under the same power cuts.
          {hottest !== null && ` The hottest day reached ${hottest} °C, and ${hot40} days passed 40 °C.`}
        </p>
      </div>

      {/* heat strip */}
      <section className="card mt-6 p-5">
        <div className="flex items-end gap-[2px]" style={{ height: 96 }} role="img" aria-label={`Daily highs from June to September 2026; red marks show modelled cuts in one example season`}>
          {days.map((d) => {
            const h = 14 + ((d.tMax - tMin) / Math.max(1, tMaxAll - tMin)) * 82;
            const cut = cutDays.has(d.day);
            return <span key={d.day} className="flex-1 rounded-t-[2px]" style={{ height: `${h}%`, background: cut ? 'var(--cut)' : d.tMax >= 40 ? 'var(--solar)' : 'color-mix(in oklch, var(--solar) 35%, transparent)' }} title={`${fmt(d.tMax, 1)} °C${cut ? ', modelled cut' : ''}`} />;
          })}
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-ink-2">
          <span>June</span>
          <span>July</span>
          <span>August</span>
          <span>September</span>
        </div>
        <p className="mt-3 text-[12.5px] text-ink-3">
          Daily highs{real ? ' from the Open-Meteo archive (ERA5)' : ' (synthetic: run npm run weather:fetch for the real data)'}. Red days had a modelled cut in one example season. STEG publishes no outage log, so cuts are modelled from heat: the hotter the afternoon, the likelier the cut.
        </p>
      </section>

      <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_300px]">
        <section className="card overflow-hidden">
          <div className="grid grid-cols-[1fr_7.5rem_7.5rem] items-end gap-3 border-b border-line px-5 py-4 text-[13px]">
            <span className="text-ink-2">Median of {runs.length || seeds} simulated seasons</span>
            <span className="text-right font-display text-[16px] font-extrabold text-ink-2">Without</span>
            <span className="text-right font-display text-[16px] font-extrabold text-accent-strong">With Sonae</span>
          </div>
          <ul>
            {ROWS.map((r) => {
              const v = summary?.[r.key];
              const improved = v ? (r.better === 'lower' ? v.with < v.without : v.with > v.without) : false;
              return (
                <li key={r.key} className="grid grid-cols-[1fr_7.5rem_7.5rem] items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
                  <span className="text-[14px] leading-snug">
                    {r.label}
                    {v && <span className="block text-[12px] text-ink-3 num">range with Sonae {fmt(v.withMin, r.digits ?? 0)} to {fmt(v.withMax, r.digits ?? 0)}</span>}
                  </span>
                  <span className="text-right font-display text-[22px] font-extrabold text-ink-2">
                    {v ? <Rolling value={v.without} digits={r.digits} /> : '…'}
                    <span className="ml-1 text-[12px] font-normal">{r.unit === '%' ? '%' : ''}</span>
                  </span>
                  <span className="text-right font-display text-[22px] font-extrabold" style={{ color: improved ? 'var(--ok)' : 'var(--ink)' }}>
                    {v ? <Rolling value={v.with} digits={r.digits} /> : '…'}
                    <span className="ml-1 text-[12px] font-normal">{r.unit === '%' ? '%' : ''}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="card h-fit p-5">
          <h2 className="font-display text-[19px] font-extrabold">Change an assumption</h2>
          <p className="mt-1 text-[13px] text-ink-2">A judge can change one number and rerun the whole summer, live.</p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="label" htmlFor="r-tank">Tank capacity (m³)</label>
              <input id="r-tank" type="number" min={20} className="field num" value={tank} onChange={(e) => setTank(Math.max(20, Number(e.target.value)))} />
            </div>
            <div>
              <label className="label" htmlFor="r-solar">Solar panels (kWp)</label>
              <input id="r-solar" type="number" min={0} className="field num" value={solar} onChange={(e) => setSolar(Math.max(0, Number(e.target.value)))} />
            </div>
            <div>
              <label className="label" htmlFor="r-seeds">Seasons to simulate</label>
              <select id="r-seeds" className="field" value={seeds} onChange={(e) => setSeeds(Number(e.target.value))}>
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn btn-primary mt-4 w-full justify-center" disabled={running || !hourly} onClick={run}>
            <IconReplay width={18} height={18} />
            {running ? `Replaying… ${Math.round(progress * 100)}%` : 'Replay the summer'}
          </button>
          {running && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <motion.div className="h-full origin-left bg-accent" style={{ transform: `scaleX(${progress})` }} />
            </div>
          )}
          {!running && runs.length > 0 && <p className="mt-3 text-[12.5px] text-ink-3 num">{runs.length} seasons in {fmt(elapsed, 1)} s, on this device.</p>}
          <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">Only these numbers go in the pitch. Village: 3 ha, 12 plots, a 40 m³/h pump, cuts announced the day before 60% of the time.</p>
        </aside>
      </div>
    </div>
  );
}
