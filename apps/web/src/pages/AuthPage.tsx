import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { call, useSession, type User } from '../lib/session';
import { tap } from '../lib/device';
import { IconLeaf, IconSun } from '../components/Icons';
import { EASE, GlassCard, Rise, Stagger } from '../components/ui';

const ROLES = [
  { value: 'mill' as const, title: 'Mill owner', jp: 'معصرة', text: 'Plan your margine and grignon, trace every load, certify your oil.', icon: IconSun, tone: 'var(--margine)' },
  { value: 'farmer' as const, title: 'Farmer', jp: 'فلاح', text: 'Receive free water and potassium for your olive trees, safely.', icon: IconLeaf, tone: 'var(--olive)' },
];

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setSession = useSession((s) => s.set);
  const [role, setRole] = useState<'mill' | 'farmer'>(params.get('role') === 'farmer' ? 'farmer' : 'mill');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = params.get('next') ?? '/account';
  const signup = mode === 'signup';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    tap();
    setBusy(true);
    setError(null);
    try {
      const res = signup
        ? await call<{ token: string; user: User }>('POST', '/auth/signup', { name, email, password, role, phone: phone || undefined })
        : await call<{ token: string; user: User }>('POST', '/auth/login', { email, password });
      setSession(res.token, res.user);
      tap('medium');
      navigate(next.startsWith('/') ? next : '/account', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stagger className="mx-auto flex max-w-[980px] flex-col gap-6">
      <Rise className="text-center">
        <div className="eyebrow">{signup ? 'Create your account' : 'Welcome back'}</div>
        <h1 className="mt-2 text-[34px] leading-tight font-extrabold md:text-[46px]">
          {signup ? (
            <>
              Join Sonae <span className="text-gradient-water">in one minute</span>
            </>
          ) : (
            <>
              Sign in to <span className="text-gradient-water">Sonae</span>
            </>
          )}
        </h1>
      </Rise>

      <div className={`grid gap-6 ${signup ? 'lg:grid-cols-[1fr_1.1fr]' : 'mx-auto w-full max-w-[460px]'}`}>
        {signup && (
          <Rise className="flex flex-col gap-3">
            <div className="text-[14px] font-semibold text-ink-2">I am a…</div>
            {ROLES.map((r) => {
              const active = role === r.value;
              const Icon = r.icon;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => {
                    tap();
                    setRole(r.value);
                  }}
                  aria-pressed={active}
                  className="relative overflow-hidden rounded-[22px] border p-4 text-left transition-colors duration-200"
                  style={{ borderColor: active ? r.tone : 'var(--line)', background: active ? `color-mix(in oklab, ${r.tone} 14%, var(--surface))` : 'var(--surface)' }}
                >
                  {active && <motion.span layoutId="role-glow" className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 0 0 2px ${r.tone}` }} transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ color: r.tone, background: `color-mix(in oklab, ${r.tone} 16%, transparent)` }}>
                      <Icon width={22} height={22} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[17px] font-bold">{r.title}</span>
                        <span className="text-[14px] text-ink-3">{r.jp}</span>
                      </div>
                      <p className="text-[14px] text-ink-2">{r.text}</p>
                    </div>
                  </div>
                </button>
              );
            })}
            <p className="text-[13px] text-ink-3">Admin accounts are created by Sonae, not by sign-up.</p>
          </Rise>
        )}

        <GlassCard className="p-5 md:p-6">
          <form className="flex flex-col gap-3.5" onSubmit={submit} noValidate>
            <AnimatePresence initial={false}>
              {signup && (
                <motion.div key="signup-fields" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: EASE }} className="flex flex-col gap-3.5 overflow-hidden">
                  <div>
                    <label className="label" htmlFor="name">{role === 'mill' ? 'Mill or owner name' : 'Your name'}</label>
                    <input id="name" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
                  </div>
                  <div>
                    <label className="label" htmlFor="phone">Phone (for SMS, optional)</label>
                    <input id="phone" className="field" type="tel" autoComplete="tel" placeholder="+216 …" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input id="password" className="field pr-20" type={show ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-2" onClick={() => setShow((s) => !s)}>
                  {show ? 'Hide' : 'Show'}
                </button>
              </div>
              {signup && <p className="mt-1 text-[12.5px] text-ink-3">At least 8 characters.</p>}
            </div>
            {error && (
              <p className="text-[14px]" style={{ color: 'var(--cut)' }} role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary mt-1" disabled={busy}>
              {busy ? (signup ? 'Creating your account…' : 'Signing in…') : signup ? `Create my ${role === 'mill' ? 'mill' : 'farmer'} account` : 'Sign in'}
            </button>
            <p className="text-center text-[14px] text-ink-2">
              {signup ? 'Already have an account? ' : 'New to Sonae? '}
              <Link className="font-semibold text-[var(--water)]" to={`${signup ? '/login' : '/signup'}${params.toString() ? `?${params}` : ''}`}>
                {signup ? 'Sign in' : 'Create an account'}
              </Link>
            </p>
            {!signup && <p className="text-center text-[12.5px] text-ink-3">Demo accounts (admin, mill, farmer) are listed in apps/api/.env.</p>}
          </form>
        </GlassCard>
      </div>
      <Rise className="text-center text-[14px] text-ink-2">
        <Link to="/pricing" className="font-semibold text-[var(--water)]">See the packs and prices</Link>
      </Rise>
    </Stagger>
  );
}
