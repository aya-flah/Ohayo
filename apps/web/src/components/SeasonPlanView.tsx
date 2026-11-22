import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { SeasonPlan } from '../lib/session';
import { fmt } from '../lib/format';
import { AnimatedNumber, EASE } from './ui';
import { IconDrop } from './Icons';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d: string) => new Date(`${d}T12:00:00Z`).getTime();
const short = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`);
  return Number.isNaN(x.getTime()) ? d : `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`;
};
const LEVEL = { low: 'var(--ok)', medium: 'var(--solar)', high: 'var(--cut)' } as const;
const PHASE_TONES = ['var(--water)', 'var(--margine)', 'var(--olive)', 'var(--solar)', 'var(--ok)', 'var(--water)'];

/** One section of the plan, revealed as it scrolls into view. */
function Block({ title, kicker, children, delay = 0 }: { title: string; kicker?: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.section initial={{ opacity: 0, y: 28, filter: 'blur(8px)' }} whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay, ease: EASE }} className="card glass-edge p-5 md:p-6">
      {kicker && <div className="text-[13px] font-semibold text-ink-3">{kicker}</div>}
      <h3 className="text-[20px] font-extrabold">{title}</h3>
      <div className="mt-4">{children}</div>
    </motion.section>
  );
}

function Kpi({ label, value, unit, tone, i, hint }: { label: string; value: number; unit: string; tone: string; i: number; hint?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, delay: 0.25 + i * 0.08, ease: EASE }} className="relative overflow-hidden rounded-[18px] border border-line bg-surface px-4 py-3.5">
      <span className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-30 blur-2xl" style={{ background: tone }} />
      <div className="text-[13px] font-semibold text-ink-2">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[26px] leading-tight font-extrabold" style={{ color: tone }}>
          <AnimatedNumber value={value} duration={1.4} />
        </span>
        <span className="text-[14px] font-semibold text-ink-2">{unit}</span>
      </div>
      {hint && <div className="text-[12.5px] text-ink-3">{hint}</div>}
    </motion.div>
  );
}

export function SeasonPlanView({ plan }: { plan: SeasonPlan }) {
  const { facts, ai } = plan;
  const mill = facts.kind === 'mill';
  const t = facts.totals;
  const [phase, setPhase] = useState(0);
  const [done, setDone] = useState<Record<number, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`sonae:check:${plan.id}`) ?? '{}') as Record<number, boolean>;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`sonae:check:${plan.id}`, JSON.stringify(done));
    } catch {
      /* fine */
    }
  }, [done, plan.id]);
  useEffect(() => setPhase(0), [plan.id]);

  const span = useMemo(() => {
    const a = Math.min(...ai.phases.map((p) => day(p.start)));
    const b = Math.max(...ai.phases.map((p) => day(p.end)));
    return { a, len: Math.max(1, b - a) };
  }, [ai.phases]);
  const volume = mill ? t.margineM3 ?? 0 : t.recommendedM3 ?? 0;
  const lines = facts.money.lines;
  const maxLine = Math.max(1, ...lines.map((l) => l.tnd));
  const doneCount = ai.checklist.filter((_, i) => done[i]).length;
  const R = 22;
  const C = 2 * Math.PI * R;
  const maxRain = Math.max(10, ...facts.weather.months.map((m) => m.rainMm));

  const kpis = mill
    ? [
        { label: 'Margine to place', value: t.margineM3 ?? 0, unit: 'm³', tone: 'var(--margine)', hint: `${fmt(t.trips ?? 0)} tanker trips` },
        { label: 'Olive land needed', value: t.hectares ?? 0, unit: 'ha', tone: 'var(--olive)', hint: `about ${t.groves} groves of 10 ha` },
        { label: 'Safe spreading days', value: facts.weather.safeDays, unit: 'days', tone: 'var(--water)', hint: `of ${facts.weather.seasonDays} last season` },
        { label: 'Fitoura sold as fuel', value: t.dryGrignonT ?? 0, unit: 't', tone: 'var(--solar)', hint: `from ${fmt(t.grignonT ?? 0)} t fresh` },
        { label: 'Season balance', value: facts.money.netTND, unit: 'TND', tone: facts.money.netTND >= 0 ? 'var(--ok)' : 'var(--cut)', hint: 'income minus costs' },
      ]
    : [
        { label: 'Margine for your land', value: t.recommendedM3 ?? 0, unit: 'm³', tone: 'var(--margine)', hint: `${t.perHaM3} m³/ha, cap ${fmt(t.capM3 ?? 0)} m³` },
        { label: 'Tanker loads', value: t.loads ?? 0, unit: 'loads', tone: 'var(--olive)', hint: 'of about 15 m³' },
        { label: 'Potassium your trees need', value: t.needK2oKg ?? 0, unit: 'kg K₂O', tone: 'var(--water)' },
        { label: 'Season balance', value: facts.money.netTND, unit: 'TND', tone: facts.money.netTND >= 0 ? 'var(--ok)' : 'var(--cut)', hint: 'savings minus pack' },
      ];

  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: EASE }} className="card glass-edge relative overflow-hidden p-6 md:p-8">
        <motion.span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: mill ? 'var(--margine)' : 'var(--olive)' }} initial={{ opacity: 0 }} animate={{ opacity: 0.25 }} transition={{ duration: 1.2 }} />
        <div className="relative">
          <div className="text-[13px] font-semibold text-ink-3">
            Season plan · {facts.pack.name} pack · {short(ai.phases[0]?.start ?? '')} to {short(ai.phases[ai.phases.length - 1]?.end ?? '')}
          </div>
          <h2 className="mt-2 text-[26px] leading-tight font-extrabold md:text-[36px]">
            {ai.headline.split(' ').map((w, i) => (
              <motion.span key={`${w}${i}`} className="inline-block" initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.4, delay: 0.05 * i, ease: EASE }}>
                {w}&nbsp;
              </motion.span>
            ))}
          </h2>
          <motion.p className="mt-3 max-w-[760px] text-[16px] leading-relaxed text-ink-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.5 }}>
            {ai.summary}
          </motion.p>
          {facts.kind === 'farmer' && facts.eligibility && !facts.eligibility.allowed && (
            <p className="mt-3 rounded-[14px] border px-3 py-2 text-[14px]" style={{ borderColor: 'color-mix(in oklab, var(--cut) 40%, transparent)' }}>
              Your land can't receive margine: {facts.eligibility.reason}.
            </p>
          )}
        </div>
        <div className={`relative mt-6 grid grid-cols-2 gap-3 ${mill ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
          {kpis.map((k, i) => (
            <Kpi key={k.label} {...k} i={i} />
          ))}
        </div>
      </motion.div>

      {/* Money */}
      <Block title="What the season costs and brings" kicker="Computed by Sonae from your profile">
        <ul className="flex flex-col gap-3">
          {lines.map((l, i) => {
            const tone = l.kind === 'cost' ? 'var(--cut)' : 'var(--ok)';
            return (
              <li key={l.label}>
                <div className="flex items-baseline justify-between gap-3 text-[14.5px]">
                  <span className="font-semibold">{l.label}</span>
                  <span className="num font-extrabold" style={{ color: l.tnd ? tone : 'var(--ink-3)' }}>
                    {l.tnd ? `${l.kind === 'cost' ? '−' : '+'}${fmt(l.tnd)} TND` : 'free'}
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--line)]">
                  <motion.div className="h-full rounded-full" style={{ background: tone }} initial={{ width: 0 }} whileInView={{ width: `${(l.tnd / maxLine) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.1 * i, ease: EASE }} />
                </div>
                <div className="mt-0.5 text-[12.5px] text-ink-3">{l.note}</div>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-center">
          <div>
            <div className="text-[12.5px] font-semibold text-ink-3">Costs</div>
            <div className="num text-[20px] font-extrabold" style={{ color: 'var(--cut)' }}>
              <AnimatedNumber value={facts.money.costTND} /> TND
            </div>
          </div>
          <div>
            <div className="text-[12.5px] font-semibold text-ink-3">{mill ? 'Income' : 'Savings'}</div>
            <div className="num text-[20px] font-extrabold" style={{ color: 'var(--ok)' }}>
              <AnimatedNumber value={facts.money.incomeTND} /> TND
            </div>
          </div>
          <div>
            <div className="text-[12.5px] font-semibold text-ink-3">Balance</div>
            <div className="num text-[20px] font-extrabold" style={{ color: facts.money.netTND >= 0 ? 'var(--ok)' : 'var(--cut)' }}>
              <AnimatedNumber value={facts.money.netTND} /> TND
            </div>
          </div>
        </div>
        {facts.kind === 'farmer' && facts.money.currentFertiliserTND !== undefined && facts.money.currentFertiliserTND > 0 && (
          <p className="mt-3 text-[14px] text-ink-2">
            Your fertiliser bill could drop from <b className="num text-ink">{fmt(facts.money.currentFertiliserTND)}</b> to <b className="num text-ink">{fmt(facts.money.newFertiliserTND ?? 0)} TND</b>.
          </p>
        )}
      </Block>

      {/* Timeline */}
      <Block title="The season, phase by phase" kicker="Written by Sonae AI around the computed numbers · tap a phase">
        <div className="relative">
          <div className="flex h-14 overflow-hidden rounded-[16px] border border-line">
            {ai.phases.map((p, i) => {
              const w = ((day(p.end) - day(p.start)) / span.len) * 100;
              const active = i === phase;
              return (
                <motion.button
                  key={i}
                  onClick={() => setPhase(i)}
                  className="relative flex min-w-0 flex-col justify-center overflow-hidden px-2 text-left"
                  style={{ width: `${Math.max(8, w)}%`, background: active ? `color-mix(in oklab, ${PHASE_TONES[i]} 30%, var(--surface))` : 'var(--surface)', borderRight: '1px solid var(--line)' }}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.15 * i }}
                  aria-pressed={active}
                >
                  <motion.span className="absolute inset-x-0 bottom-0 origin-left" style={{ height: 4, background: PHASE_TONES[i] }} initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.3 + 0.15 * i, ease: EASE }} />
                  <span className="truncate text-[13px] font-bold">{p.name}</span>
                  <span className="truncate text-[11.5px] text-ink-3">{Math.round(p.share * volume)} m³</span>
                </motion.button>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[11.5px] text-ink-3">
            <span>{short(ai.phases[0]?.start ?? '')}</span>
            <span>{short(ai.phases[ai.phases.length - 1]?.end ?? '')}</span>
          </div>
        </div>
        <AnimatePresence mode="wait">
          {ai.phases[phase] && (
            <motion.div key={phase} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25, ease: EASE }} className="mt-4 grid gap-4 md:grid-cols-[1fr_1.3fr]">
              <div>
                <div className="text-[13px] font-semibold text-ink-3">
                  {short(ai.phases[phase].start)} to {short(ai.phases[phase].end)}
                </div>
                <div className="text-[22px] font-extrabold" style={{ color: PHASE_TONES[phase] }}>
                  {ai.phases[phase].name}
                </div>
                <p className="mt-1 text-[14.5px] text-ink-2">{ai.phases[phase].focus}</p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="num text-[30px] font-extrabold">
                    <AnimatedNumber value={Math.round(ai.phases[phase].share * volume)} />
                  </span>
                  <span className="text-[14px] text-ink-2">
                    m³ · {Math.round(ai.phases[phase].share * 100)}% of the season
                  </span>
                </div>
                <p className="mt-2 flex gap-2 text-[13.5px] text-ink-2">
                  <span style={{ color: 'var(--water)' }}>
                    <IconDrop width={15} height={15} />
                  </span>
                  {ai.phases[phase].weather}
                </p>
              </div>
              <ol className="flex flex-col gap-2">
                {ai.phases[phase].actions.map((a, i) => (
                  <motion.li key={a} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.06 * i }} className="flex gap-3 rounded-[14px] border border-line bg-surface px-3 py-2.5 text-[14px]">
                    <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: `color-mix(in oklab, ${PHASE_TONES[phase]} 20%, transparent)`, color: PHASE_TONES[phase] }}>
                      {i + 1}
                    </span>
                    {a}
                  </motion.li>
                ))}
              </ol>
            </motion.div>
          )}
        </AnimatePresence>
      </Block>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Risks */}
        <Block title="What could go wrong" kicker="Tap a risk to see how to avoid it">
          <RiskList risks={ai.risks} />
        </Block>

        {/* Checklist */}
        <Block title="Your checklist" kicker="Saved on this device">
          <div className="mb-3 flex items-center gap-3">
            <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90" aria-hidden>
              <circle cx="28" cy="28" r={R} fill="none" stroke="var(--line)" strokeWidth="5" />
              <motion.circle cx="28" cy="28" r={R} fill="none" stroke="var(--ok)" strokeWidth="5" strokeLinecap="round" strokeDasharray={C} animate={{ strokeDashoffset: C * (1 - doneCount / Math.max(1, ai.checklist.length)) }} transition={{ duration: 0.5, ease: EASE }} />
            </svg>
            <div className="text-[14.5px]">
              <b className="num">
                {doneCount}/{ai.checklist.length}
              </b>{' '}
              done
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {ai.checklist.map((c, i) => (
              <li key={i}>
                <label className="flex cursor-pointer gap-3 rounded-[14px] border border-line bg-surface px-3 py-2.5">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--ok)]" checked={!!done[i]} onChange={(e) => setDone((d) => ({ ...d, [i]: e.target.checked }))} />
                  <span className={`text-[14px] transition-opacity duration-200 ${done[i] ? 'text-ink-3 line-through opacity-70' : ''}`}>
                    <b className="text-ink-2">{c.when}:</b> {c.task}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Block>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Block title="Last season's weather, month by month" kicker={facts.weather.source}>
          <div className="flex h-36 items-end gap-3">
            {facts.weather.months.map((m, i) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="num text-[12px] text-ink-2">{Math.round(m.rainMm)} mm</span>
                <motion.div className="w-full rounded-t-[10px]" style={{ background: 'linear-gradient(180deg, var(--water), color-mix(in oklab, var(--water) 30%, transparent))' }} initial={{ height: 0 }} whileInView={{ height: `${Math.max(6, (m.rainMm / maxRain) * 100)}px` }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.1 * i, ease: EASE }} />
                <span className="text-[12px] font-semibold">{MONTHS[Number(m.month.slice(5, 7)) - 1]}</span>
                <span className="text-[11px] text-ink-3">{m.blocked} paused</span>
              </div>
            ))}
          </div>
        </Block>
        <Block title="Tips">
          <ul className="flex flex-col gap-2">
            {ai.tips.map((tip, i) => (
              <motion.li key={tip} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 * i }} className="flex gap-2 text-[14.5px]">
                <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--olive)' }} />
                {tip}
              </motion.li>
            ))}
          </ul>
        </Block>
      </div>
    </div>
  );
}

function RiskList({ risks }: { risks: SeasonPlan['ai']['risks'] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="flex flex-col gap-2">
      {risks.map((r, i) => (
        <li key={i}>
          <button onClick={() => setOpen(open === i ? null : i)} className="w-full rounded-[14px] border bg-surface px-3 py-2.5 text-left transition-colors duration-200" style={{ borderColor: open === i ? LEVEL[r.level] : 'var(--line)' }} aria-expanded={open === i}>
            <div className="flex items-center gap-2">
              <span className="rounded-full px-2 py-0.5 text-[11.5px] font-bold capitalize" style={{ color: LEVEL[r.level], background: `color-mix(in oklab, ${LEVEL[r.level]} 15%, transparent)` }}>
                {r.level}
              </span>
              <span className="text-[14.5px] font-semibold">{r.title}</span>
            </div>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden pt-2 text-[14px] text-ink-2">
                  {r.mitigation}
                </motion.p>
              )}
            </AnimatePresence>
          </button>
        </li>
      ))}
    </ul>
  );
}
