import { useEffect, useState } from 'react';
import { TOWNS } from '../lib/api';
import { DEFAULT_MY_MILL, type MyGrove, type MyMill } from '../lib/zitoun';
import { IconClose, IconPlus } from './Icons';
import { Sheet } from './ui';

function Field({ id, label, unit, value, onChange, step = 1 }: { id: string; label: string; unit?: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input id={id} type="number" inputMode="decimal" min={0} step={step} className={`field num ${unit ? 'pr-12' : ''}`} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} />
        {unit && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-3">{unit}</span>}
      </div>
    </div>
  );
}

const blankGrove = (n: number): MyGrove => ({ owner: `Grove ${n}`, areaHa: 10, slopePct: 2, distWellM: 500, distWadiM: 300, distKm: 3, appliedM3: 0 });

/** The manager enters their own mill and the groves that have agreed to take margine. */
export function MyMillSheet({ open, onClose, value, onSave }: { open: boolean; onClose: () => void; value: MyMill; onSave: (m: MyMill) => void }) {
  const [m, setM] = useState(value);
  useEffect(() => {
    if (open) setM(value);
  }, [open, value]);
  const set = (patch: Partial<MyMill>) => setM((x) => ({ ...x, ...patch }));
  const setGrove = (i: number, patch: Partial<MyGrove>) => setM((x) => ({ ...x, groves: x.groves.map((g, k) => (k === i ? { ...g, ...patch } : g)) }));

  return (
    <Sheet open={open} onClose={onClose} label="Your mill" className="max-h-[88dvh] max-w-[760px] overflow-y-auto">
      <h2 className="text-[22px] font-extrabold">Your mill and its groves</h2>
      <p className="mt-1 text-[14.5px] text-ink-2">Stored on this device only. The plan uses these numbers and the real forecast for your town.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="mm-name">Mill name</label>
          <input id="mm-name" className="field" value={m.name} onChange={(e) => set({ name: e.target.value.slice(0, 60) })} />
        </div>
        <div>
          <label className="label" htmlFor="mm-town">Town</label>
          <select
            id="mm-town"
            className="field"
            value={m.town}
            onChange={(e) => {
              const t = TOWNS.find((x) => x.name === e.target.value)!;
              set({ town: t.name, lat: t.lat, lng: t.lng });
            }}
          >
            {TOWNS.map((t) => (
              <option key={t.name}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field id="mm-cap" label="Pond capacity" unit="m³" value={m.pondCapacityM3} onChange={(v) => set({ pondCapacityM3: Math.max(10, v) })} step={50} />
        <Field id="mm-now" label="Pond now" unit="m³" value={m.pondM3} onChange={(v) => set({ pondM3: v })} step={10} />
        <Field id="mm-day" label="Margine per day" unit="m³" value={m.marginePerDayM3} onChange={(v) => set({ marginePerDayM3: v })} />
        <Field id="mm-g" label="Grignon per day" unit="t" value={m.grignonPerDayT} onChange={(v) => set({ grignonPerDayT: v })} />
        <Field id="mm-trucks" label="Tankers" value={m.trucks} onChange={(v) => set({ trucks: Math.max(1, Math.round(v)) })} />
        <Field id="mm-tsize" label="Tanker size" unit="m³" value={m.truckM3} onChange={(v) => set({ truckM3: Math.max(1, v) })} />
        <Field id="mm-gstock" label="Grignon now" unit="t" value={m.grignonT} onChange={(v) => set({ grignonT: v })} />
      </div>

      <h3 className="mt-6 text-[17px] font-bold">Groves that accept margine</h3>
      <div className="mt-2 flex flex-col gap-3">
        {m.groves.map((g, i) => (
          <div key={i} className="rounded-[18px] border border-line bg-surface p-3">
            <div className="flex items-center gap-2">
              <input aria-label={`Grove ${i + 1} owner`} className="field flex-1" value={g.owner} onChange={(e) => setGrove(i, { owner: e.target.value.slice(0, 40) })} />
              <button className="btn btn-quiet btn-sm" aria-label={`Remove ${g.owner}`} onClick={() => setM((x) => ({ ...x, groves: x.groves.filter((_, k) => k !== i) }))} disabled={m.groves.length <= 1}>
                <IconClose width={16} height={16} />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
              <Field id={`g${i}a`} label="Area" unit="ha" value={g.areaHa} onChange={(v) => setGrove(i, { areaHa: v })} step={0.5} />
              <Field id={`g${i}s`} label="Slope" unit="%" value={g.slopePct} onChange={(v) => setGrove(i, { slopePct: v })} />
              <Field id={`g${i}w`} label="To well" unit="m" value={g.distWellM} onChange={(v) => setGrove(i, { distWellM: v })} step={10} />
              <Field id={`g${i}d`} label="To wadi" unit="m" value={g.distWadiM} onChange={(v) => setGrove(i, { distWadiM: v })} step={10} />
              <Field id={`g${i}k`} label="From mill" unit="km" value={g.distKm} onChange={(v) => setGrove(i, { distKm: v })} step={0.5} />
              <Field id={`g${i}p`} label="Spread so far" unit="m³" value={g.appliedM3} onChange={(v) => setGrove(i, { appliedM3: v })} step={10} />
            </div>
          </div>
        ))}
        {m.groves.length < 12 && (
          <button className="btn btn-quiet self-start" onClick={() => setM((x) => ({ ...x, groves: [...x.groves, blankGrove(x.groves.length + 1)] }))}>
            <IconPlus width={17} height={17} /> Add a grove
          </button>
        )}
      </div>

      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <button className="btn btn-quiet" onClick={() => setM(DEFAULT_MY_MILL)}>
          Reset example
        </button>
        <div className="flex gap-2">
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onSave(m);
              onClose();
            }}
          >
            Save and plan
          </button>
        </div>
      </div>
    </Sheet>
  );
}
