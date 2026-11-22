import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { driverSms, farmerSms, rainSms } from '@sonae/engine';
import type { DayPlan, Trip } from '@sonae/shared';
import { fetchSfaxWeather, planDayLabel, shortDate, useZitoun, useZPlan } from '../lib/zitoun';
import { DEFAULT_CURSOR, useScene } from '../lib/scene';
import { useOnline, tap } from '../lib/device';
import { fmt } from '../lib/format';
import { PondGauge } from '../components/PondGauge';
import { IconClose, IconCoin, IconDrop, IconLeaf, IconMessage, IconPause, IconPlay, IconPlus, IconSun } from '../components/Icons';
import { EASE, GlassCard, PageHeader, Pill, Range, Rise, Segmented, Sheet, Stagger, Stat } from '../components/ui';

const PLAY_SECONDS = 14;
const ALERT_TONE = { critical: 'var(--cut)', warn: 'var(--solar)', info: 'var(--water)' } as const;

function PlayOrb({ playing, progress, onClick }: { playing: boolean; progress: number; onClick: () => void }) {
  const R = 25;
  const L = 2 * Math.PI * R;
  return (
    <button onClick={onClick} className="group relative grid h-[60px] w-[60px] shrink-0 place-items-center rounded-full transition-transform duration-200 active:scale-90" aria-label={playing ? 'Pause' : 'Play the week'}>
      <span className="absolute inset-[6px] rounded-full" style={{ background: 'linear-gradient(135deg, var(--olive), color-mix(in oklab, var(--olive) 45%, #1d2a10))', boxShadow: '0 8px 30px -8px var(--olive), 0 1px 0 rgb(255 255 255 / .35) inset' }} />
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 60 60" aria-hidden>
        <circle cx="30" cy="30" r={R} fill="none" stroke="var(--glass-line)" strokeWidth="3" />
        <circle cx="30" cy="30" r={R} fill="none" stroke="var(--olive)" strokeWidth="3" strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - progress)} />
      </svg>
      <span className="relative text-white">{playing ? <IconPause width={20} height={20} /> : <IconPlay width={20} height={20} />}</span>
    </button>
  );
}

/** Seven days, each one a decision: spread, or wait for the soil to dry. */
function WeekStrip({ days, selected, onSelect }: { days: DayPlan[]; selected: number; onSelect: (i: number) => void }) {
  const maxM3 = Math.max(1, ...days.map((d) => d.trips.reduce((s, t) => s + t.m3, 0)));
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Plan days">
      {days.map((d) => {
        const m3 = d.trips.reduce((s, t) => s + t.m3, 0);
        const active = d.day === selected;
        return (
          <button
            key={d.day}
            role="tab"
            aria-selected={active}
            onClick={() => {
              tap();
              onSelect(d.day);
            }}
            className={`relative min-w-[118px] flex-1 overflow-hidden rounded-[18px] border px-3.5 py-3 text-left transition-colors duration-200 ${active ? 'border-[var(--glass-line-strong)] bg-surface-2' : 'border-line bg-surface hover:border-[var(--glass-line-strong)]'}`}
          >
            {active && <motion.span layoutId="day-glow" className="absolute inset-0 -z-0" style={{ background: d.blocked ? 'radial-gradient(120% 90% at 50% 0%, var(--water-soft), transparent)' : 'radial-gradient(120% 90% at 50% 0%, var(--olive-soft), transparent)' }} transition={{ type: 'spring', stiffness: 380, damping: 34 }} />}
            <div className="relative">
              <div className="text-[14px] font-bold">{planDayLabel(d.day, d.date)}</div>
              <div className="text-[12px] text-ink-3">{shortDate(d.date)}</div>
              <div className="mt-2 flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: d.rainMm >= 1 ? 'var(--water)' : 'var(--ink-3)' }}>
                <IconDrop width={13} height={13} />
                <span className="num">{fmt(d.rainMm, d.rainMm < 10 && d.rainMm % 1 ? 1 : 0)} mm</span>
              </div>
              <div className="mt-2 h-10">
                {d.blocked ? (
                  <div className="text-[13px] leading-tight font-semibold" style={{ color: 'var(--water)' }}>
                    Paused
                    <div className="text-[11.5px] font-medium text-ink-3">{d.rainMm >= 8 ? 'rain' : d.blockReason?.startsWith('Soil') ? 'wet soil' : 'rain tomorrow'}</div>
                  </div>
                ) : (
                  <div>
                    <div className="num text-[16px] leading-tight font-extrabold" style={{ color: 'var(--margine)' }}>
                      {fmt(m3)} m³
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                      <motion.div className="h-full rounded-full" style={{ background: 'var(--margine)' }} initial={{ width: 0 }} animate={{ width: `${(m3 / maxM3) * 100}%` }} transition={{ duration: 0.6, ease: EASE }} />
                    </div>
                  </div>
                )}
              </div>
              {Object.keys(d.overflow).length > 0 && <div className="mt-1 text-[11.5px] font-bold" style={{ color: 'var(--cut)' }}>Pond overflow</div>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PhoneBubble({ to, text }: { to: string; text: string }) {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[30px] border border-line bg-surface p-2.5 shadow-[var(--glass-shadow)]">
      <div className="rounded-[22px] bg-[color-mix(in_oklab,var(--ink)_6%,transparent)] px-3 pb-4 pt-3">
        <div className="mb-3 text-center text-[12px] font-semibold text-ink-3">SMS · {to}</div>
        <AnimatePresence mode="wait">
          <motion.div
            key={text}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="max-w-[92%] rounded-[18px] rounded-bl-[6px] px-3.5 py-2.5 text-[14.5px] leading-snug"
            style={{ background: 'color-mix(in oklab, var(--olive) 22%, var(--surface-2))' }}
          >
            {text}
          </motion.div>
        </AnimatePresence>
        <div className="mt-2 text-[11.5px] text-ink-3 num">{text.length}/160 characters, Derja in Latin script</div>
      </div>
    </div>
  );
}

export default function PlanPage() {
  const { input, plan, baseline } = useZPlan();
  const { scenario, setScenario, liveWeather, setLiveWeather, liveFetchedAt, storms, addStorm, removeStorm } = useZitoun();
  const online = useOnline();
  const [selected, setSelected] = useState(0);
  const [cursor, setCursor] = useState(DEFAULT_CURSOR);
  const [playing, setPlaying] = useState(false);
  const [smsKind, setSmsKind] = useState<'farmer' | 'driver'>('farmer');
  const [stormOpen, setStormOpen] = useState(false);
  const [stormDay, setStormDay] = useState(2);
  const [stormMm, setStormMm] = useState(20);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [openTrip, setOpenTrip] = useState<string | null>(null);
  const setSceneCursor = useScene((s) => s.setCursor);
  const raf = useRef<number | null>(null);
  const N = plan.days.length;

  useEffect(() => setSceneCursor(Math.min(cursor, N - 0.001)), [cursor, N, setSceneCursor]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setCursor((c) => {
        const next = c + (dt * N) / PLAY_SECONDS;
        if (next >= N) {
          setPlaying(false);
          return N - 0.001;
        }
        setSelected(Math.floor(next));
        return next;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, N]);

  useEffect(() => {
    if (scenario !== 'live' || liveWeather || !online) return;
    fetchSfaxWeather()
      .then((w) => {
        setLiveWeather(w);
        setLiveError(null);
      })
      .catch((e) => setLiveError(e instanceof Error ? e.message : 'Forecast unavailable'));
  }, [scenario, liveWeather, online, setLiveWeather]);

  const day = plan.days[selected]!;
  const k = plan.kpis;
  const firstBlock = plan.days.find((d) => d.blocked);
  const spreadBefore = firstBlock ? plan.days.slice(0, firstBlock.day).reduce((s, d) => s + d.trips.reduce((a, t) => a + t.m3, 0), 0) : k.spreadM3;
  const avoided = Math.max(0, baseline.kpis.overflowM3 - k.overflowM3);

  const byMill = useMemo(() => {
    const out = new Map<string, Trip[]>();
    for (const t of day.trips) out.set(t.millId, [...(out.get(t.millId) ?? []), t]);
    return out;
  }, [day]);

  const sms = useMemo(() => {
    if (day.blocked) return { to: 'every farmer on the list', text: rainSms(day.blockReason ?? '', Math.min(selected, 2)) };
    const t0 = day.trips[0];
    if (!t0) return { to: 'nobody', text: 'Sonae: lyoum ma fammech rihla.' };
    const mill = input.mills.find((m) => m.id === t0.millId)!;
    if (smsKind === 'driver') {
      return { to: `driver, tanker 1 of ${mill.name}`, text: driverSms(day.trips.filter((t) => t.millId === mill.id && t.truck === 0), input.groves, mill, Math.min(selected, 2)) };
    }
    const grove = input.groves.find((g) => g.id === t0.groveId)!;
    return { to: `${grove.owner}, the evening before`, text: farmerSms(day.trips.filter((t) => t.groveId === grove.id), grove, mill, 1) };
  }, [day, smsKind, input, selected]);

  const alerts = [...plan.alerts]
    .filter((a) => a.level !== 'info' || a.day === selected)
    .sort((a, b) => ['critical', 'warn', 'info'].indexOf(a.level) - ['critical', 'warn', 'info'].indexOf(b.level))
    .slice(0, 5);

  const selectDay = (i: number) => {
    setPlaying(false);
    setSelected(i);
    setCursor(i + DEFAULT_CURSOR);
  };

  const headline = firstBlock ? (
    <>
      {fmt(spreadBefore)} m³ out before {planDayLabel(firstBlock.day, firstBlock.date).toLowerCase() === 'today' ? 'today' : planDayLabel(firstBlock.day, firstBlock.date)}&apos;s rain,{' '}
      <span className="text-gradient-water">{k.overflowM3 > 0 ? `${fmt(k.overflowM3)} m³ still spill` : 'no pond spills'}</span>
    </>
  ) : (
    <>
      {fmt(k.spreadM3)} m³ of margine to olive groves, <span className="text-gradient-water">{k.overflowM3 > 0 ? `${fmt(k.overflowM3)} m³ spill` : 'no pond spills'}</span>
    </>
  );

  return (
    <Stagger className="flex flex-col gap-6">
      <PageHeader
        kanji="備"
        eyebrow={`7-day margine plan · Sfax olive belt${scenario === 'demo' ? ' (demo)' : ''}`}
        title={headline}
        aside={
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <Segmented
              label="Weather"
              value={scenario}
              onChange={(v) => setScenario(v)}
              options={[
                { value: 'demo', label: 'Storm demo' },
                { value: 'live', label: 'Live forecast' },
              ]}
            />
            <button className="btn btn-quiet" onClick={() => setStormOpen(true)}>
              <IconPlus width={18} height={18} /> Add rain
            </button>
          </div>
        }
      >
        Three maâsras are pressing and their ponds keep rising. Sonae sends each tanker to the nearest grove that can safely take margine, pauses when rain is coming, and keeps every pond below the brim. Doing nothing would spill <b className="text-ink">{fmt(baseline.kpis.overflowM3)} m³</b> into the wadis this week.
        {scenario === 'live' && (
          <span className="mt-2 block text-[14px] text-ink-3">
            {liveError ? `Live forecast unavailable (${liveError}); showing the demo week.` : liveFetchedAt ? `Open-Meteo forecast for Sfax, fetched ${new Date(liveFetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.` : online ? 'Fetching the Sfax forecast…' : 'Offline: showing the demo week.'}
          </span>
        )}
      </PageHeader>

      {storms.length > 0 && (
        <Rise className="flex flex-wrap gap-2">
          {storms.map((s) => (
            <button key={s.id} className="chip" style={{ color: 'var(--water)' }} onClick={() => removeStorm(s.id)} aria-label={`Remove ${s.mm} mm of rain on day ${s.day + 1}`}>
              <IconDrop width={14} height={14} />
              <span className="text-ink">
                +{s.mm} mm {planDayLabel(s.day, plan.days[s.day]?.date ?? '').toLowerCase()}
              </span>
              <IconClose width={14} height={14} />
            </button>
          ))}
        </Rise>
      )}

      <GlassCard className="p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[19px] font-extrabold">The week, one decision a day</h2>
            <p className="text-[14.5px] text-ink-2">Pick a day, or play the week: the olive region behind this page follows.</p>
          </div>
          <div className="flex items-center gap-3">
            <Range
              tone="olive"
              className="w-40 md:w-56"
              min={0}
              max={N - 0.001}
              step={0.01}
              value={cursor}
              aria-label="Moment of the week shown in 3D"
              onChange={(e) => {
                setPlaying(false);
                const c = Number(e.target.value);
                setCursor(c);
                setSelected(Math.floor(c));
              }}
            />
            <PlayOrb
              playing={playing}
              progress={cursor / N}
              onClick={() => {
                tap();
                if (!playing && cursor >= N - 0.01) setCursor(0);
                setPlaying((p) => !p);
              }}
            />
          </div>
        </div>
        <WeekStrip days={plan.days} selected={selected} onSelect={selectDay} />
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <GlassCard className="p-5 md:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[19px] font-extrabold">
                {planDayLabel(selected, day.date)} · {shortDate(day.date)}
              </h2>
              {day.blocked ? <Pill tone="water">No spreading</Pill> : <Pill tone="ok">{day.trips.length} tanker trips</Pill>}
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={`${selected}-${day.trips.length}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: EASE }}>
                {day.blocked ? (
                  <div className="mt-4 rounded-[18px] border border-[color-mix(in_oklab,var(--water)_35%,transparent)] bg-[var(--water-soft)] px-4 py-3.5 text-[15.5px]">
                    <b>{day.blockReason}.</b> The tankers stay at the mills and the ponds absorb the day&apos;s pressing. Every farmer expecting margine gets an SMS.
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col gap-5">
                    {input.mills.map((m) => {
                      const trips = byMill.get(m.id) ?? [];
                      if (!trips.length) return null;
                      return (
                        <div key={m.id}>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-[15px] font-bold">
                              {m.name} <span className="font-medium text-ink-3">· {m.town}</span>
                            </div>
                            <div className="num text-[13.5px] text-ink-2">
                              {fmt(trips.reduce((s, t) => s + t.m3, 0))} m³ · {m.trucks} tanker{m.trucks > 1 ? 's' : ''}
                            </div>
                          </div>
                          <ul className="flex flex-col gap-1.5">
                            {trips.map((t, i) => {
                              const g = input.groves.find((x) => x.id === t.groveId)!;
                              const key = `${m.id}-${i}`;
                              const open = openTrip === key;
                              return (
                                <li key={key}>
                                  <button onClick={() => setOpenTrip(open ? null : key)} className="flex w-full items-center gap-3 rounded-[14px] border border-line bg-surface px-3 py-2.5 text-left transition-colors duration-200 hover:border-[var(--glass-line-strong)]" aria-expanded={open}>
                                    <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12.5px] font-bold" style={{ background: 'var(--margine-soft)', color: 'var(--margine)' }}>
                                      T{t.truck + 1}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[14.5px] font-semibold">{g.owner}</span>
                                      <span className="block text-[12.5px] text-ink-3">
                                        trip {t.slot + 1} · {fmt(t.km, 1)} km round trip
                                      </span>
                                    </span>
                                    <span className="num text-[16px] font-extrabold" style={{ color: 'var(--margine)' }}>
                                      {fmt(t.m3)} m³
                                    </span>
                                  </button>
                                  <AnimatePresence>
                                    {open && (
                                      <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden px-3 pt-1.5 text-[13.5px] text-ink-2">
                                        {t.reason}
                                      </motion.p>
                                    )}
                                  </AnimatePresence>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
                {day.grignon.length > 0 && (
                  <div className="mt-5 border-t border-line pt-4">
                    <div className="mb-2 text-[15px] font-bold">Grignon to fuel buyers</div>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {day.grignon.map((g, i) => {
                        const b = input.buyers.find((x) => x.id === g.buyerId)!;
                        const m = input.mills.find((x) => x.id === g.millId)!;
                        return (
                          <li key={i} className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-3 py-2.5">
                            <span style={{ color: 'var(--solar)' }}>
                              <IconSun width={18} height={18} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-semibold">{b.name}</span>
                              <span className="block truncate text-[12.5px] text-ink-3">from {m.name}</span>
                            </span>
                            <span className="num text-[15px] font-extrabold" style={{ color: 'var(--solar)' }}>
                              {fmt(g.tonnes, g.tonnes % 1 ? 1 : 0)} t
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </GlassCard>

          <GlassCard className="p-5 md:p-6">
            <h2 className="text-[19px] font-extrabold">This week in numbers</h2>
            <p className="text-[14.5px] text-ink-2">Who gains what, if the plan runs as shown.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label="Margine spread" value={k.spreadM3} unit="m³" tone="ink" hint={`${k.trips} tanker trips`} />
              <Stat label="Spill avoided" value={avoided} unit="m³" tone="ok" hint="kept out of the wadis" />
              <Stat label="Fertiliser saved" value={k.fertiliserTND} unit="TND" tone="ok" icon={<IconLeaf width={15} height={15} />} hint="potassium the groves need" />
              <Stat label="Grignon delivered" value={k.grignonT} unit="t" tone="solar" icon={<IconSun width={15} height={15} />} hint="to hammams, bakeries, kilns" />
              <Stat label="Diesel replaced" value={k.dieselLitresReplaced} unit="L" tone="solar" hint="same heat, from grignon" />
              <Stat label="Transport" value={k.transportTND} unit="TND" tone="ink" icon={<IconCoin width={15} height={15} />} hint={`${fmt(k.km)} km, paid by the mills`} />
            </div>
            <div className="mt-4 grid gap-2 text-[14px] text-ink-2 md:grid-cols-3">
              <div className="rounded-[14px] border border-line bg-surface px-3.5 py-3">
                <b className="text-ink">Mills</b> pay Sonae <b className="num text-ink">{fmt(k.feeTND)} TND</b> this week (0.5 TND/m³) instead of digging ponds and risking fines.
              </div>
              <div className="rounded-[14px] border border-line bg-surface px-3.5 py-3">
                <b className="text-ink">Farmers</b> get free water and <b className="num text-ink">{fmt(k.fertiliserTND)} TND</b> of potassium for a small seasonal fee.
              </div>
              <div className="rounded-[14px] border border-line bg-surface px-3.5 py-3">
                <b className="text-ink">Buyers</b> burn grignon instead of wood or gas; Sonae takes about 5 TND per tonne.
              </div>
            </div>
          </GlassCard>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <GlassCard className="p-5 md:p-6">
            <h2 className="text-[19px] font-extrabold">The ponds tonight</h2>
            <p className="text-[14.5px] text-ink-2">Margine left in each maâsra&apos;s pond at the end of {planDayLabel(selected, day.date).toLowerCase()}.</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {input.mills.map((m) => (
                <PondGauge key={m.id} name={m.name.replace('Maâsra ', '')} town={m.town} m3={day.pondEnd[m.id]!} capacity={m.pondCapacityM3} compact />
              ))}
            </div>
            <div className="mt-4 rounded-[14px] border border-line bg-surface px-3.5 py-3 text-[14px] text-ink-2">
              Without Sonae, by the end of the week:{' '}
              {input.mills.map((m, i) => (
                <span key={m.id}>
                  {i > 0 && ', '}
                  <b className="num text-ink">{Math.round((baseline.days[N - 1]!.pondEnd[m.id]! / m.pondCapacityM3) * 100)}%</b> {m.name.replace('Maâsra ', '')}
                </span>
              ))}
              {baseline.kpis.overflowM3 > 0 && (
                <>
                  , and <b style={{ color: 'var(--cut)' }}>{fmt(baseline.kpis.overflowM3)} m³</b> spilled.
                </>
              )}
            </div>
          </GlassCard>

          <GlassCard className="p-5 md:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[19px] font-extrabold">
                <IconMessage width={19} height={19} /> The SMS
              </h2>
              {!day.blocked && (
                <Segmented
                  size="sm"
                  label="Recipient"
                  value={smsKind}
                  onChange={setSmsKind}
                  options={[
                    { value: 'farmer', label: 'Farmer', tone: 'ok' },
                    { value: 'driver', label: 'Driver' },
                  ]}
                />
              )}
            </div>
            <PhoneBubble to={sms.to} text={sms.text} />
          </GlassCard>

          <GlassCard className="p-5 md:p-6">
            <h2 className="text-[19px] font-extrabold">Groves</h2>
            <p className="text-[14.5px] text-ink-2">Season cap: {input.rules.capM3PerHa} m³ per hectare. Some groves never receive margine.</p>
            <ul className="mt-3 flex flex-col gap-2">
              {input.groves.map((g) => {
                const c = plan.groves.find((x) => x.groveId === g.id)!;
                const used = (c.capM3 - c.remainingM3) / c.capM3;
                return (
                  <li key={g.id} className="rounded-[14px] border border-line bg-surface px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-semibold">{g.owner}</span>
                      <span className="num shrink-0 text-[12.5px] text-ink-3">{g.areaHa} ha</span>
                    </div>
                    {c.allowed ? (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--line)]">
                          <motion.div className="h-full rounded-full" style={{ background: 'var(--olive)' }} initial={{ width: 0 }} animate={{ width: `${used * 100}%` }} transition={{ duration: 0.6, ease: EASE }} />
                        </div>
                        <span className="num text-[12px] text-ink-2">{fmt(c.remainingM3)} m³ left</span>
                      </div>
                    ) : (
                      <div className="mt-1 text-[12.5px] font-semibold" style={{ color: 'var(--cut)' }}>
                        Never: {c.reason}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </GlassCard>

          {alerts.length > 0 && (
            <GlassCard className="p-5 md:p-6">
              <h2 className="text-[19px] font-extrabold">Watch</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {alerts.map((a, i) => (
                  <li key={i} className="rounded-[14px] border border-line bg-surface py-2.5 pl-3 pr-3 text-[14px]" style={{ borderLeft: `3px solid ${ALERT_TONE[a.level]}` }}>
                    <span className="font-semibold">{planDayLabel(a.day, plan.days[a.day]?.date ?? '')}:</span> {a.text}
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
        </div>
      </div>

      <Sheet open={stormOpen} onClose={() => setStormOpen(false)} label="Add rain to the forecast" className="max-w-[460px]">
        <h2 className="text-[21px] font-extrabold">Add rain to the forecast</h2>
        <p className="mt-1 text-[15px] text-ink-2">See how Sonae reschedules the tankers around a storm.</p>
        <label className="label mt-5 block" htmlFor="storm-day">
          Day
        </label>
        <select id="storm-day" className="field mt-1.5 w-full" value={stormDay} onChange={(e) => setStormDay(Number(e.target.value))}>
          {plan.days.map((d) => (
            <option key={d.day} value={d.day}>
              {planDayLabel(d.day, d.date)} · {shortDate(d.date)}
            </option>
          ))}
        </select>
        <label className="label mt-4 block" htmlFor="storm-mm">
          Rain: <span className="num">{stormMm} mm</span>
        </label>
        <Range id="storm-mm" className="mt-2 w-full" min={2} max={60} step={1} value={stormMm} onChange={(e) => setStormMm(Number(e.target.value))} />
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn btn-quiet" onClick={() => setStormOpen(false)}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              addStorm({ id: `${Date.now()}`, day: stormDay, mm: stormMm });
              setStormOpen(false);
              selectDay(Math.max(0, stormDay - 1));
            }}
          >
            <IconDrop width={17} height={17} /> Add rain
          </button>
        </div>
      </Sheet>
    </Stagger>
  );
}
