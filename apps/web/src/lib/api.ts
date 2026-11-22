import { create } from 'zustand';
import type { DayWeather } from '@sonae/shared';
import type { MargineAdvice } from '@sonae/engine';

/** The Sonae API (Claude features). Set VITE_API_URL for a deployed server; phones need a reachable URL. */
export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8787').replace(/\/$/, '');

export class ApiError extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(`Can't reach the Sonae server at ${API_URL}. Start it with "npm run dev:api", or set VITE_API_URL.`);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(json.error ?? `The server answered ${res.status}.`);
  return json as T;
}

export interface LabReading {
  isMargineAnalysis: boolean;
  labName: string | null;
  sampleDate: string | null;
  sampleLabel: string | null;
  ph: number | null;
  potassiumGL: number | null;
  polyphenolsGL: number | null;
  ecDsM: number | null;
  codGL: number | null;
  dryMatterPct: number | null;
  confidence: number;
  notes: string;
}

export const readLabReport = (body: { text?: string; imageBase64?: string; imageType?: string; pdfBase64?: string }) => post<{ reading: LabReading; advice: MargineAdvice | null }>('/zitoun/lab', body);

export const askSonae = (messages: Array<{ role: 'user' | 'assistant'; text: string }>) => post<{ answer: string; toolCalls: string[] }>('/zitoun/ask', { messages });

/** The last lab reading, so the Yui page can put its hash on a load. */
interface LabStore {
  last: { reading: LabReading; summary: string } | null;
  setLast: (r: LabStore['last']) => void;
}
export const useLab = create<LabStore>((set) => ({ last: null, setLast: (last) => set({ last }) }));

/** A one-line, stable summary of a reading: what gets hashed onto the passport. */
export function labSummary(r: LabReading): string {
  const f = (k: string, v: number | null, u: string) => (v === null ? '' : `${k} ${v}${u}`);
  return [r.labName ?? 'lab', r.sampleDate ?? '', f('pH', r.ph, ''), f('K', r.potassiumGL, ' g/L'), f('phenols', r.polyphenolsGL, ' g/L'), f('EC', r.ecDsM, ' dS/m')].filter(Boolean).join(' · ');
}

/** Real forecast for any place (Open-Meteo, called from the browser), with two past days for wet-soil checks. */
export async function forecastAt(lat: number, lng: number): Promise<DayWeather[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=precipitation_sum,temperature_2m_max,et0_fao_evapotranspiration&past_days=2&forecast_days=8&timezone=Africa%2FTunis`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather service answered ${res.status}`);
  const j = (await res.json()) as { daily: { time: string[]; precipitation_sum: number[]; temperature_2m_max: number[]; et0_fao_evapotranspiration: number[] } };
  return j.daily.time.map((date, i) => ({ date, rainMm: j.daily.precipitation_sum[i] ?? 0, tMaxC: j.daily.temperature_2m_max[i] ?? 20, et0Mm: j.daily.et0_fao_evapotranspiration[i] ?? 2 }));
}

/** Olive towns, for people who don't share their location. */
export const TOWNS: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Sfax', lat: 34.74, lng: 10.76 },
  { name: 'Sakiet Ezzit', lat: 34.81, lng: 10.76 },
  { name: 'Agareb', lat: 34.74, lng: 10.53 },
  { name: 'El Hencha', lat: 35.05, lng: 10.74 },
  { name: 'Mahrès', lat: 34.53, lng: 10.5 },
  { name: 'Jebeniana', lat: 35.03, lng: 10.91 },
  { name: 'Msaken', lat: 35.73, lng: 10.58 },
  { name: 'Sousse', lat: 35.83, lng: 10.64 },
  { name: 'Monastir', lat: 35.77, lng: 10.83 },
  { name: 'Mahdia', lat: 35.5, lng: 11.06 },
  { name: 'Kairouan', lat: 35.68, lng: 10.1 },
  { name: 'Sidi Bouzid', lat: 35.04, lng: 9.48 },
  { name: 'Gafsa', lat: 34.43, lng: 8.78 },
  { name: 'Zarzis', lat: 33.5, lng: 11.11 },
  { name: 'Medenine', lat: 33.35, lng: 10.5 },
  { name: 'Siliana', lat: 36.08, lng: 9.37 },
  { name: 'Béja', lat: 36.73, lng: 9.18 },
  { name: 'Nabeul', lat: 36.45, lng: 10.73 },
];
