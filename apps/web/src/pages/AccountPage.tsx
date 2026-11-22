import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, Navigate, useNavigate } from 'react-router';
import { call, ROLE_LABEL, useSession, type FarmProfile, type Facts, type Me, type MillProfile, type SeasonPlan } from '../lib/session';
import { TOWNS } from '../lib/api';
import { useSonae } from '../lib/store';
import { tap } from '../lib/device';
import { fmt } from '../lib/format';
import { SeasonPlanView } from '../components/SeasonPlanView';
import { AnimatedNumber, EASE, GlassCard, Pill, Rise, Stagger } from '../components/ui';

/* ── Small form pieces ─────────────────────────────────────────────── */

function N({ id, label, unit, value, onChange, step = 1, int = false }: { id: string; label: string; unit?: string; value: number; onChange: (v: number) => void; step?: number; int?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input id={id} type="number" inputMode="decimal" min={0} step={step} className={`field num ${unit ? 'pr-12' : ''}`} value={value} onChange={(e) => onChange(int ? Math.round(Number(e.target.value)) : Number(e.target.value))} />
        {unit && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-3">{unit}</span>}
      </div>
    </div>
  );
}

function TownSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label" htmlFor="town">Town</label>
      <select id="town" className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {TOWNS.map((t) => (
          <option key={t.name}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}

const DEFAULT_MILL: MillProfile = { name: '', town: 'Sfax', olivesT: 2000, margineM3: 1500, grignonT: 800, pondM3: 1000, trucks: 2, truckM3: 15, seasonDays: 90 };
const DEFAULT_FARM: FarmProfile = { name: '', town: 'Sfax', areaHa: 10, trees: 1000, slopePct: 3, distWellM: 400, distWadiM: 300, irrigated: false, fertiliserTND: 2500 };

function MillForm({ initial, name, onSaved }: { initial: MillProfile | null; name: string; onSaved: () => void }) {
  const [m, setM] = useState<MillProfile>(initial ?? { ...DEFAULT_MILL, name });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (p: Partial<MillProfile>) => setM((x) => ({ ...x, ...p }));
  const save = async () => {
    tap();
    setBusy(true);
    setMsg(null);
    try {
      await call('PUT', '/me/mill', m);
      setMsg('Saved.');
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Not saved');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="mname">Mill name</label>
          <input id="mname" className="field" value={m.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <TownSelect value={m.town} onChange={(town) => set({ town })} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <N id="olives" label="Olives pressed" unit="t" value={m.olivesT} onChange={(v) => set({ olivesT: v, margineM3: Math.round(v * 0.75), grignonT: Math.round(v * 0.4) })} step={50} />
        <N id="marg" label="Margine" unit="m³" value={m.margineM3} onChange={(v) => set({ margineM3: v })} step={50} />
        <N id="grig" label="Fitoura (fresh)" unit="t" value={m.grignonT} onChange={(v) => set({ grignonT: v })} step={10} />
        <N id="pond" label="Pond size" unit="m³" value={m.pondM3} onChange={(v) => set({ pondM3: v })} step={50} />
        <N id="trk" label="Tankers" value={m.trucks} onChange={(v) => set({ trucks: v })} int />
        <N id="tsz" label="Tanker size" unit="m³" value={m.truckM3} onChange={(v) => set({ truckM3: v })} />
        <N id="days" label="Pressing days" unit="days" value={m.seasonDays} onChange={(v) => set({ seasonDays: v })} int />
      </div>
      <p className="mt-2 text-[12.5px] text-ink-3">Typing the olives fills margine (≈0.75 m³/t) and fitoura (≈0.4 t/t) for you; adjust them if you know your figures.</p>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save my mill'}
        </button>
        {msg && <span className="text-[14px] text-ink-2">{msg}</span>}
      </div>
    </div>
  );
}

function FarmForm({ initial, name, onSaved }: { initial: FarmProfile | null; name: string; onSaved: () => void }) {
  const [f, setF] = useState<FarmProfile>(initial ?? { ...DEFAULT_FARM, name });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (p: Partial<FarmProfile>) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    tap();
    setBusy(true);
    setMsg(null);
    try {
      await call('PUT', '/me/farm', f);
      setMsg('Saved.');
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Not saved');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="fname">Farm name</label>
          <input id="fname" className="field" value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <TownSelect value={f.town} onChange={(town) => set({ town })} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <N id="area" label="Olive groves" unit="ha" value={f.areaHa} onChange={(v) => set({ areaHa: v })} step={0.5} />
        <N id="trees" label="Olive trees" value={f.trees} onChange={(v) => set({ trees: v })} int step={50} />
        <N id="slope" label="Slope" unit="%" value={f.slopePct} onChange={(v) => set({ slopePct: v })} />
        <N id="fert" label="Fertiliser per season" unit="TND" value={f.fertiliserTND} onChange={(v) => set({ fertiliserTND: v })} step={100} />
        <N id="well" label="To nearest well" unit="m" value={f.distWellM} onChange={(v) => set({ distWellM: v })} step={10} />
        <N id="wadi" label="To the wadi" unit="m" value={f.distWadiM} onChange={(v) => set({ distWadiM: v })} step={10} />
        <div className="col-span-2 flex items-end">
          <label className="field flex cursor-pointer items-center justify-between gap-3">
            <span>My groves are irrigated</span>
            <input type="checkbox" className="h-5 w-5 accent-[var(--ok)]" checked={f.irrigated} onChange={(e) => set({ irrigated: e.target.checked })} />
          </label>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save my farm'}
        </button>
        {msg && <span className="text-[14px] text-ink-2">{msg}</span>}
      </div>
    </div>
  );
}

/* ── Generating: a short story while the AI works ────────────────────── */

const STEPS_MILL = ['Reading your mill profile', 'Counting tanker trips and hectares', 'Checking last season’s rain, day by day', 'Pricing your pack, transport and fitoura', 'Sonae AI is writing your phases and risks', 'Checking every number adds up'];
const STEPS_FARM = ['Reading your farm profile', 'Checking your land against the rules', 'Working out the potassium your trees need', 'Checking last season’s rain, day by day', 'Sonae AI is writing your plan', 'Checking every number adds up'];

function Generating({ mill }: { mill: boolean }) {
  const steps = mill ? STEPS_MILL : STEPS_FARM;
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => Math.min(steps.length - 1, x + 1)), 4200);
    return () => clearInterval(id);
  }, [steps.length]);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="card glass-edge relative overflow-hidden p-6 md:p-8" role="status" aria-live="polite">
      <motion.div className="absolute inset-x-0 top-0 h-1 origin-left" style={{ background: 'linear-gradient(90deg, var(--water), var(--olive), var(--margine))' }} initial={{ scaleX: 0.04 }} animate={{ scaleX: 0.95 }} transition={{ duration: 26, ease: 'easeOut' }} />
      <div className="flex items-center gap-4">
        <span className="relative grid h-14 w-14 shrink-0 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full border border-[var(--water)] opacity-40" />
          <span lang="ja" className="relative font-jp text-[26px] font-extrabold" style={{ color: 'var(--water)' }}>備</span>
        </span>
        <div>
          <div className="text-[20px] font-extrabold">Building your season plan</div>
          <div className="text-[14px] text-ink-2">About 25 seconds. Sonae computes the numbers, then Sonae AI writes the plan.</div>
        </div>
      </div>
      <ol className="mt-5 flex flex-col gap-2">
        {steps.map((s, k) => (
          <motion.li key={s} initial={{ opacity: 0, x: -8 }} animate={{ opacity: k <= i ? 1 : 0.35, x: 0 }} transition={{ duration: 0.3, delay: 0.05 * k }} className="flex items-center gap-3 text-[15px]">
            <span className="grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold" style={{ background: k < i ? 'var(--ok)' : k === i ? 'var(--water)' : 'var(--line)', color: k <= i ? 'var(--on-accent)' : 'var(--ink-3)' }}>
              {k < i ? '✓' : k + 1}
            </span>
            {s}
            {k === i && <span className="dot dot-pulse" style={{ color: 'var(--water)' }} />}
          </motion.li>
        ))}
      </ol>
    </motion.div>
  );
}

/* ── Mill owner and farmer space ───────────────────────────────────── */

function Member({ me, reload }: { me: Me; reload: () => void }) {
  const mill = me.user.role === 'mill';
  const profile = mill ? me.mill : me.farm;
  const [estimate, setEstimate] = useState<Facts | null>(null);
  const [plan, setPlan] = useState<SeasonPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(!profile);

  useEffect(() => {
    if (!profile) return;
    call<Facts>('POST', '/me/estimate', {}).then(setEstimate).catch(() => setEstimate(null));
  }, [profile, me.subscription?.pack_id]);

  const generate = async () => {
    tap('medium');
    setBusy(true);
    setError(null);
    setPlan(null);
    try {
      const p = await call<SeasonPlan>('POST', '/me/plan', { lang: useSonae.getState().lang });
      setPlan(p);
      reload();
      setTimeout(() => document.getElementById('plan-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The plan could not be generated');
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: number) => {
    tap();
    setError(null);
    try {
      setPlan(await call<SeasonPlan>('GET', `/me/plans/${id}`));
      setTimeout(() => document.getElementById('plan-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this plan');
    }
  };

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <GlassCard className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[20px] font-extrabold">{mill ? 'Your mill' : 'Your farm'}</h2>
            {profile && (
              <button className="btn btn-quiet btn-sm" onClick={() => setEditing((e) => !e)}>
                {editing ? 'Close' : 'Edit'}
              </button>
            )}
          </div>
          <AnimatePresence initial={false} mode="wait">
            {editing || !profile ? (
              <motion.div key="form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
                {mill ? (
                  <MillForm initial={me.mill} name={me.user.name} onSaved={() => { setEditing(false); reload(); }} />
                ) : (
                  <FarmForm initial={me.farm} name={me.user.name} onSaved={() => { setEditing(false); reload(); }} />
                )}
              </motion.div>
            ) : (
              <motion.dl key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[14.5px] md:grid-cols-3">
                {(mill && me.mill
                  ? [
                      ['Name', me.mill.name],
                      ['Town', me.mill.town],
                      ['Olives', `${fmt(me.mill.olivesT)} t`],
                      ['Margine', `${fmt(me.mill.margineM3)} m³`],
                      ['Fitoura', `${fmt(me.mill.grignonT)} t`],
                      ['Pond', `${fmt(me.mill.pondM3)} m³`],
                      ['Tankers', `${me.mill.trucks} × ${me.mill.truckM3} m³`],
                      ['Pressing', `${me.mill.seasonDays} days`],
                    ]
                  : me.farm
                    ? [
                        ['Name', me.farm.name],
                        ['Town', me.farm.town],
                        ['Groves', `${fmt(me.farm.areaHa, 1)} ha`],
                        ['Trees', fmt(me.farm.trees)],
                        ['Slope', `${me.farm.slopePct}%`],
                        ['Well / wadi', `${fmt(me.farm.distWellM)} m / ${fmt(me.farm.distWadiM)} m`],
                        ['Fertiliser', `${fmt(me.farm.fertiliserTND)} TND`],
                      ]
                    : []
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[12.5px] text-ink-3">{k}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                ))}
              </motion.dl>
            )}
          </AnimatePresence>
        </GlassCard>

        <GlassCard className="p-5 md:p-6">
          <h2 className="text-[20px] font-extrabold">Your pack</h2>
          {me.subscription ? (
            <p className="mt-2 text-[15px]">
              <b>{estimate?.pack.name ?? me.subscription.pack_id}</b> is active since {me.subscription.started_at.slice(0, 10)}.
            </p>
          ) : (
            <p className="mt-2 text-[15px] text-ink-2">No pack yet: your plan uses the pack that suits you best.</p>
          )}
          {estimate && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-[16px] border border-line bg-surface px-3 py-2.5">
                <div className="text-[12.5px] text-ink-3">{estimate.money.lines[0]?.label}</div>
                <div className="num text-[22px] font-extrabold">
                  <AnimatedNumber value={estimate.money.lines[0]?.tnd ?? 0} /> TND
                </div>
              </div>
              <div className="rounded-[16px] border border-line bg-surface px-3 py-2.5">
                <div className="text-[12.5px] text-ink-3">Season balance</div>
                <div className="num text-[22px] font-extrabold" style={{ color: estimate.money.netTND >= 0 ? 'var(--ok)' : 'var(--cut)' }}>
                  <AnimatedNumber value={estimate.money.netTND} /> TND
                </div>
              </div>
            </div>
          )}
          <Link to="/pricing" className="btn btn-quiet btn-sm mt-4">
            {me.subscription ? 'Change pack' : 'See packs and prices'}
          </Link>
        </GlassCard>
      </div>

      <GlassCard className="relative overflow-hidden p-6 md:p-8">
        <span aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full opacity-20 blur-3xl" style={{ background: mill ? 'var(--margine)' : 'var(--olive)' }} />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-[640px]">
            <h2 className="text-[24px] font-extrabold md:text-[28px]">{mill ? 'Your season, planned for your margine and fitoura' : 'Your season, planned for your land'}</h2>
            <p className="mt-1 text-[15px] text-ink-2">
              {mill
                ? 'Costs, income, how many tankers and hectares, when to spread, what could go wrong. Sonae computes the numbers; Sonae AI writes the plan.'
                : 'How much margine your trees need, how many loads, what you save on fertiliser, and when. Sonae computes the numbers; Sonae AI writes the plan.'}
            </p>
          </div>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="btn btn-primary shrink-0 px-7 text-[16px]" onClick={generate} disabled={busy || !profile}>
            {busy ? 'Generating…' : !profile ? `Fill in your ${mill ? 'mill' : 'farm'} first` : 'Generate my season plan'}
          </motion.button>
        </div>
        {error && <p className="relative mt-3 text-[14px]" style={{ color: 'var(--cut)' }}>{error}</p>}
        {me.plans.length > 0 && (
          <div className="relative mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-ink-3">Past plans:</span>
            {me.plans.map((p) => (
              <button key={p.id} className="chip" onClick={() => open(p.id)} title={p.headline}>
                <span className="text-ink">{p.created_at.slice(0, 16).replace('T', ' ')}</span>
              </button>
            ))}
          </div>
        )}
      </GlassCard>

      <div id="plan-top" className="scroll-mt-28" />
      <AnimatePresence mode="wait">
        {busy ? <Generating key="gen" mill={mill} /> : plan ? <motion.div key={plan.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}><SeasonPlanView plan={plan} /></motion.div> : null}
      </AnimatePresence>
    </>
  );
}

/* ── Admin ─────────────────────────────────────────────────────────── */

interface Overview {
  counts: { mill: number; farmer: number; admin: number; plans: number };
  seasonRevenueTND: number;
  volume: { margineM3: number; grignonT: number; farmHa: number };
  packs: Array<{ id: string; name: string; role: string; subscribers: number }>;
  users: Array<{ id: number; email: string; name: string; role: string; phone: string | null; active: number; created_at: string; pack: string | null }>;
  plans: Array<{ id: number; kind: string; created_at: string; cost_usd: number; name: string }>;
  ai: { totalUSD: number; capUSD: number };
}

function Admin() {
  const [o, setO] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mill' | 'farmer' | 'admin'>('all');
  const load = useCallback(() => call<Overview>('GET', '/admin/overview').then(setO).catch((e) => setError(e instanceof Error ? e.message : 'Overview unavailable')), []);
  useEffect(() => {
    load();
  }, [load]);
  const toggle = async (id: number, active: boolean) => {
    tap();
    try {
      await call('PATCH', `/admin/users/${id}`, { active });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not changed');
    }
  };
  if (error) return <p style={{ color: 'var(--cut)' }}>{error}</p>;
  if (!o) return <p className="text-ink-2">Loading the overview…</p>;
  const maxSubs = Math.max(1, ...o.packs.map((p) => p.subscribers));
  const tiles = [
    { l: 'Mill owners', v: o.counts.mill, c: 'var(--margine)' },
    { l: 'Farmers', v: o.counts.farmer, c: 'var(--olive)' },
    { l: 'Season revenue', v: o.seasonRevenueTND, c: 'var(--ok)', u: 'TND' },
    { l: 'Margine under plan', v: o.volume.margineM3, c: 'var(--margine)', u: 'm³' },
    { l: 'Groves registered', v: o.volume.farmHa, c: 'var(--olive)', u: 'ha' },
    { l: 'AI plans generated', v: o.counts.plans, c: 'var(--water)' },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t, i) => (
          <motion.div key={t.l} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 * i, ease: EASE }} className="rounded-[18px] border border-line bg-surface px-4 py-3.5">
            <div className="text-[13px] font-semibold text-ink-2">{t.l}</div>
            <div className="num mt-1 text-[24px] font-extrabold" style={{ color: t.c }}>
              <AnimatedNumber value={t.v} /> {t.u && <span className="text-[13px] text-ink-2">{t.u}</span>}
            </div>
          </motion.div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <GlassCard className="p-5 md:p-6">
          <h2 className="text-[19px] font-extrabold">Packs</h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {o.packs.map((p, i) => (
              <li key={p.id}>
                <div className="flex justify-between text-[14px]">
                  <span>
                    <b>{p.name}</b> <span className="text-ink-3">{p.role === 'mill' ? 'mill' : 'farmer'}</span>
                  </span>
                  <span className="num font-bold">{p.subscribers}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--line)]">
                  <motion.div className="h-full rounded-full" style={{ background: p.role === 'mill' ? 'var(--margine)' : 'var(--olive)' }} initial={{ width: 0 }} animate={{ width: `${(p.subscribers / maxSubs) * 100}%` }} transition={{ duration: 0.7, delay: 0.06 * i, ease: EASE }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-[16px] border border-line bg-surface px-3.5 py-3 text-[14px]">
            AI spending: <b className="num">${o.ai.totalUSD.toFixed(2)}</b> of ${o.ai.capUSD} budget
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--line)]">
              <motion.div className="h-full rounded-full" style={{ background: 'var(--water)' }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (o.ai.totalUSD / o.ai.capUSD) * 100)}%` }} transition={{ duration: 0.8 }} />
            </div>
          </div>
          {o.plans.length > 0 && (
            <>
              <h3 className="mt-5 text-[15px] font-bold">Recent plans</h3>
              <ul className="mt-2 flex flex-col gap-1 text-[13.5px] text-ink-2">
                {o.plans.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    {p.created_at.slice(5, 16)} · {p.name} · {p.kind} · ${p.cost_usd.toFixed(3)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </GlassCard>
        <GlassCard className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[19px] font-extrabold">Users</h2>
            <div className="flex gap-1">
              {(['all', 'mill', 'farmer', 'admin'] as const).map((f) => (
                <button key={f} className={`chip ${filter === f ? 'ring-1 ring-[var(--water)]' : ''}`} onClick={() => setFilter(f)}>
                  <span className="text-ink capitalize">{f === 'mill' ? 'mills' : f === 'farmer' ? 'farmers' : f}</span>
                </button>
              ))}
            </div>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {o.users
              .filter((u) => filter === 'all' || u.role === filter)
              .map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-surface px-3 py-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold" style={{ background: u.role === 'mill' ? 'var(--margine-soft)' : u.role === 'farmer' ? 'var(--olive-soft)' : 'var(--water-soft)' }}>
                    {u.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold">{u.name}</span>
                    <span className="block truncate text-[12.5px] text-ink-3">
                      {u.email} · {ROLE_LABEL[u.role as 'mill']}
                      {u.pack ? ` · ${u.pack.replace(/^(mill|farmer)-/, '')}` : ''}
                    </span>
                  </span>
                  {u.role !== 'admin' && (
                    <button className="btn btn-quiet btn-sm" onClick={() => toggle(u.id, !u.active)}>
                      {u.active ? 'Suspend' : 'Reactivate'}
                    </button>
                  )}
                  {!u.active && <Pill tone="cut">Suspended</Pill>}
                </li>
              ))}
          </ul>
        </GlassCard>
      </div>
    </>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function AccountPage() {
  const navigate = useNavigate();
  const { user, clear } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    call<Me>('GET', '/me')
      .then(setMe)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your account'));
  }, []);
  useEffect(() => {
    if (user) load();
  }, [user, load]);
  if (!user) return <Navigate to="/login?next=/account" replace />;

  const logout = async () => {
    tap();
    await call('POST', '/auth/logout').catch(() => {});
    clear();
    navigate('/login');
  };

  return (
    <Stagger className="flex flex-col gap-5">
      <Rise className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">{ROLE_LABEL[user.role]} space</div>
          <h1 className="mt-2 text-[32px] leading-tight font-extrabold md:text-[44px]">
            Ahla, <span className="text-gradient-water">{user.name}</span>
          </h1>
        </div>
        <div className="flex gap-2">
          {user.role !== 'admin' && (
            <Link to="/pricing" className="btn btn-quiet btn-sm">
              Packs
            </Link>
          )}
          <button className="btn btn-quiet btn-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </Rise>
      {error && <p style={{ color: 'var(--cut)' }}>{error}</p>}
      {me ? user.role === 'admin' ? <Admin /> : <Member me={me} reload={load} /> : !error && <p className="text-ink-2">Loading your account…</p>}
    </Stagger>
  );
}
