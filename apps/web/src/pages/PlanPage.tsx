import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { localHour, toMs, HOUR, type Turn } from '@sonae/shared';
import { usePlan, useSonae } from '../lib/store';
import { fetchKairouanForecast } from '../lib/weather';
import { useOnline, tap } from '../lib/device';
import { clock, dayLabel, fmt, weekday } from '../lib/format';
import { TankTimeline, levelAtCursor } from '../components/TankTimeline';
import { TankGauge } from '../components/TankGauge';
import { TurnsList } from '../components/TurnsList';
import { PhoneSms } from '../components/PhoneSms';
import { OutageDialog } from '../components/OutageDialog';
import { IconPause, IconPlay, IconPlus } from '../components/Icons';

const PLAY_SECONDS = 9.6;

export default function PlanPage() {
  const { input, plan } = usePlan();
  const { scenario, setScenario, setLiveForecast, liveFetchedAt, liveForecast, addOutage, extraOutages, removeOutage } = useSonae();
  const online = useOnline();
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [smsTurn, setSmsTurn] = useState<Turn | null>(null);
  const [cutOpen, setCutOpen] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const raf = useRef<number | null>(null);
  const H = plan.pump.length;

  // Playback: the whole 48 hours in under ten seconds, started by the user.
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
          return H;
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

  useEffect(() => setCursor(0), [plan.id, scenario]);

  useEffect(() => {
    if (scenario !== 'live' || liveForecast || !online) return;
    const ctl = new AbortController();
    fetchKairouanForecast(ctl.signal)
      .then((f) => {
        setLiveForecast(f);
        setLiveError(null);
      })
      .catch((e) => {
        if (!ctl.signal.aborted) setLiveError(e instanceof Error ? e.message : 'Forecast unavailable');
      });
    return () => ctl.abort();
  }, [scenario, liveForecast, online, setLiveForecast]);

  const slot = plan.pump[Math.min(H - 1, Math.floor(cursor))]!;
  const cursorMs = toMs(plan.pump[0]!.time) + cursor * HOUR;
  const level = levelAtCursor(plan, cursor);
  const gridOn = !input.outages.some((o) => toMs(o.start) <= cursorMs && toMs(o.end) > cursorMs);

  const summary = useMemo(() => {
    const nowMs = toMs(input.now);
    const tomorrow0 = nowMs - localHour(nowMs) * HOUR + 24 * HOUR;
    const tomorrowTemps = input.forecast.filter((f) => toMs(f.time) >= tomorrow0 && toMs(f.time) < tomorrow0 + 24 * HOUR).map((f) => f.tempC);
    const tMax = tomorrowTemps.length ? Math.round(Math.max(...tomorrowTemps)) : null;
    const end = nowMs + H * HOUR;
    const cut = [...input.outages].filter((o) => toMs(o.end) > nowMs && toMs(o.start) < end).sort((a, b) => toMs(a.start) - toMs(b.start))[0];
    const heat = tMax !== null ? `${tMax} °C tomorrow` : 'Tomorrow';
    if (!cut) {
      return `${heat}, no STEG cut announced. Sonae pumps on the cheapest energy and keeps a reserve for surprise cuts.`;
    }
    const atCut = plan.tank.find((t) => toMs(t.time) >= toMs(cut.start));
    const pct = atCut ? Math.round((atCut.levelM3 / input.gda.tank.capacityM3) * 100) : null;
    const diesel = plan.kpis.dieselL > 0 ? `${fmt(plan.kpis.dieselL, 1)} L of diesel as a last resort` : 'no diesel burned';
    return `${heat} and a STEG cut ${dayLabel(cut.start, input.now).toLowerCase()} from ${clock(cut.start)} to ${clock(cut.end)}. The tank is ${pct ?? '?'}% full when the cut starts, with ${diesel}.`;
  }, [input, plan, H]);

  const k = plan.kpis;
  const alerts = [...plan.alerts].sort((a, b) => ['critical', 'warn', 'info'].indexOf(a.level) - ['critical', 'warn', 'info'].indexOf(b.level));
  const headline = scenario === 'demo' ? `${weekday(toMs(input.now) + 24 * HOUR)}'s plan, ready the day before` : 'The next 48 hours in Kairouan';

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-[640px]">
          <h1 className="font-display text-[30px] leading-tight font-extrabold md:text-[38px]">{headline}</h1>
          <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-[11px] border border-line bg-surface p-1" role="radiogroup" aria-label="Scenario">
            {(['demo', 'live'] as const).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={scenario === s}
                className={`rounded-[8px] px-3 py-1.5 text-[13.5px] transition-colors duration-150 ${scenario === s ? 'bg-accent-strong text-on-accent' : 'text-ink-2 hover:text-ink'}`}
                onClick={() => setScenario(s)}
              >
                {s === 'demo' ? 'Heatwave demo' : 'Live forecast'}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => setCutOpen(true)}>
            <IconPlus width={18} height={18} />
            Add a STEG cut
          </button>
        </div>
      </div>
      {scenario === 'live' && (
        <p className="mt-2 text-[13px] text-ink-3">
          {liveForecast && liveFetchedAt
            ? `Open-Meteo forecast for Kairouan, fetched at ${new Date(liveFetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
            : liveError
              ? `Live forecast unavailable (${liveError}). Showing the demo.`
              : online
                ? 'Fetching the Kairouan forecast…'
                : 'Offline: showing the demo until the forecast can be fetched.'}
        </p>
      )}

      {/* The one orchestrated moment: scrub or play the 48 hours and watch the tank. */}
      <section className="card mt-6 p-4 md:p-6">
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_150px]">
          <div className="min-w-0">
            <TankTimeline plan={plan} input={input} cursor={cursor} onCursor={(c) => { setPlaying(false); setCursor(c); }} />
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-2">
              <button
                className="btn btn-primary py-1.5"
                onClick={() => {
                  tap();
                  if (cursor >= H) setCursor(0);
                  setPlaying((p) => !p);
                }}
                aria-label={playing ? 'Pause' : 'Play the 48 hours'}
              >
                {playing ? <IconPause width={16} height={16} /> : <IconPlay width={16} height={16} />}
                {playing ? 'Pause' : 'Play the 48 hours'}
              </button>
              <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-solar" />Sun</span>
              <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-grid" />Grid</span>
              <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-diesel" />Diesel</span>
              <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-4 rounded-sm bg-ok" />Turns</span>
              <span className="hidden sm:inline">Drag across the chart to see any hour.</span>
            </div>
            <p className="mt-3 min-h-[1.5em] text-[13.5px] text-ink" aria-live="polite">
              <span className="font-medium num">{dayLabel(slot.time, input.now)} {clock(cursorMs)}:</span> {slot.reason}
            </p>
          </div>
          <TankGauge
            levelM3={level}
            capacityM3={input.gda.tank.capacityM3}
            reserveM3={input.gda.tank.minReserveM3}
            timeLabel={`${dayLabel(slot.time, input.now).toLowerCase()} ${clock(cursorMs)}`}
            pump={slot.on ? (slot.source ?? 'grid') : 'off'}
            gridOn={gridOn}
          />
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div>
          <h2 className="mb-1 font-display text-[24px] font-extrabold">Turns, fragile crops first</h2>
          <p className="mb-5 text-[14px] text-ink-2">Bansui rotation: each farmer gets a turn in the cool hours, and the best slots rotate fairly.</p>
          <TurnsList plan={plan} input={input} onSms={setSmsTurn} />
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="font-display text-[19px] font-extrabold">Energy for these 48 hours</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[13.5px]">
              <div><dt className="text-ink-2">Water delivered</dt><dd className="font-display text-[22px] font-extrabold num">{fmt(k.demandMetPct)}%</dd></div>
              <div><dt className="text-ink-2">Diesel</dt><dd className="font-display text-[22px] font-extrabold num">{fmt(k.dieselL, 1)} L</dd></div>
              <div><dt className="text-ink-2">From the sun</dt><dd className="font-display text-[22px] font-extrabold num">{fmt(k.kWhSolar)} kWh</dd></div>
              <div><dt className="text-ink-2">From the grid</dt><dd className="font-display text-[22px] font-extrabold num">{fmt(k.kWhGrid)} kWh</dd></div>
              <div><dt className="text-ink-2">Grid at peak hours</dt><dd className="font-display text-[22px] font-extrabold num">{fmt(k.kWhPeak)} kWh</dd></div>
              <div><dt className="text-ink-2">Energy cost</dt><dd className="font-display text-[22px] font-extrabold num">{fmt(k.costTND, 2)} TND</dd></div>
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="font-display text-[19px] font-extrabold">What Sonae noticed</h2>
            <ul className="mt-3 space-y-2.5">
              {alerts.map((a, i) => (
                <motion.li key={`${a.message}-${i}`} layout="position" className="flex gap-2.5 text-[13.5px] leading-snug">
                  <span
                    className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: a.level === 'critical' ? 'var(--cut)' : a.level === 'warn' ? 'var(--solar)' : 'var(--water)' }}
                    aria-hidden
                  />
                  <span>
                    <span className="sr-only">{a.level}: </span>
                    {a.message}
                  </span>
                </motion.li>
              ))}
            </ul>
          </section>

          {extraOutages.length > 0 && (
            <section className="card p-5">
              <h2 className="font-display text-[19px] font-extrabold">Cuts you added</h2>
              <ul className="mt-3 space-y-2">
                {extraOutages.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 text-[13.5px]">
                    <span className="num">
                      {dayLabel(o.start, input.now)} {clock(o.start)} to {clock(o.end)}
                    </span>
                    <button className="text-[13px] text-danger hover:underline" onClick={() => removeOutage(o.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <PhoneSms turn={smsTurn} input={input} onClose={() => setSmsTurn(null)} />
      <OutageDialog open={cutOpen} nowIso={input.now} onClose={() => setCutOpen(false)} onAdd={addOutage} />
    </div>
  );
}
