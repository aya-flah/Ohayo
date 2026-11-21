import {
  CROPS,
  addHours,
  floorHour,
  localHour,
  toMs,
  toTunisISO,
  HOUR,
  type ForecastHour,
  type GDA,
  type Outage,
  type Plot,
} from '@sonae/shared';
import { planCore, type PlanOptions } from './plan';
import { plotNeedM3 } from './water';

const DAY_MS = 24 * HOUR;

/** Small, fast, seeded random generator so every replay is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ModelledCut {
  startMs: number;
  endMs: number;
  announced: boolean;
}

export interface CutModel {
  /** Days hotter than this can get a cut. */
  minTempC: number;
  /** Chance of a cut rises from 0 at minTempC to `maxChance` at minTempC + 10. */
  maxChance: number;
  /** Shortest and longest cut, hours. */
  durationHours: [number, number];
  /** Cuts start between these local hours (the afternoon peak). */
  startWindow: [number, number];
  /** Share of cuts STEG announces the day before. */
  announcedShare: number;
}

export const DEFAULT_CUT_MODEL: CutModel = {
  minTempC: 38,
  maxChance: 0.7,
  durationHours: [2, 6],
  startWindow: [11, 18],
  announcedShare: 0.6,
};

/**
 * STEG publishes no outage log, so cuts are modelled from heat: the hotter the
 * day, the likelier an afternoon cut. Say so on screen.
 */
export function modelCuts(hourly: ForecastHour[], seed: number, model: CutModel = DEFAULT_CUT_MODEL): ModelledCut[] {
  const rng = mulberry32(seed);
  const byDay = new Map<number, number>();
  for (const h of hourly) {
    const ms = toMs(h.time);
    const day = floorHour(ms - localHour(ms) * HOUR);
    byDay.set(day, Math.max(byDay.get(day) ?? -99, h.tempC));
  }
  const cuts: ModelledCut[] = [];
  for (const [day, tMax] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    const chance = Math.min(model.maxChance, Math.max(0, ((tMax - model.minTempC) / 10) * model.maxChance));
    const roll = rng();
    const durRoll = rng();
    const startRoll = rng();
    const annRoll = rng();
    if (roll >= chance) continue;
    const [dMin, dMax] = model.durationHours;
    const duration = dMin + Math.floor(durRoll * (dMax - dMin + 1));
    const [sMin, sMax] = model.startWindow;
    const latest = Math.max(sMin, sMax - duration);
    const startHour = sMin + Math.floor(startRoll * (latest - sMin + 1));
    const startMs = day + startHour * HOUR;
    cuts.push({ startMs, endMs: startMs + duration * HOUR, announced: annRoll < model.announcedShare });
  }
  return cuts;
}

export interface SeasonKpis {
  /** Days when at least one plot got less than 90% of its need. */
  daysShort: number;
  demandM3: number;
  deliveredM3: number;
  deliveredPct: number;
  /** Plot-days below 70% of need. */
  plotStressDays: number;
  dieselL: number;
  dieselTND: number;
  kWhGrid: number;
  kWhPeak: number;
  kWhSolar: number;
  /** Best-served minus worst-served plot, in % of need over the season. */
  fairnessGapPct: number;
  /** Area-weighted yield loss estimate (FAO-33: 1 - Ya/Ym = Ky (1 - ETa/ETm)). */
  yieldLossPct: number;
}

export interface ReplayParams {
  gda: GDA;
  plots: Plot[];
  /** Hourly weather for the whole season (real Open-Meteo history in the app). */
  hourly: ForecastHour[];
  seed: number;
  cutModel?: CutModel;
  /** ±share of noise on the ET0 the planner sees (forecasts are never perfect). */
  forecastNoise?: number;
}

export interface ReplayRun {
  seed: number;
  without: SeasonKpis;
  with: SeasonKpis;
  cuts: ModelledCut[];
}

interface Tally {
  demand: Map<string, number>;
  delivered: Map<string, number>;
  daysShort: number;
  plotStressDays: number;
  dieselL: number;
  kWhGrid: number;
  kWhPeak: number;
  kWhSolar: number;
}

const newTally = (): Tally => ({
  demand: new Map(),
  delivered: new Map(),
  daysShort: 0,
  plotStressDays: 0,
  dieselL: 0,
  kWhGrid: 0,
  kWhPeak: 0,
  kWhSolar: 0,
});

function finish(t: Tally, plots: Plot[], gda: GDA): SeasonKpis {
  let demand = 0;
  let delivered = 0;
  let best = 0;
  let worst = 1;
  let lossWeighted = 0;
  let area = 0;
  for (const p of plots) {
    const d = t.demand.get(p.id) ?? 0;
    const v = t.delivered.get(p.id) ?? 0;
    demand += d;
    delivered += v;
    const ratio = d > 0 ? Math.min(1, v / d) : 1;
    best = Math.max(best, ratio);
    worst = Math.min(worst, ratio);
    lossWeighted += Math.min(1, CROPS[p.crop].ky * (1 - ratio)) * p.areaM2;
    area += p.areaM2;
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    daysShort: t.daysShort,
    demandM3: Math.round(demand),
    deliveredM3: Math.round(delivered),
    deliveredPct: demand > 0 ? r1((delivered / demand) * 100) : 100,
    plotStressDays: t.plotStressDays,
    dieselL: Math.round(t.dieselL),
    dieselTND: Math.round(t.dieselL * (gda.diesel?.costTNDPerLiter ?? 0)),
    kWhGrid: Math.round(t.kWhGrid),
    kWhPeak: Math.round(t.kWhPeak),
    kWhSolar: Math.round(t.kWhSolar),
    fairnessGapPct: r1((best - worst) * 100),
    yieldLossPct: area > 0 ? r1((lossWeighted / area) * 100) : 0,
  };
}

/** Replay one season twice (without and with Sonae) under the same weather and cuts. */
export function replaySeason(params: ReplayParams): ReplayRun {
  const { gda, plots, hourly } = params;
  const cuts = modelCuts(hourly, params.seed, params.cutModel);
  const noise = params.forecastNoise ?? 0.1;
  const rng = mulberry32(params.seed ^ 0x9e3779b9);
  const byHour = new Map<number, ForecastHour>();
  for (const h of hourly) byHour.set(floorHour(toMs(h.time)), h);
  const inCut = (ms: number) => cuts.some((c) => ms < c.endMs && ms + HOUR > c.startMs);
  const kWhPerM3 = gda.pump.powerKW / gda.pump.flowM3h;
  const peak = (ms: number) => {
    const h = localHour(ms);
    return h >= gda.tariff.peakHours[0] && h < gda.tariff.peakHours[1];
  };
  const firstMs = Math.min(...hourly.map((h) => toMs(h.time)));
  const lastMs = Math.max(...hourly.map((h) => toMs(h.time)));
  const day0 = floorHour(firstMs - localHour(firstMs) * HOUR);
  const days: number[] = [];
  for (let d = day0; d + DAY_MS <= lastMs + HOUR; d += DAY_MS) days.push(d);

  const dailyNeed = (day: number) => {
    let et0 = 0;
    let rain = 0;
    for (let h = 0; h < 24; h++) {
      const f = byHour.get(addHours(day, h));
      et0 += f?.et0mm ?? 0;
      rain += f?.rainMm ?? 0;
    }
    return new Map(plots.map((p) => [p.id, plotNeedM3(p, day + 12 * HOUR, et0, rain).volumeM3]));
  };

  /* ---- Without Sonae: pump on demand while farmers irrigate, 07:00 to 18:00 ---- */
  const base = newTally();
  const shortStreak = new Map<string, number>();
  for (const day of days) {
    const need = dailyNeed(day);
    const remaining = new Map(need);
    for (let h = 7; h < 18; h++) {
      const ms = addHours(day, h);
      let capacity = gda.pump.flowM3h;
      const current = plots.find((p) => (remaining.get(p.id) ?? 0) > 0.01);
      if (!current) break;
      let energy: 'grid' | 'diesel' | 'none' = 'grid';
      if (inCut(ms)) {
        energy = gda.diesel?.available && (shortStreak.get(current.id) ?? 0) >= 2 ? 'diesel' : 'none';
      }
      if (energy === 'none') continue;
      let pumped = 0;
      for (const p of plots) {
        if (capacity <= 0.01) break;
        const r = remaining.get(p.id) ?? 0;
        if (r <= 0.01) continue;
        const give = Math.min(r, capacity);
        remaining.set(p.id, r - give);
        capacity -= give;
        pumped += give;
      }
      if (energy === 'grid') {
        base.kWhGrid += pumped * kWhPerM3;
        if (peak(ms)) base.kWhPeak += pumped * kWhPerM3;
      } else if (gda.diesel) {
        base.dieselL += (pumped / gda.pump.flowM3h) * gda.diesel.litersPerHour;
      }
    }
    let anyShort = false;
    for (const p of plots) {
      const n = need.get(p.id) ?? 0;
      const got = n - (remaining.get(p.id) ?? 0);
      base.demand.set(p.id, (base.demand.get(p.id) ?? 0) + n);
      base.delivered.set(p.id, (base.delivered.get(p.id) ?? 0) + got);
      if (n > 0 && got < 0.9 * n) anyShort = true;
      if (n > 0 && got < 0.7 * n) base.plotStressDays++;
      shortStreak.set(p.id, n > 0 && got < 0.9 * n ? (shortStreak.get(p.id) ?? 0) + 1 : 0);
    }
    if (anyShort) base.daysShort++;
  }

  /* ---- With Sonae: plan 48 h every midnight, execute the first 24 h for real ---- */
  const sonae = newTally();
  const replayWindows: Partial<PlanOptions> = {
    windows: [
      { from: 5, to: 10, label: 'morning' },
      { from: 17, to: 22, label: 'evening' },
      { from: 10, to: 17, label: 'hot' },
    ],
  };
  let tankLevel = gda.tank.levelM3;
  const debt = new Map(plots.map((p) => [p.id, 0]));
  for (const day of days) {
    const forecast: ForecastHour[] = [];
    for (let h = 0; h < 72; h++) {
      const ms = addHours(day, h);
      const f = byHour.get(ms) ?? byHour.get(ms - DAY_MS);
      if (!f) continue;
      const k = 1 + noise * (rng() * 2 - 1);
      forecast.push({ ...f, et0mm: f.et0mm * k });
    }
    const known: Outage[] = cuts
      .filter((c) => c.announced && c.endMs > day && c.startMs < day + 2 * DAY_MS)
      .map((c, i) => ({ id: `cut-${day}-${i}`, start: toTunisISO(c.startMs), end: toTunisISO(c.endMs), source: 'model' as const }));
    const core = planCore(
      {
        gda: { ...gda, tank: { ...gda.tank, levelM3: tankLevel } },
        farmers: [],
        plots: plots.map((p) => ({ ...p, fairnessDebt: debt.get(p.id) ?? 0, lastIrrigatedAt: undefined })),
        forecast,
        outages: known,
        now: toTunisISO(day),
        horizonHours: 48,
      },
      replayWindows,
    );
    const need = dailyNeed(day);
    const got = new Map(plots.map((p) => [p.id, 0]));
    // Turns deliver the TRUE need (farmers see their crops); forecast error only
    // affects how much water the plan pumped ahead into the tank.
    const planned = new Map<string, number>();
    for (const d of core.drawsByPlot) if (d.slot < 24) planned.set(d.plotId, (planned.get(d.plotId) ?? 0) + d.m3);
    const factor = (plotId: string) => {
      const p = planned.get(plotId) ?? 0;
      return p > 0 ? Math.min(2, Math.max(0.5, (need.get(plotId) ?? 0) / p)) : 1;
    };
    for (let i = 0; i < 24; i++) {
      const ms = core.slotMs[i]!;
      let pumped = core.pumpIn[i]!;
      const src = core.source[i];
      if (src === 'grid' && inCut(ms)) pumped = 0; // surprise cut: planned grid pumping lost
      const drawsHere = core.drawsByPlot.filter((d) => d.slot === i).map((d) => ({ ...d, m3: d.m3 * factor(d.plotId) }));
      const want = drawsHere.reduce((a, d) => a + d.m3, 0);
      let available = tankLevel + pumped;
      if (available < want && inCut(ms) && src !== 'solar' && gda.diesel?.available) {
        // Emergency diesel only when the tank cannot cover this hour's turns.
        const extra = Math.min(gda.pump.flowM3h - pumped, want - available);
        if (extra > 0) {
          pumped += extra;
          available += extra;
          sonae.dieselL += (extra / gda.pump.flowM3h) * gda.diesel.litersPerHour;
        }
      }
      const served = Math.min(1, want > 0 ? available / want : 1);
      for (const d of drawsHere) got.set(d.plotId, (got.get(d.plotId) ?? 0) + d.m3 * served);
      tankLevel = Math.min(gda.tank.capacityM3, Math.max(0, available - want * served));
      const kWh = core.pumpIn[i]! > 0 ? Math.min(pumped, core.pumpIn[i]!) * kWhPerM3 : 0;
      if (src === 'solar') sonae.kWhSolar += kWh;
      else if (src === 'grid' && !inCut(ms)) {
        sonae.kWhGrid += kWh;
        if (peak(ms)) sonae.kWhPeak += kWh;
      } else if (src === 'diesel' && gda.diesel) {
        sonae.dieselL += (Math.min(pumped, core.pumpIn[i]!) / gda.pump.flowM3h) * gda.diesel.litersPerHour;
      }
    }
    let anyShort = false;
    for (const p of plots) {
      const n = need.get(p.id) ?? 0;
      const g = Math.min(n, got.get(p.id) ?? 0);
      sonae.demand.set(p.id, (sonae.demand.get(p.id) ?? 0) + n);
      sonae.delivered.set(p.id, (sonae.delivered.get(p.id) ?? 0) + g);
      if (n > 0 && g < 0.9 * n) anyShort = true;
      if (n > 0 && g < 0.7 * n) sonae.plotStressDays++;
      const shortRatio = n > 0 ? Math.max(0, 1 - g / n) : 0;
      debt.set(p.id, Math.max(0, (debt.get(p.id) ?? 0) * 0.5 + shortRatio));
    }
    if (anyShort) sonae.daysShort++;
  }

  return { seed: params.seed, without: finish(base, plots, gda), with: finish(sonae, plots, gda), cuts };
}

export interface KpiRange {
  median: SeasonKpis;
  min: SeasonKpis;
  max: SeasonKpis;
}

export interface ReplaySummary {
  runs: number;
  without: KpiRange;
  with: KpiRange;
}

function rangeOf(list: SeasonKpis[]): KpiRange {
  const keys = Object.keys(list[0]!) as Array<keyof SeasonKpis>;
  const pick = (f: (sorted: number[]) => number) =>
    Object.fromEntries(keys.map((k) => [k, f(list.map((x) => x[k]).sort((a, b) => a - b))])) as unknown as SeasonKpis;
  return {
    median: pick((s) => s[Math.floor(s.length / 2)]!),
    min: pick((s) => s[0]!),
    max: pick((s) => s[s.length - 1]!),
  };
}

/** Run many seeded seasons and report the median and range of every KPI. */
export function replaySummary(params: Omit<ReplayParams, 'seed'>, seeds: number[]): ReplaySummary {
  const runs = seeds.map((seed) => replaySeason({ ...params, seed }));
  return { runs: runs.length, without: rangeOf(runs.map((r) => r.without)), with: rangeOf(runs.map((r) => r.with)) };
}

/** A synthetic hot season for tests and offline demos when real weather is not cached yet. */
export function syntheticSeason(startISO: string, days: number, seed = 1): ForecastHour[] {
  const rng = mulberry32(seed);
  const start = toMs(startISO);
  const out: ForecastHour[] = [];
  for (let d = 0; d < days; d++) {
    const heat = 36 + 9 * Math.sin((Math.PI * d) / days) + (rng() - 0.5) * 6;
    const tMax = Math.round(heat * 10) / 10;
    const tMin = tMax - 13;
    const dailyEt0 = 5.5 + (tMax - 34) * 0.3;
    for (let h = 0; h < 24; h++) {
      const ms = start + (d * 24 + h) * HOUR;
      const hour = localHour(ms);
      const x = (hour - 6) / 13;
      const rad = hour < 6 || hour > 19 ? 0 : Math.round(1000 * Math.sin(Math.PI * x) ** 1.4);
      const dd = (hour - 5 + 24) % 24;
      const warm = dd <= 10 ? (1 - Math.cos((Math.PI * dd) / 10)) / 2 : (1 + Math.cos((Math.PI * (dd - 10)) / 14)) / 2;
      out.push({ time: toTunisISO(ms), tempC: Math.round((tMin + (tMax - tMin) * warm) * 10) / 10, radiationWm2: rad, et0mm: 0, rainMm: 0 });
    }
    const dayRows = out.slice(-24);
    const total = dayRows.reduce((a, r) => a + r.radiationWm2, 0);
    for (const r of dayRows) r.et0mm = total > 0 ? (dailyEt0 * r.radiationWm2) / total : 0;
  }
  return out;
}
