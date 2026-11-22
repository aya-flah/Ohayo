import { AnimatePresence, animate, motion, useMotionTemplate, useMotionValue, useReducedMotion, type HTMLMotionProps, type Variants } from 'motion/react';
import { useEffect, useId, useRef, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';
import { fmt } from '../lib/format';
import { tap } from '../lib/device';

export const EASE = [0.16, 1, 0.3, 1] as const;

/* ── Staggered reveal: every page's cards rise out of the water ─────── */

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } },
};

export const rise: Variants = {
  hidden: { opacity: 0, y: 28, filter: 'blur(10px)', scale: 0.985 },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', scale: 1, transition: { duration: 0.75, ease: EASE } },
};

export function Stagger({ children, className, ...rest }: HTMLMotionProps<'div'>) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className={className} {...rest}>
      {children}
    </motion.div>
  );
}

export function Rise({ children, className, ...rest }: HTMLMotionProps<'div'>) {
  return (
    <motion.div variants={rise} className={className} {...rest}>
      {children}
    </motion.div>
  );
}

/* ── Glass card with a light that follows the pointer ───────────────── */

export function GlassCard({ children, className = '', spotlight = true, as = 'section', ...rest }: HTMLMotionProps<'section'> & { spotlight?: boolean; as?: 'section' | 'div' | 'aside' }) {
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const bg = useMotionTemplate`radial-gradient(420px circle at ${x}px ${y}px, color-mix(in oklab, var(--water) 13%, transparent), transparent 65%)`;
  const Comp = as === 'div' ? motion.div : as === 'aside' ? motion.aside : motion.section;
  return (
    <Comp
      variants={rise}
      className={`card glass-edge overflow-hidden ${className}`}
      onPointerMove={(e: React.PointerEvent<HTMLElement>) => {
        if (!spotlight || e.pointerType !== 'mouse') return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - r.left);
        y.set(e.clientY - r.top);
      }}
      onPointerLeave={() => {
        x.set(-400);
        y.set(-400);
      }}
      {...(rest as object)}
    >
      {spotlight && <motion.div aria-hidden className="pointer-events-none absolute inset-0 z-0" style={{ background: bg }} />}
      <div className="relative z-[1]">{children as ReactNode}</div>
    </Comp>
  );
}

/* ── Segmented control: the thumb glides like water finding level ───── */

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = 'md',
  className = '',
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; tone?: 'water' | 'solar' | 'cut' | 'ok' }>;
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={`glass glass-soft relative inline-flex rounded-full p-1 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        const tone = o.tone ?? 'water';
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={active}
            onClick={() => {
              tap();
              onChange(o.value);
            }}
            className={`relative z-[1] flex items-center gap-2 rounded-full font-semibold transition-colors duration-200 ${size === 'sm' ? 'min-h-[40px] px-3.5 text-[14px]' : 'min-h-[44px] px-4.5 text-[15px]'} ${active ? 'text-on-accent' : 'text-ink-2 hover:text-ink'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 -z-[1] rounded-full"
                style={{
                  background: `linear-gradient(135deg, var(--${tone === 'ok' ? 'ok' : tone === 'cut' ? 'cut' : tone}), color-mix(in oklab, var(--${tone === 'ok' ? 'ok' : tone === 'cut' ? 'cut' : tone}) 60%, var(--water-deep)))`,
                  boxShadow: `0 1px 0 rgb(255 255 255 / .3) inset, 0 8px 24px -8px var(--${tone === 'ok' ? 'ok' : tone === 'cut' ? 'cut' : tone})`,
                }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Numbers roll like a meter ───────────────────────────────────────── */

export function AnimatedNumber({ value, digits = 0, duration = 0.9, className = '' }: { value: number; digits?: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current ?? 0;
    prev.current = value;
    if (reduced) {
      el.textContent = fmt(value, digits);
      return;
    }
    const c = animate(from, value, { duration, ease: EASE, onUpdate: (v) => (el.textContent = fmt(v, digits)) });
    return () => c.stop();
  }, [value, digits, duration, reduced]);
  return <span ref={ref} className={`num ${className}`}>{fmt(value, digits)}</span>;
}

/* ── Stat tile ───────────────────────────────────────────────────────── */

const TONE = { water: 'var(--water)', ok: 'var(--ok)', solar: 'var(--solar)', cut: 'var(--cut)', ink: 'var(--ink)', grid: 'var(--grid)' } as const;
export type Tone = keyof typeof TONE;

export function Stat({ label, value, digits = 0, unit, tone = 'ink', icon, hint }: { label: string; value: number; digits?: number; unit?: string; tone?: Tone; icon?: ReactNode; hint?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-[18px] border border-line bg-surface px-4 py-3.5 transition-colors duration-300 hover:border-[var(--glass-line-strong)]">
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-25 blur-2xl transition-opacity duration-500 group-hover:opacity-50" style={{ background: TONE[tone] }} />
      <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
        {icon && <span style={{ color: TONE[tone] }}>{icon}</span>}
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[26px] leading-tight font-extrabold tracking-tight" style={{ color: tone === 'ink' ? 'var(--ink)' : TONE[tone] }}>
          <AnimatedNumber value={value} digits={digits} />
        </span>
        {unit && <span className="text-[14px] font-semibold text-ink-2">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[12.5px] text-ink-3">{hint}</div>}
    </div>
  );
}

/* ── Page header with a kanji watermark ──────────────────────────────── */

export function PageHeader({ kanji, eyebrow, title, children, aside }: { kanji?: string; eyebrow: string; title: ReactNode; children?: ReactNode; aside?: ReactNode }) {
  return (
    <motion.header variants={rise} className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="relative max-w-[680px]">
        {kanji && (
          <span lang="ja" aria-hidden className="pointer-events-none absolute -left-3 -top-16 select-none font-jp text-[150px] leading-none font-extrabold text-ink opacity-[0.05] md:-top-24 md:text-[210px]">
            {kanji}
          </span>
        )}
        <div className="eyebrow relative flex items-center gap-2.5">
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-[var(--water)]" />
          {eyebrow}
        </div>
        <h1 className="relative mt-3 text-[34px] leading-[1.06] font-extrabold md:text-[52px]">{title}</h1>
        {children && <div className="relative mt-4 text-[16.5px] leading-relaxed text-ink-2 md:text-[17.5px]">{children}</div>}
      </div>
      {aside && <div className="relative">{aside}</div>}
    </motion.header>
  );
}

/* ── Status pill ─────────────────────────────────────────────────────── */

export function Pill({ tone = 'water', children, pulse = false, className = '' }: { tone?: Tone; children: ReactNode; pulse?: boolean; className?: string }) {
  return (
    <span className={`chip ${className}`} style={{ color: tone === 'ink' ? 'var(--ink)' : TONE[tone], background: `color-mix(in oklab, ${TONE[tone]} 13%, transparent)`, borderColor: `color-mix(in oklab, ${TONE[tone]} 30%, transparent)` }}>
      <span className={`dot ${pulse ? 'dot-pulse' : ''}`} />
      <span className="text-ink">{children}</span>
    </span>
  );
}

/* ── Modal sheet: slides up from the bottom on phones, floats on desktop ─ */

export function Sheet({ open, onClose, children, label, className = '' }: { open: boolean; onClose: () => void; children: ReactNode; label: string; className?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
    <motion.div
      key="sheet"
      className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.3 } }}
      exit={{ opacity: 0, transition: { duration: 0.2, delay: 0.05 } }}
    >
      <motion.div className="absolute inset-0 bg-[rgb(3_7_14/0.55)] backdrop-blur-[6px]" onClick={onClose} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`card glass-edge glass-strong relative w-full p-6 ${className}`}
        initial={{ y: 60, opacity: 0, scale: 0.96, filter: 'blur(8px)' }}
        animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 300, damping: 30 } }}
        exit={{ y: 40, opacity: 0, scale: 0.97, transition: { duration: 0.2, ease: [0.7, 0, 0.84, 0] } }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Slider: the filled part of the track always follows the thumb ─── */

export function Range({ value, min = 0, max = 100, tone = 'water', className = '', style, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'min' | 'max'> & { value: number; min?: number; max?: number; tone?: 'water' | 'olive' | 'margine' }) {
  const p = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      className={`range ${className}`}
      min={min}
      max={max}
      value={value}
      style={{ ...style, '--p': `${Math.max(0, Math.min(100, p))}%`, '--range-tone': `var(--${tone})` } as CSSProperties}
      {...rest}
    />
  );
}
