import { create } from 'zustand';
import { useMemo } from 'react';
import { planZitoun } from '@sonae/engine';
import {
  DEFAULT_RULES,
  DEMO_BUYERS,
  DEMO_GROVES,
  DEMO_MILLS,
  DEMO_START,
  addDays,
  demoWeather,
  type DayWeather,
  type ZitounInput,
  type ZitounPlan,
  type ZitounRules,
} from '@sonae/shared';

export type ZScenario = 'demo' | 'live';

export interface Storm {
  id: string;
  day: number;
  mm: number;
}

interface Persisted {
  scenario: ZScenario;
  rules: ZitounRules;
  storms: Storm[];
}

interface ZState extends Persisted {
  liveWeather: DayWeather[] | null;
  liveFetchedAt: string | null;
  setScenario: (s: ZScenario) => void;
  setRules: (r: ZitounRules) => void;
  resetRules: () => void;
  addStorm: (s: Storm) => void;
  removeStorm: (id: string) => void;
  setLiveWeather: (w: DayWeather[]) => void;
}

const KEY = 'sonae:zitoun:v1';
const PLAN_DAYS = 7;

function load(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

const initial = load();

export const useZitoun = create<ZState>((set, get) => {
  const persist = () => {
    try {
      const { scenario, rules, storms } = get();
      localStorage.setItem(KEY, JSON.stringify({ scenario, rules, storms }));
    } catch {
      /* storage blocked: the app still works, it just forgets */
    }
  };
  return {
    scenario: initial.scenario ?? 'demo',
    rules: { ...DEFAULT_RULES, ...(initial.rules ?? {}) },
    storms: initial.storms ?? [],
    liveWeather: null,
    liveFetchedAt: null,
    setScenario: (scenario) => {
      set({ scenario });
      persist();
    },
    setRules: (rules) => {
      set({ rules });
      persist();
    },
    resetRules: () => {
      set({ rules: DEFAULT_RULES });
      persist();
    },
    addStorm: (s) => {
      set({ storms: [...get().storms, s] });
      persist();
    },
    removeStorm: (id) => {
      set({ storms: get().storms.filter((s) => s.id !== id) });
      persist();
    },
    setLiveWeather: (w) => set({ liveWeather: w, liveFetchedAt: new Date().toISOString() }),
  };
});

const todayTunis = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

/** The plan input for the current scenario, with any storms the user added. */
export function useZInput(): ZitounInput {
  const { scenario, rules, storms, liveWeather } = useZitoun();
  return useMemo(() => {
    const live = scenario === 'live' && liveWeather && liveWeather.length >= PLAN_DAYS;
    const start = live ? liveWeather[0]!.date : DEMO_START;
    const base = live ? liveWeather.slice(0, PLAN_DAYS + 1) : demoWeather(DEMO_START, PLAN_DAYS + 1);
    const weather = base.map((w, i) => {
      const extra = storms.filter((s) => s.day === i).reduce((sum, s) => sum + s.mm, 0);
      return extra ? { ...w, rainMm: w.rainMm + extra, et0Mm: Math.min(w.et0Mm, 0.9) } : w;
    });
    return { start, days: PLAN_DAYS, mills: DEMO_MILLS, groves: DEMO_GROVES, buyers: DEMO_BUYERS, weather, rules, pressing: true };
  }, [scenario, rules, storms, liveWeather]);
}

export function useZPlan(): { input: ZitounInput; plan: ZitounPlan; baseline: ZitounPlan } {
  const input = useZInput();
  const plan = useMemo(() => planZitoun(input), [input]);
  const baseline = useMemo(() => planZitoun(input, 'baseline'), [input]);
  return { input, plan, baseline };
}

/** Live 8-day forecast for the Sfax olive belt from Open-Meteo (no key needed). */
export async function fetchSfaxWeather(): Promise<DayWeather[]> {
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=34.74&longitude=10.76&daily=precipitation_sum,temperature_2m_max,et0_fao_evapotranspiration&timezone=Africa%2FTunis&forecast_days=8';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather service answered ${res.status}`);
  const j = (await res.json()) as { daily: { time: string[]; precipitation_sum: number[]; temperature_2m_max: number[]; et0_fao_evapotranspiration: number[] } };
  return j.daily.time.map((date, i) => ({
    date,
    rainMm: j.daily.precipitation_sum[i] ?? 0,
    tMaxC: j.daily.temperature_2m_max[i] ?? 20,
    et0Mm: j.daily.et0_fao_evapotranspiration[i] ?? 2,
  }));
}

export { addDays, todayTunis };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Tomorrow", or the weekday, for plan day `i`. */
export function planDayLabel(i: number, date: string): string {
  if (i === 0) return 'Today';
  if (i === 1) return 'Tomorrow';
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
}

export function shortDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]!.slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
