import { create } from 'zustand';
import { useMemo } from 'react';
import { plan as buildPlan } from '@sonae/engine';
import {
  DEMO_FARMERS,
  DEMO_GDA,
  demoForecast,
  demoOutages,
  demoPlots,
  toMs,
  type ForecastHour,
  type GDA,
  type Outage,
  type PlanInput,
} from '@sonae/shared';

/** The pitch story starts here: Monday 20 July 2026, 14:00, Kairouan. */
export const DEMO_NOW = '2026-07-20T14:00:00+01:00';

export type Scenario = 'demo' | 'live';
export type ThemeChoice = 'system' | 'light' | 'dark';

interface Persisted {
  scenario: Scenario;
  gda: GDA;
  extraOutages: Outage[];
  theme: ThemeChoice;
}

interface SonaeState extends Persisted {
  liveForecast: ForecastHour[] | null;
  liveFetchedAt: string | null;
  setScenario: (s: Scenario) => void;
  setGda: (g: GDA) => void;
  resetGda: () => void;
  addOutage: (o: Outage) => void;
  removeOutage: (id: string) => void;
  setLiveForecast: (f: ForecastHour[]) => void;
  setTheme: (t: ThemeChoice) => void;
}

const KEY = 'sonae:v1';

function load(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

function save(s: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode or storage blocked: the app still works, it just forgets */
  }
}

const initial = load();

export const useSonae = create<SonaeState>((set, get) => {
  const persist = () => {
    const { scenario, gda, extraOutages, theme } = get();
    save({ scenario, gda, extraOutages, theme });
  };
  return {
    scenario: initial.scenario ?? 'demo',
    gda: initial.gda ?? DEMO_GDA,
    extraOutages: initial.extraOutages ?? [],
    theme: initial.theme ?? 'system',
    liveForecast: null,
    liveFetchedAt: null,
    setScenario: (scenario) => {
      set({ scenario });
      persist();
    },
    setGda: (gda) => {
      set({ gda });
      persist();
    },
    resetGda: () => {
      set({ gda: DEMO_GDA });
      persist();
    },
    addOutage: (o) => {
      set({ extraOutages: [...get().extraOutages, o] });
      persist();
    },
    removeOutage: (id) => {
      set({ extraOutages: get().extraOutages.filter((o) => o.id !== id) });
      persist();
    },
    setLiveForecast: (f) => set({ liveForecast: f, liveFetchedAt: new Date().toISOString() }),
    setTheme: (theme) => {
      set({ theme });
      persist();
    },
  };
});

/** The plan input for the current scenario. */
export function usePlanInput(): PlanInput {
  const { scenario, gda, extraOutages, liveForecast } = useSonae();
  return useMemo(() => {
    if (scenario === 'live' && liveForecast && liveForecast.length > 0) {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      const nowIso = new Date(now.getTime()).toISOString();
      return {
        gda,
        farmers: DEMO_FARMERS,
        plots: demoPlots(now.getTime()),
        forecast: liveForecast,
        outages: extraOutages,
        now: nowIso,
      };
    }
    const nowMs = toMs(DEMO_NOW);
    return {
      gda,
      farmers: DEMO_FARMERS,
      plots: demoPlots(nowMs),
      forecast: demoForecast(nowMs, 72, 1),
      outages: [...demoOutages(nowMs), ...extraOutages],
      now: DEMO_NOW,
    };
  }, [scenario, gda, extraOutages, liveForecast]);
}

export function usePlan() {
  const input = usePlanInput();
  const plan = useMemo(() => buildPlan(input), [input]);
  return { input, plan };
}
