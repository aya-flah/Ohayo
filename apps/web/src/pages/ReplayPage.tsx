import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { replayZitounSeason, type ZitounReplay } from '@sonae/engine';
import type { DayWeather } from '@sonae/shared';
import { useZitoun } from '../lib/zitoun';
import { fmt } from '../lib/format';
import { AnimatedNumber, EASE, GlassCard, PageHeader, Rise, Segmented, Stagger } from '../components/ui';

type Variant = 'real' | 'wet';

interface SeasonFile {
  place: string;
  source: string;
  days: DayWeather[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Pond fill over the season: without Sonae (coral, spilling at the brim) and with Sonae (margine brown). */
function SeasonChart({ r }: { r: ZitounReplay }) {
  const W = 1000;
  const H = 240;
  const top = 46;
  const n = r.days.length;
  const x = (i: number) => (i / Math.max(1, n - 1)) * W;
  const y = (share: number) => top + (1 - Math.min(1, share)) * (H - top - 6);
  const path = (k: 'pondShareWithout' | 'pondShareWith') => r.days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join('');
  const maxRain = Math.max(10, ...r.days.map((d) => d.rainMm));
  const months = r.days.map((d, i) => ({ i, d })).filter(({ d }) => d.date.endsWith('-01') || d.date.endsWith('-15'));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[220px] w-full md:h-[260px]" role="img" aria-label="Pond fill over the season, without and with Sonae, with daily rain">
        {r.days.map((d, i) =>
          d.blocked ? <rect key={`b${i}`} x={x(i) - W / n / 2} y={top} width={W / n} height={H - top} fill="var(--water)" opacity={0.08} /> : null,
        )}
        {r.days.map((d, i) =>
          d.rainMm >= 0.5 ? <rect key={`r${i}`} x={x(i) - 2} y={4} width={4} height={(d.rainMm / maxRain) * (top - 10)} rx={1.5} fill="var(--water)" opacity={0.8} /> : null,
        )}
        <line x1={0} x2={W} y1={y(1)} y2={y(1)} stroke="var(--cut)" strokeDasharray="6 6" opacity={0.6} vectorEffect="non-scaling-stroke" />
        {r.days.map((d, i) => (d.overflowWithout > 0 ? <rect key={`o${i}`} x={x(i) - W / n / 2} y={y(1) - 4} width={W / n} height={4} fill="var(--cut)" opacity={0.85} /> : null))}
        <motion.path d={path('pondShareWithout')} fill="none" stroke="var(--cut)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: EASE }} />
        <motion.path d={path('pondShareWith')} fill="none" stroke="var(--margine)" strokeWidth={3} vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay: 0.3, ease: EASE }} />
      </svg>
      <div className="relative mt-1 h-5 text-[12px] text-ink-3">
        {months.map(({ i, d }) => (
          <span key={i} className="num absolute -translate-x-1/2" style={{ left: `${(i / Math.max(1, n - 1)) * 100}%` }}>
            {Number(d.date.slice(8))} {MONTHS[Number(d.date.slice(5, 7)) - 1]}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13.5px] text-ink-2">
        <span className="flex items-center gap-2"><span className="h-[3px] w-5 rounded-full" style={{ background: 'var(--cut)' }} />Ponds without Sonae (spill at the brim)</span>
        <span className="flex items-center gap-2"><span className="h-[3px] w-5 rounded-full" style={{ background: 'var(--margine)' }} />Ponds with Sonae</span>
        <span className="flex items-center gap-2"><span className="h-3 w-1.5 rounded-sm" style={{ background: 'var(--water)' }} />Daily rain</span>
        <span className="flex items-center gap-2"><span className="h-3 w-4 rounded-sm opacity-30" style={{ background: 'var(--water)' }} />Spreading paused</span>
      </div>
    </div>
  );
}

function Row({ label, without, withS, unit, better, digits = 0 }: { label: string; without: number; withS: number; unit: string; better: 'lower' | 'higher'; digits?: number }) {
  const max = Math.max(1, without, withS);
  const good = better === 'lower' ? withS <= without : withS >= without;
  return (
    <div className="grid grid-cols-1 gap-2 border-b border-line py-3.5 last:border-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-4">
      <div className="text-[15px] font-semibold">{label}</div>
      <div>
        <div className="flex items-baseline justify-between text-[13px] text-ink-3 md:hidden">Without Sonae</div>
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--line)]">
            <motion.div className="h-full rounded-full" style={{ background: 'var(--ink-3)' }} initial={{ width: 0 }} whileInView={{ width: `${(without / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE }} />
          </div>
          <span className="num w-28 text-right text-[15px] font-bold">
            <AnimatedNumber value={without} digits={digits} /> <span className="text-[12.5px] font-semibold text-ink-3">{unit}</span>
          </span>
        </div>
      </div>
      <div>
        <div className="flex items-baseline justify-between text-[13px] text-ink-3 md:hidden">With Sonae</div>
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--line)]">
            <motion.div className="h-full rounded-full" style={{ background: good ? 'var(--ok)' : 'var(--cut)' }} initial={{ width: 0 }} whileInView={{ width: `${(withS / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.15, ease: EASE }} />
          </div>
          <span className="num w-28 text-right text-[15px] font-bold" style={{ color: good ? 'var(--ok)' : 'var(--cut)' }}>
            <AnimatedNumber value={withS} digits={digits} /> <span className="text-[12.5px] font-semibold text-ink-3">{unit}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ReplayPage() {
  const rules = useZitoun((s) => s.rules);
  const [file, setFile] = useState<SeasonFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>('real');

  useEffect(() => {
    fetch('/data/sfax-olive-season-2025-26.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: SeasonFile) => setFile(j))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the season'));
  }, []);

  const weather = useMemo(() => (file ? (variant === 'wet' ? file.days.map((d) => ({ ...d, rainMm: Math.round(d.rainMm * 3 * 10) / 10, et0Mm: d.rainMm > 1 ? Math.min(d.et0Mm, 1) : d.et0Mm })) : file.days) : null), [file, variant]);
  const r = useMemo(() => (weather ? replayZitounSeason(weather, rules) : null), [weather, rules]);
  const totalRain = weather ? Math.round(weather.reduce((s, d) => s + d.rainMm, 0)) : 0;

  return (
    <Stagger className="flex flex-col gap-6">
      <PageHeader
        kanji="再"
        eyebrow="Season replay · Sfax olive belt, 15 Nov 2025 to 28 Feb 2026"
        title={
          r ? (
            <>
              {fmt(r.without.overflowM3)} m³ spilled without Sonae, <span className="text-gradient-water">{r.with.overflowM3 > 0 ? `${fmt(r.with.overflowM3)} m³ with it` : 'none with it'}</span>
            </>
          ) : (
            <>Replaying a whole olive season</>
          )
        }
        aside={
          <Segmented
            label="Weather"
            value={variant}
            onChange={setVariant}
            options={[
              { value: 'real', label: '2025-26, real' },
              { value: 'wet', label: 'Wet winter (rain ×3)' },
            ]}
          />
        }
      >
        The three demo mills press for the whole season. Without Sonae, each pond fills and then spills into the wadi. With Sonae, the same weather, day by day, drives the tankers to {r ? r.groves : '…'} allowed groves ({r ? fmt(r.hectares) : '…'} ha) and pauses on rainy days.
      </PageHeader>

      {error && (
        <Rise className="card glass-edge p-5 text-[15px]" style={{ borderColor: 'var(--cut)' }}>
          The season file did not load ({error}). Run <code>node data/fetch-olive-season.mjs</code>, or reconnect once so it is cached for offline use.
        </Rise>
      )}

      {r && (
        <>
          <GlassCard className="p-5 md:p-6">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[19px] font-extrabold">The ponds, day by day</h2>
              <span className="num text-[13.5px] text-ink-2">
                {weather!.length} days · {totalRain} mm of rain · {r.days.filter((d) => d.blocked).length} days paused
              </span>
            </div>
            <SeasonChart r={r} />
          </GlassCard>

          <GlassCard className="p-5 md:p-6">
            <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 pb-2 text-[13px] font-semibold text-ink-3 md:grid">
              <span>Over the season</span>
              <span>Without Sonae</span>
              <span>With Sonae</span>
            </div>
            <Row label="Margine spilled into the wadis" without={r.without.overflowM3} withS={r.with.overflowM3} unit="m³" better="lower" />
            <Row label="Days a pond overflowed" without={r.overflowDaysWithout} withS={r.overflowDaysWith} unit="days" better="lower" />
            <Row label="Margine returned to olive groves" without={0} withS={r.with.spreadM3} unit="m³" better="higher" />
            <Row label="Potassium fertiliser saved" without={0} withS={r.with.fertiliserTND} unit="TND" better="higher" />
            <Row label="Grignon sent to fuel buyers" without={0} withS={r.with.grignonT} unit="t" better="higher" />
            <Row label="Spread on a rainy or wet day" without={0} withS={0} unit="loads" better="lower" />
          </GlassCard>

          <div className="grid gap-6 md:grid-cols-2">
            <GlassCard className="p-5 md:p-6">
              <h2 className="text-[19px] font-extrabold">What it costs and earns</h2>
              <ul className="mt-3 flex flex-col gap-2 text-[15px] text-ink-2">
                <li>
                  Transport for {fmt(r.with.trips)} tanker trips ({fmt(r.with.km)} km): <b className="num text-ink">{fmt(r.with.transportTND)} TND</b>, paid by the mills.
                </li>
                <li>
                  Sonae&apos;s fee at {rules.feeTNDPerM3} TND/m³: <b className="num text-ink">{fmt(r.with.feeTND)} TND</b> from three mills.
                </li>
                <li>
                  Potassium the farmers did not have to buy: <b className="num text-ink">{fmt(r.with.fertiliserTND)} TND</b>.
                </li>
                <li>
                  Heat from grignon, equal to about <b className="num text-ink">{fmt(r.with.dieselLitresReplaced)} L</b> of diesel.
                </li>
              </ul>
            </GlassCard>
            <GlassCard className="p-5 md:p-6">
              <h2 className="text-[19px] font-extrabold">How this replay works</h2>
              <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[14.5px] text-ink-2">
                <li>Real daily rain and evaporation for Sfax from the Open-Meteo archive (CC BY 4.0). &ldquo;Wet winter&rdquo; triples that rain to stress-test the pauses.</li>
                <li>Ponds start 10% full; mills press every day (38, 30 and 45 m³ of margine a day).</li>
                <li>The 9 demo groves plus a network of signed-up groves; groves near a well, the wadi or on a slope are excluded.</li>
                <li>Rules from Settings: {rules.capM3PerHa} m³/ha per season, {rules.maxDoseM3PerHaDay} m³/ha per day, no spreading from {rules.rainBlockMm} mm of rain.</li>
                <li>Only results from this simulation go into the pitch; the limits must be checked against the decree.</li>
              </ul>
            </GlassCard>
          </div>
        </>
      )}
    </Stagger>
  );
}
