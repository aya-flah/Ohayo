import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { dayBlock, groveBlock, groveCap, margineAdvice } from '@sonae/engine';
import type { DayWeather, Grove } from '@sonae/shared';
import { ApiError, askSonae, forecastAt, labSummary, readLabReport, TOWNS, useLab, type LabReading } from '../lib/api';
import { useZitoun, shortDate } from '../lib/zitoun';
import { useOnline, tap } from '../lib/device';
import { fmt } from '../lib/format';
import { IconDrop, IconLeaf, IconMessage } from '../components/Icons';
import { EASE, GlassCard, PageHeader, Pill, Rise, Segmented, Stagger } from '../components/ui';
import type { MargineAdvice } from '@sonae/engine';

type Tab = 'grove' | 'lab' | 'ask';

function Num({ id, label, unit, value, onChange, step = 1 }: { id: string; label: string; unit: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input id={id} type="number" inputMode="decimal" className="field num pr-14" min={0} step={step} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink-3">{unit}</span>
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'ok' | 'cut' | 'water' | 'solar'; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border px-4 py-3.5 text-[15px]" style={{ borderColor: `color-mix(in oklab, var(--${tone}) 40%, transparent)`, background: `color-mix(in oklab, var(--${tone}) 12%, transparent)` }}>
      {children}
    </div>
  );
}

/* ── 1. Can my grove take margine, and when? ───────────────────────── */

function GroveCheck() {
  const rules = useZitoun((s) => s.rules);
  const lab = useLab((s) => s.last);
  const online = useOnline();
  const [town, setTown] = useState('Agareb');
  const [coords, setCoords] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [area, setArea] = useState(10);
  const [slope, setSlope] = useState(3);
  const [well, setWell] = useState(400);
  const [wadi, setWadi] = useState(200);
  const [applied, setApplied] = useState(0);
  const [weather, setWeather] = useState<DayWeather[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const place = coords ?? { ...TOWNS.find((t) => t.name === town)!, label: town };

  const locate = () => {
    if (!navigator.geolocation) return setError('This device cannot share its location; pick a town instead.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'Your location' });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError('Location was not shared; pick a town instead.');
      },
      { timeout: 10_000 },
    );
  };

  const run = async () => {
    tap();
    setBusy(true);
    setError(null);
    try {
      setWeather(await forecastAt(place.lat, place.lng));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Forecast unavailable');
    } finally {
      setBusy(false);
    }
  };

  const result = useMemo(() => {
    const g: Grove = { id: 'mine', owner: 'You', phone: '', areaHa: area, pos: [0, 0], slopePct: slope, distWellM: well, distWadiM: wadi, soil: 'loam', appliedM3: applied };
    const never = groveBlock(g, rules);
    const labCap = lab ? margineAdvice(lab.reading, rules).maxM3PerHa : null;
    const perHa = labCap !== null ? Math.min(rules.capM3PerHa, labCap) : rules.capM3PerHa;
    const cap = Math.round(perHa * area);
    const left = Math.max(0, cap - applied);
    const days = weather
      ? weather.slice(2, 9).map((w, i) => {
          const blocked = dayBlock(weather, i + 2, rules);
          return { ...w, blocked, max: never || blocked ? 0 : Math.min(left, Math.round(rules.maxDoseM3PerHaDay * area)) };
        })
      : [];
    return { never, cap, left, perHa, labCap, days, capFromRules: groveCap(g, rules), next: days.find((d) => d.max > 0) };
  }, [area, slope, well, wadi, applied, weather, rules, lab]);

  const message = result.next
    ? `Sonae: grove ${area} ha near ${place.label}. Safe on ${shortDate(result.next.date)}: up to ${result.next.max} m3. Season left: ${result.left} m3.`
    : '';

  return (
    <GlassCard className="p-5 md:p-6" variants={{}}>
      <h2 className="text-[20px] font-extrabold">Can my grove take margine, and when?</h2>
      <p className="mt-1 text-[14.5px] text-ink-2">Uses the real forecast for your exact place and the same rules as the plan.</p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="label" htmlFor="town">Place</label>
          <select
            id="town"
            className="field"
            value={coords ? '__here' : town}
            onChange={(e) => {
              if (e.target.value === '__here') return;
              setCoords(null);
              setTown(e.target.value);
            }}
          >
            {coords && <option value="__here">Your location ({coords.lat.toFixed(3)}, {coords.lng.toFixed(3)})</option>}
            {TOWNS.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-quiet" onClick={locate} disabled={locating}>
          {locating ? 'Locating…' : 'Use my location'}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Num id="area" label="Grove area" unit="ha" value={area} onChange={setArea} step={0.5} />
        <Num id="slope" label="Slope" unit="%" value={slope} onChange={setSlope} />
        <Num id="well" label="To nearest well" unit="m" value={well} onChange={setWell} step={10} />
        <Num id="wadi" label="To the wadi" unit="m" value={wadi} onChange={setWadi} step={10} />
        <Num id="applied" label="Spread this season" unit="m³" value={applied} onChange={setApplied} step={5} />
      </div>
      <button className="btn btn-primary mt-4" onClick={run} disabled={busy || !online}>
        {busy ? 'Checking the forecast…' : online ? 'Check my grove' : 'Needs internet for the forecast'}
      </button>
      {error && <p className="mt-3 text-[14px]" style={{ color: 'var(--cut)' }}>{error}</p>}

      <div className="mt-5 flex flex-col gap-4">
        {result.never ? (
          <Banner tone="cut">
            <b>This grove can never receive margine.</b> {result.never}.
          </Banner>
        ) : (
          <Banner tone="ok">
            <b>This grove can receive margine.</b> Season cap {fmt(result.cap)} m³ ({result.perHa} m³/ha){result.labCap !== null && result.labCap < rules.capM3PerHa ? ', lowered by your lab result' : ''}; {fmt(result.left)} m³ left.
          </Banner>
        )}
        {weather && (
          <>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
              {result.days.map((d) => (
                <div key={d.date} className="min-w-[104px] flex-1 rounded-[16px] border border-line bg-surface px-3 py-2.5">
                  <div className="text-[13px] font-bold">{shortDate(d.date)}</div>
                  <div className="mt-1 flex items-center gap-1 text-[12.5px]" style={{ color: d.rainMm >= 1 ? 'var(--water)' : 'var(--ink-3)' }}>
                    <IconDrop width={12} height={12} /> <span className="num">{fmt(d.rainMm, d.rainMm % 1 ? 1 : 0)} mm</span>
                  </div>
                  <div className="num mt-1.5 text-[16px] font-extrabold" style={{ color: d.max > 0 ? 'var(--margine)' : 'var(--water)' }}>
                    {d.max > 0 ? `${fmt(d.max)} m³` : 'No'}
                  </div>
                  {d.blocked && <div className="text-[11.5px] leading-tight text-ink-3">{d.blocked.split(':')[0]}</div>}
                </div>
              ))}
            </div>
            {result.next ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-line bg-surface px-4 py-3">
                <span className="text-[14.5px]">
                  Next safe day: <b>{shortDate(result.next.date)}</b>, up to <b className="num">{fmt(result.next.max)} m³</b>.
                </span>
                <button
                  className="btn btn-quiet btn-sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(message);
                    tap('medium');
                  }}
                >
                  Copy for the mill
                </button>
              </div>
            ) : (
              !result.never && <Banner tone="water">No safe day in the next 7 days at {place.label}: rain or wet soil every day.</Banner>
            )}
          </>
        )}
      </div>
    </GlassCard>
  );
}

/* ── 2. Read a lab report (AI) ────────────────────────────── */

const SAMPLE_REPORT = `Laboratoire Régional d'Analyses Sfax - Bulletin n° 2611/26
Échantillon : eaux de végétation, Huilerie El Amel, prélevé le 23/11/2026
pH : 4,8
Conductivité électrique : 12,4 mS/cm
DCO : 95 g O2/L
Matière sèche : 6,2 %
Polyphénols totaux : 6 800 mg/L
Potassium (K2O) : 4,9 g/L`;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
}

function LabReader() {
  const navigate = useNavigate();
  const setLast = useLab((s) => s.setLast);
  const rules = useZitoun((s) => s.rules);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<{ reading: LabReading; advice: MargineAdvice | null } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const run = async () => {
    tap();
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      let body: Parameters<typeof readLabReport>[0] = {};
      if (file) {
        if (file.size > 6_000_000) throw new ApiError('That file is over 6 MB; send a smaller photo or PDF.');
        const b64 = await fileToBase64(file);
        body = file.type === 'application/pdf' ? { pdfBase64: b64 } : { imageBase64: b64, imageType: (['image/png', 'image/webp'].includes(file.type) ? file.type : 'image/jpeg') as 'image/jpeg' };
      }
      if (text.trim()) body.text = text.trim();
      if (!body.text && !body.imageBase64 && !body.pdfBase64) throw new ApiError('Add a photo, a PDF, or paste the report text.');
      const res = await readLabReport(body);
      setOut({ reading: res.reading, advice: res.reading.isMargineAnalysis ? margineAdvice(res.reading, rules) : null });
      tap('medium');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reading failed');
    } finally {
      setBusy(false);
    }
  };

  const r = out?.reading;
  const rows: Array<[string, string]> = r
    ? [
        ['pH', r.ph === null ? '—' : String(r.ph)],
        ['Potassium (K)', r.potassiumGL === null ? '—' : `${r.potassiumGL} g/L`],
        ['Polyphenols', r.polyphenolsGL === null ? '—' : `${r.polyphenolsGL} g/L`],
        ['Salinity (EC)', r.ecDsM === null ? '—' : `${r.ecDsM} dS/m`],
        ['COD', r.codGL === null ? '—' : `${r.codGL} g/L`],
        ['Dry matter', r.dryMatterPct === null ? '—' : `${r.dryMatterPct} %`],
      ]
    : [];

  return (
    <GlassCard className="p-5 md:p-6" variants={{}}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[20px] font-extrabold">Read a margine lab report</h2>
        <Pill tone="water">Lab reader AI</Pill>
      </div>
      <p className="mt-1 text-[14.5px] text-ink-2">Photo, scan, PDF or pasted text, in French, Arabic or English. The lab reader AI reads the values; Sonae turns them into a safe dose per hectare.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <button
          className="flex min-h-[132px] flex-col items-center justify-center gap-1.5 rounded-[18px] border border-dashed px-4 text-center transition-colors duration-200 hover:border-[var(--glass-line-strong)]"
          style={{ borderColor: file ? 'var(--ok)' : 'var(--line)', background: 'var(--surface)' }}
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) setFile(f);
          }}
        >
          <span className="text-[15px] font-semibold">{file ? file.name : 'Add a photo or PDF of the report'}</span>
          <span className="text-[13px] text-ink-3">{file ? `${fmt(file.size / 1024)} KB · tap to change` : 'JPG, PNG, WebP or PDF, up to 6 MB'}</span>
        </button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <div>
          <label className="label" htmlFor="labtext">Or paste the report text</label>
          <textarea id="labtext" className="field min-h-[104px] py-3" value={text} onChange={(e) => setText(e.target.value)} placeholder="pH 4,8 · Polyphénols 6 800 mg/L · K2O 4,9 g/L…" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? 'Reading the report…' : 'Read the report'}
        </button>
        <button
          className="btn btn-quiet"
          onClick={() => {
            setFile(null);
            setText(SAMPLE_REPORT);
          }}
        >
          Try a sample report
        </button>
      </div>
      {error && <p className="mt-3 text-[14px]" style={{ color: 'var(--cut)' }}>{error}</p>}

      <AnimatePresence>
        {r && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} className="mt-5 flex flex-col gap-4">
            {!r.isMargineAnalysis ? (
              <Banner tone="solar">This doesn&apos;t look like a margine analysis. {r.notes}</Banner>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[18px] border border-line bg-surface p-4">
                    <div className="text-[13px] font-semibold text-ink-2">
                      {r.labName ?? 'Lab'}
                      {r.sampleDate && ` · ${r.sampleDate}`} · read with {Math.round(r.confidence * 100)}% confidence
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {rows.map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-[14px] text-ink-2">{k}</dt>
                          <dd className="num text-right text-[14.5px] font-bold">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {r.notes && <p className="mt-3 text-[13px] text-ink-3">{r.notes}</p>}
                  </div>
                  {out?.advice && (
                    <div className="rounded-[18px] border p-4" style={{ borderColor: `color-mix(in oklab, var(--${out.advice.spreadable ? 'ok' : 'cut'}) 40%, transparent)` }}>
                      <div className="text-[13px] font-semibold text-ink-2">Sonae&apos;s advice</div>
                      <div className="mt-1 text-[24px] font-extrabold" style={{ color: out.advice.spreadable ? 'var(--ok)' : 'var(--cut)' }}>
                        {out.advice.spreadable ? `Up to ${out.advice.maxM3PerHa} m³/ha this season` : 'Do not spread yet'}
                      </div>
                      {out.advice.k2oKgPerHa !== null && out.advice.spreadable && <div className="text-[14px] text-ink-2">≈ {out.advice.k2oKgPerHa} kg K₂O per hectare at that dose</div>}
                      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[13.5px] text-ink-2">
                        {out.advice.reasons.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setLast({ reading: r, summary: labSummary(r) });
                      navigate('/yui');
                    }}
                  >
                    Use this reading on the passport
                  </button>
                  <button className="btn btn-quiet btn-sm" onClick={() => setLast({ reading: r, summary: labSummary(r) })}>
                    Apply to my grove check
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

/* ── 3. Ask Sonae (AI with the planner as tools) ─────────── */

const SUGGESTIONS = [
  'When can I spread margine near Agareb this week, for a 10 ha grove?',
  'My grove is 70 m from a drinking-water well. Can it receive margine?',
  'How full will the demo mills’ ponds be at the end of the week?',
  'Chnoua n3amel bel margine ki tsob chta ghodwa?',
];

const TOOL_LABEL: Record<string, string> = { spreading_forecast: 'forecast', check_grove: 'grove check', demo_region_plan: '7-day plan' };

function AskSonae() {
  const online = useOnline();
  const [msgs, setMsgs] = useState<Array<{ role: 'user' | 'assistant'; text: string; tools?: string[] }>>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [msgs, busy]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    tap();
    const next = [...msgs, { role: 'user' as const, text: question }];
    setMsgs(next);
    setQ('');
    setBusy(true);
    setError(null);
    try {
      const res = await askSonae(next.map(({ role, text: t }) => ({ role, text: t.slice(0, 2000) })));
      setMsgs([...next, { role: 'assistant', text: res.answer, tools: res.toolCalls }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No answer');
      setMsgs(msgs);
      setQ(question);
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard className="p-5 md:p-6" variants={{}}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[20px] font-extrabold">
          <IconMessage width={20} height={20} /> Ask Sonae
        </h2>
        <Pill tone="water">AI · real forecasts</Pill>
      </div>
      <p className="mt-1 text-[14.5px] text-ink-2">Ask in Derja, Arabic, French or English. Sonae answers with the planner and the real weather, never with guesses.</p>

      <div className="mt-4 flex max-h-[460px] min-h-[140px] flex-col gap-3 overflow-y-auto rounded-[18px] border border-line bg-surface p-3">
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip text-left" onClick={() => send(s)} disabled={!online || busy}>
                <span className="text-ink">{s}</span>
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={`max-w-[88%] rounded-[18px] px-3.5 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'self-end rounded-br-[6px]' : 'self-start rounded-bl-[6px]'}`} style={{ background: m.role === 'user' ? 'color-mix(in oklab, var(--water) 22%, var(--surface-2))' : 'var(--surface-2)' }}>
            {m.text.replace(/\*\*(.+?)\*\*/g, '$1')}
            {m.tools && m.tools.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {[...new Set(m.tools)].map((t) => (
                  <span key={t} className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ color: 'var(--olive)', background: 'var(--olive-soft)' }}>
                    used: {TOOL_LABEL[t] ?? t}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
        {busy && <div className="self-start rounded-[18px] bg-surface-2 px-3.5 py-2.5 text-[14px] text-ink-3">Sonae is checking the plan and the forecast…</div>}
        <div ref={end} />
      </div>
      {error && <p className="mt-2 text-[14px]" style={{ color: 'var(--cut)' }}>{error}</p>}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
      >
        <label htmlFor="ask" className="sr-only">Your question</label>
        <input id="ask" className="field flex-1" placeholder={online ? 'Ask about your grove, your mill or the weather…' : 'Offline: Ask Sonae needs internet'} value={q} onChange={(e) => setQ(e.target.value)} maxLength={2000} disabled={!online} />
        <button className="btn btn-primary" disabled={!online || busy || !q.trim()}>
          Ask
        </button>
      </form>
    </GlassCard>
  );
}

export default function CheckPage() {
  const [tab, setTab] = useState<Tab>('grove');
  return (
    <Stagger className="flex flex-col gap-6">
      <PageHeader
        kanji="診"
        eyebrow="Check · real data, right now"
        title={
          <>
            Check your grove, read your lab report, <span className="text-gradient-water">ask Sonae</span>
          </>
        }
        aside={
          <Segmented
            label="Tool"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'grove', label: <><IconLeaf width={16} height={16} /> My grove</>, tone: 'ok' },
              { value: 'lab', label: 'Lab report' },
              { value: 'ask', label: 'Ask Sonae' },
            ]}
          />
        }
      >
        Not a simulation: these tools use your own numbers, the real weather where you are, and AI to read documents and answer questions.
      </PageHeader>
      <Rise>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: EASE }}>
            {tab === 'grove' ? <GroveCheck /> : tab === 'lab' ? <LabReader /> : <AskSonae />}
          </motion.div>
        </AnimatePresence>
      </Rise>
    </Stagger>
  );
}
