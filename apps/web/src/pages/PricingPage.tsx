import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { call, packPrice, useSession, type Pack } from '../lib/session';
import { tap } from '../lib/device';
import { fmt } from '../lib/format';
import { AnimatedNumber, EASE, GlassCard, PageHeader, Range, Segmented, Stagger } from '../components/ui';

export default function PricingPage() {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [role, setRole] = useState<'mill' | 'farmer'>(user?.role === 'farmer' ? 'farmer' : 'mill');
  const [m3, setM3] = useState(1500);
  const [ha, setHa] = useState(10);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    call<Pack[]>('GET', '/packs').then(setPacks).catch((e) => setMsg(e instanceof Error ? e.message : 'Prices unavailable'));
    if (user && user.role !== 'admin') call<{ subscription: { pack_id: string } | null }>('GET', '/me').then((r) => setCurrent(r.subscription?.pack_id ?? null)).catch(() => {});
  }, [user]);

  const list = packs.filter((p) => p.role === role);
  const amount = role === 'mill' ? m3 : ha;
  const cheapest = list.length ? list.reduce((a, b) => (packPrice(b, amount) < packPrice(a, amount) ? b : a)) : null;

  const choose = async (p: Pack) => {
    tap();
    if (!user) return navigate(`/signup?role=${p.role}&next=/pricing`);
    if (user.role !== p.role) return setMsg(`This pack is for ${p.role === 'mill' ? 'mill owners' : 'farmers'}.`);
    setBusy(p.id);
    setMsg(null);
    try {
      await call('POST', '/me/subscribe', { packId: p.id });
      setCurrent(p.id);
      setMsg(`${p.name} is active on your account (demo: no payment taken).`);
      tap('medium');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not change the pack');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stagger className="flex flex-col gap-6">
      <PageHeader
        kanji="価"
        eyebrow="Packs · per olive season, Nov to Feb"
        title={
          <>
            Simple prices, <span className="text-gradient-water">paid by who gains</span>
          </>
        }
        aside={
          <Segmented
            label="Who are you"
            value={role}
            onChange={setRole}
            options={[
              { value: 'mill', label: 'Mill owner' },
              { value: 'farmer', label: 'Farmer', tone: 'ok' },
            ]}
          />
        }
      >
        Mills carry the waste problem, so they pay most: about half a dinar per m³ of margine. Farmers receive water and potassium for free, or pay a small fee per hectare for planning.
      </PageHeader>

      <GlassCard className="p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-[240px] flex-1">
            <label className="label" htmlFor="amount">
              {role === 'mill' ? (
                <>
                  Margine your mill makes per season: <b className="num text-ink">{fmt(m3)} m³</b>
                </>
              ) : (
                <>
                  Your olive groves: <b className="num text-ink">{fmt(ha)} ha</b>
                </>
              )}
            </label>
            {role === 'mill' ? (
              <Range id="amount" tone="margine" className="mt-1 w-full" min={100} max={8000} step={50} value={m3} onChange={(e) => setM3(Number(e.target.value))} />
            ) : (
              <Range id="amount" tone="olive" className="mt-1 w-full" min={1} max={100} step={1} value={ha} onChange={(e) => setHa(Number(e.target.value))} />
            )}
          </div>
          {cheapest && (
            <div className="text-[14.5px] text-ink-2">
              Best value for you: <b className="text-ink">{cheapest.name}</b>, <b className="num text-ink">{fmt(packPrice(cheapest, amount))} TND</b> this season
            </div>
          )}
        </div>
      </GlassCard>

      {msg && (
        <div className="rounded-[16px] border px-4 py-3 text-[14.5px]" style={{ borderColor: 'color-mix(in oklab, var(--water) 35%, transparent)', background: 'var(--water-soft)' }} role="status">
          {msg}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {list.map((p, i) => {
          const price = packPrice(p, amount);
          const isCurrent = current === p.id;
          return (
            <motion.div key={p.id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 * i, ease: EASE }}>
              <GlassCard variants={{}} className={`flex h-full flex-col p-5 ${p.highlight ? 'ring-2 ring-[var(--water)]' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-[22px] font-extrabold">{p.name}</h2>
                    <p className="text-[14px] text-ink-2">{p.tagline}</p>
                  </div>
                  {p.highlight && <span className="chip" style={{ color: 'var(--water)' }}><span className="text-ink">Popular</span></span>}
                </div>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-[38px] leading-none font-extrabold">
                    <AnimatedNumber value={price} />
                  </span>
                  <span className="text-[15px] font-semibold text-ink-2">TND / season</span>
                </div>
                <div className="mt-1 text-[13px] text-ink-3">
                  {p.role === 'mill' ? `${fmt(p.priceTND)} TND with ${fmt(p.included)} m³, then ${p.perUnitTND} TND per m³` : p.perUnitTND ? `${p.perUnitTND} TND per hectare` : 'Free'}
                </div>
                <ul className="mt-4 flex flex-1 flex-col gap-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2 text-[14px]">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p.role === 'mill' ? 'var(--margine)' : 'var(--olive)' }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button className={`btn mt-5 ${isCurrent ? 'btn-quiet' : p.highlight ? 'btn-primary' : 'btn-quiet'}`} disabled={isCurrent || busy === p.id} onClick={() => choose(p)}>
                  {isCurrent ? 'Your current pack' : busy === p.id ? 'Activating…' : user ? `Choose ${p.name}` : `Start with ${p.name}`}
                </button>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>
      <p className="text-center text-[13px] text-ink-3">Launch prices proposed by the Sonae team, in Tunisian dinars, per season. In this demo, choosing a pack activates it without payment.</p>
    </Stagger>
  );
}
