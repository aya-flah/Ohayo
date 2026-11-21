import type { ReactNode } from 'react';
import { useSonae, type ThemeChoice } from '../lib/store';

function NumberField({ label, value, unit, onChange, step = 1, min = 0 }: { label: string; value: number; unit: string; onChange: (v: number) => void; step?: number; min?: number }) {
  const id = label.toLowerCase().replace(/\W+/g, '-');
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input id={id} type="number" className="field num" value={value} step={step} min={min} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="w-12 shrink-0 text-[13px] text-ink-2">{unit}</span>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="card p-5 md:p-6">
      <h2 className="font-display text-[20px] font-extrabold">{title}</h2>
      <p className="mt-1 text-[13.5px] text-ink-2">{hint}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { gda, setGda, resetGda, theme, setTheme } = useSonae();
  const set = (patch: Partial<typeof gda>) => setGda({ ...gda, ...patch });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[30px] leading-tight font-extrabold md:text-[38px]">Settings</h1>
        <p className="mt-2 max-w-[620px] text-[15px] text-ink-2">Describe your GDA's equipment. The plan updates as you type, on this device, with or without internet.</p>
      </div>

      <Section title="Tank" hint="The tank is the battery: the bigger and higher it is, the longer gravity keeps the water flowing.">
        <NumberField label="Capacity" unit="m³" value={gda.tank.capacityM3} onChange={(v) => set({ tank: { ...gda.tank, capacityM3: Math.max(10, v) } })} />
        <NumberField label="Level now" unit="m³" value={gda.tank.levelM3} onChange={(v) => set({ tank: { ...gda.tank, levelM3: Math.min(gda.tank.capacityM3, Math.max(0, v)) } })} />
        <NumberField label="Reserve kept for surprises" unit="m³" value={gda.tank.minReserveM3} onChange={(v) => set({ tank: { ...gda.tank, minReserveM3: Math.max(0, v) } })} />
        <NumberField label="Height above the plots" unit="m" value={gda.tank.headM} onChange={(v) => set({ tank: { ...gda.tank, headM: Math.max(0, v) } })} />
        <NumberField label="Gravity flow to the plots" unit="m³/h" value={gda.gravityFlowM3h} onChange={(v) => set({ gravityFlowM3h: Math.max(1, v) })} />
      </Section>

      <Section title="Pump and energy" hint="Sonae picks the cheapest safe energy each hour: sun first, the grid in low-risk hours, diesel only against a real shortage.">
        <NumberField label="Pump flow" unit="m³/h" value={gda.pump.flowM3h} onChange={(v) => set({ pump: { ...gda.pump, flowM3h: Math.max(1, v) } })} />
        <NumberField label="Pump power" unit="kW" value={gda.pump.powerKW} onChange={(v) => set({ pump: { ...gda.pump, powerKW: Math.max(0.1, v) } })} step={0.5} />
        <NumberField label="Solar panels" unit="kWp" value={gda.solar?.kWp ?? 0} onChange={(v) => set({ solar: v > 0 ? { kWp: v } : undefined })} />
        <div>
          <span className="label">Diesel generator</span>
          <label className="flex items-center gap-2.5 text-[14px]">
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent-strong)]" checked={!!gda.diesel?.available} onChange={(e) => set({ diesel: { ...(gda.diesel ?? { litersPerHour: 5, costTNDPerLiter: 2.2 }), available: e.target.checked } })} />
            Available as a last resort
          </label>
        </div>
      </Section>

      <section className="card p-5 md:p-6">
        <h2 className="font-display text-[20px] font-extrabold">Appearance</h2>
        <div className="mt-4 inline-flex rounded-[11px] border border-line bg-surface p-1" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as ThemeChoice[]).map((t) => (
            <button key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} className={`rounded-[8px] px-3.5 py-1.5 text-[13.5px] capitalize transition-colors duration-150 ${theme === t ? 'bg-accent-strong text-on-accent' : 'text-ink-2 hover:text-ink'}`}>
              {t === 'system' ? 'Match device' : t}
            </button>
          ))}
        </div>
      </section>

      <button className="btn btn-quiet" onClick={resetGda}>
        Reset to the demo GDA
      </button>
    </div>
  );
}
