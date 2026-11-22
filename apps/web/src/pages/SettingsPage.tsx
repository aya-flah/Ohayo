import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { useSonae, type ThemeChoice } from '../lib/store';
import { useZitoun } from '../lib/zitoun';
import { tap } from '../lib/device';
import { IconCoin, IconDrop, IconLeaf, IconMoon, IconSunMode } from '../components/Icons';
import { GlassCard, PageHeader, Stagger } from '../components/ui';

function NumberField({ label, value, unit, onChange, step = 1, min = 0 }: { label: string; value: number; unit: string; onChange: (v: number) => void; step?: number; min?: number }) {
  const id = label.toLowerCase().replace(/\W+/g, '-');
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input id={id} type="number" className="field num pr-16" value={value} step={step} min={min} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink-3">{unit}</span>
      </div>
    </div>
  );
}

function Section({ title, hint, icon, tone, children }: { title: string; hint: string; icon: ReactNode; tone: string; children: ReactNode }) {
  return (
    <GlassCard className="p-5 md:p-7">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ color: tone, background: `color-mix(in oklab, ${tone} 14%, transparent)`, boxShadow: `0 0 24px -6px ${tone}` }}>
          {icon}
        </span>
        <div>
          <h2 className="text-[22px] font-extrabold">{title}</h2>
          <p className="mt-1 text-[15px] text-ink-2">{hint}</p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </GlassCard>
  );
}

const MODES: Array<{ value: ThemeChoice; title: string; hint: string }> = [
  { value: 'dark', title: 'Spatial Glass', hint: 'Frosted glass over the living olive region. Best indoors and at night.' },
  { value: 'light', title: 'Field', hint: 'High contrast on sunlit sand. Best outdoors in bright sun.' },
  { value: 'system', title: 'Match device', hint: 'Follows the light or dark setting of this phone or computer.' },
];

function ModePreview({ mode }: { mode: ThemeChoice }) {
  const field = mode === 'light';
  return (
    <div className="relative h-24 overflow-hidden rounded-[16px]" style={{ background: mode === 'system' ? 'linear-gradient(115deg, #0b121e 50%, #faf8f5 50%)' : field ? '#faf8f5' : 'radial-gradient(120% 120% at 70% 0%, #1f4a6e, #0b121e 60%)' }}>
      <div className="absolute bottom-3 left-3 h-9 w-24 rounded-[10px]" style={{ background: field ? '#fff' : 'rgb(11 18 30 / .7)', border: `1px solid ${field ? '#e6e2da' : 'rgb(255 255 255 / .14)'}` }}>
        <div className="m-2 h-1.5 w-12 rounded-full" style={{ background: field ? '#141b24' : '#f8fafc' }} />
        <div className="mx-2 h-1.5 w-8 rounded-full" style={{ background: field ? '#1b6fae' : '#38bdf8' }} />
      </div>
      <div className="absolute right-4 top-3 h-14 w-7 overflow-hidden rounded-[8px] border" style={{ borderColor: field ? '#d6d0c4' : 'rgb(255 255 255 / .2)' }}>
        <div className="absolute inset-x-0 bottom-0 h-2/3" style={{ background: field ? '#1b6fae' : 'linear-gradient(#7dd3fc,#1b4d7e)' }} />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useSonae();
  const { rules, setRules, resetRules } = useZitoun();
  const set = (patch: Partial<typeof rules>) => setRules({ ...rules, ...patch });

  return (
    <Stagger className="space-y-6">
      <PageHeader kanji="設" eyebrow="Settings · stored on this device" title={<>The rules every plan <span className="text-gradient-water">obeys</span></>}>
        <p>These limits protect the soil, the wells and the wadis. The defaults are cautious; check them against the current Tunisian decree on spreading margine, then adjust. The plan updates as you type.</p>
      </PageHeader>

      <div className="pt-4" />

      <Section title="Where and how much" hint="A grove only receives margine within its season cap and daily dose, never on a slope, near a drinking-water well or near the wadi." icon={<IconLeaf width={24} height={24} />} tone="var(--olive)">
        <NumberField label="Season cap" unit="m³/ha" value={rules.capM3PerHa} onChange={(v) => set({ capM3PerHa: Math.max(1, v) })} />
        <NumberField label="Daily dose" unit="m³/ha" value={rules.maxDoseM3PerHaDay} onChange={(v) => set({ maxDoseM3PerHaDay: Math.max(1, v) })} />
        <NumberField label="Steepest slope" unit="%" value={rules.maxSlopePct} onChange={(v) => set({ maxSlopePct: Math.max(0, v) })} />
        <NumberField label="Distance from a well" unit="m" value={rules.minDistWellM} onChange={(v) => set({ minDistWellM: Math.max(0, v) })} step={10} />
        <NumberField label="Distance from the wadi" unit="m" value={rules.minDistWadiM} onChange={(v) => set({ minDistWadiM: Math.max(0, v) })} step={10} />
      </Section>

      <Section title="When" hint="Rain washes margine into the wadis, so Sonae stops on rainy days, the day before rain, and while the soil is still wet." icon={<IconDrop width={24} height={24} />} tone="var(--water)">
        <NumberField label="Rain that stops spreading" unit="mm" value={rules.rainBlockMm} onChange={(v) => set({ rainBlockMm: Math.max(1, v) })} />
        <NumberField label="Wet soil: rain in 2 days" unit="mm" value={rules.wetSoilMm} onChange={(v) => set({ wetSoilMm: Math.max(1, v) })} />
        <NumberField label="Trips per tanker per day" unit="trips" value={rules.tripsPerTruckDay} onChange={(v) => set({ tripsPerTruckDay: Math.max(1, Math.round(v)) })} />
      </Section>

      <Section title="Money" hint="Used for the numbers on the Plan and Replay pages. Mills pay transport and Sonae's fee; farmers save on fertiliser." icon={<IconCoin width={24} height={24} />} tone="var(--solar)">
        <NumberField label="Transport" unit="TND/km" value={rules.costPerKmTND} onChange={(v) => set({ costPerKmTND: Math.max(0, v) })} step={0.1} />
        <NumberField label="Sonae's fee to mills" unit="TND/m³" value={rules.feeTNDPerM3} onChange={(v) => set({ feeTNDPerM3: Math.max(0, v) })} step={0.1} />
        <NumberField label="Potassium in margine" unit="kg/m³" value={rules.k2oKgPerM3} onChange={(v) => set({ k2oKgPerM3: Math.max(0, v) })} step={0.5} />
        <NumberField label="Potassium fertiliser price" unit="TND/kg" value={rules.k2oTNDPerKg} onChange={(v) => set({ k2oTNDPerKg: Math.max(0, v) })} step={0.1} />
        <NumberField label="What a grove needs" unit="kg/ha" value={rules.k2oNeedKgPerHa} onChange={(v) => set({ k2oNeedKgPerHa: Math.max(0, v) })} step={5} />
      </Section>

      <GlassCard className="p-5 md:p-7">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-water" style={{ background: 'var(--water-soft)' }}>
            {theme === 'light' ? <IconSunMode width={24} height={24} /> : <IconMoon width={23} height={23} />}
          </span>
          <div>
            <h2 className="text-[22px] font-extrabold">Appearance</h2>
            <p className="mt-1 text-[15px] text-ink-2">Switch to Field mode when you work outdoors in bright sun. The sun button at the top does the same.</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
          {MODES.map((m) => {
            const active = theme === m.value;
            return (
              <button
                key={m.value}
                role="radio"
                aria-checked={active}
                onClick={() => {
                  tap();
                  setTheme(m.value);
                }}
                className="relative rounded-[22px] border p-2.5 text-left transition-[border-color,transform] duration-300 active:scale-[0.98]"
                style={{ borderColor: active ? 'var(--water)' : 'var(--glass-line)', background: active ? 'var(--water-soft)' : 'var(--surface)' }}
              >
                <ModePreview mode={m.value} />
                <div className="px-1.5 pb-1 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[16px] font-bold">{m.title}</span>
                    <span className="grid h-5 w-5 place-items-center rounded-full border-2" style={{ borderColor: active ? 'var(--water)' : 'var(--glass-line-strong)' }}>
                      {active && <motion.span layoutId="theme-dot" className="h-2.5 w-2.5 rounded-full bg-[var(--water)]" />}
                    </span>
                  </div>
                  <p className="mt-1 text-[14px] leading-snug text-ink-2">{m.hint}</p>
                </div>
              </button>
            );
          })}
        </div>
      </GlassCard>

      <motion.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}>
        <button className="btn btn-quiet" onClick={resetRules}>
          Reset to the default rules
        </button>
      </motion.div>
    </Stagger>
  );
}
