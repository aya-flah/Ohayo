import {
  CROPS,
  addHours,
  floorHour,
  localHour,
  toMs,
  toTunisISO,
  HOUR,
  type CropStage,
  type EnergySource,
  type ForecastHour,
  type Plan,
  type PlanAlert,
  type PlanInput,
  type Plot,
  type PumpSlot,
  type Turn,
} from '@sonae/shared';
import { daysBetween, plotNeedM3 } from './water';

export type WindowLabel = 'morning' | 'evening' | 'night' | 'hot';

export interface PlanOptions {
  /** Fill target at the start of an announced cut, as a share of tank capacity. */
  preCutFill: number;
  /** Extra TND per kWh times the cut risk, so critical pumping avoids risky hours. */
  riskPenaltyTNDPerKWh: number;
  /** Extra TND per m³ pumped with diesel, so diesel stays the last resort. */
  dieselPenaltyTNDPerM3: number;
  /** A solar slot can run the pump when PV output reaches this share of pump power. */
  solarThreshold: number;
  /** Irrigation windows in local hours, in order of preference. `to` may pass 24 (next day). */
  windows: Array<{ from: number; to: number; label: WindowLabel }>;
}

export const DEFAULT_OPTIONS: PlanOptions = {
  preCutFill: 0.9,
  riskPenaltyTNDPerKWh: 1.0,
  dieselPenaltyTNDPerM3: 0.5,
  solarThreshold: 0.8,
  windows: [
    { from: 5, to: 10, label: 'morning' },
    { from: 17, to: 22, label: 'evening' },
    { from: 22, to: 29, label: 'night' },
    { from: 10, to: 17, label: 'hot' },
  ],
};

const EPS = 1e-6;
const DAY_MS = 24 * HOUR;

const STAGE_WORDS: Record<CropStage, string> = {
  ini: 'young',
  dev: 'growing',
  mid: 'flowering',
  late: 'ripening',
};

/** Chance (0..1) that STEG cuts the grid in a hot afternoon hour. */
export function heatRisk(tempC: number, hour: number): number {
  if (hour < 11 || hour >= 19) return 0;
  return Math.min(1, Math.max(0, (tempC - 38) / 8)) * 0.35;
}

interface TurnDraft {
  plot: Plot;
  dateMs: number;
  dateIndex: number;
  requestedM3: number;
  volumeM3: number;
  priority: number;
  stage: CropStage;
  startMs?: number;
  endMs?: number;
  window?: WindowLabel;
  shares: Array<{ slot: number; m3: number }>;
}

/** The plan plus the hour-by-hour numbers behind it (used by the Replay). */
export interface PlanCore {
  plan: Plan;
  slotMs: number[];
  pumpIn: number[];
  draw: number[];
  source: Array<EnergySource | undefined>;
  drawsByPlot: Array<{ plotId: string; slot: number; m3: number }>;
}

/**
 * Build the 48-hour plan: when to pump and with which energy, the tank level
 * hour by hour, and the irrigation turns (bansui rotation). Deterministic and
 * explainable: every pump hour and every turn carries a reason.
 */
export function plan(input: PlanInput, options: Partial<PlanOptions> = {}): Plan {
  return planCore(input, options).plan;
}

export function planCore(input: PlanInput, options: Partial<PlanOptions> = {}): PlanCore {
  const opt: PlanOptions = { ...DEFAULT_OPTIONS, ...options };
  const { gda } = input;
  const H = input.horizonHours ?? 48;
  const nowMs = toMs(input.now);
  const start = floorHour(nowMs);
  const endMs = addHours(start, H);
  const alerts: PlanAlert[] = [];

  /* ---------- 1. Hourly conditions ---------- */
  const fcByHour = new Map<number, ForecastHour>();
  for (const f of input.forecast) fcByHour.set(floorHour(toMs(f.time)), f);
  let usedFallback = false;
  const fcAt = (ms: number): ForecastHour => {
    const exact = fcByHour.get(ms);
    if (exact) return exact;
    for (let back = 1; back <= 3; back++) {
      const prev = fcByHour.get(ms - back * DAY_MS);
      if (prev) {
        usedFallback = true;
        return prev;
      }
    }
    usedFallback = true;
    return { time: toTunisISO(ms), tempC: 30, radiationWm2: 0, et0mm: 0.25, rainMm: 0 };
  };

  const slotMs = Array.from({ length: H }, (_, i) => addHours(start, i));
  const fc = slotMs.map(fcAt);
  const outageIdx = new Set<number>();
  for (const o of input.outages) {
    const os = toMs(o.start);
    const oe = toMs(o.end);
    slotMs.forEach((ms, i) => {
      if (os < ms + HOUR && oe > ms) outageIdx.add(i);
    });
  }
  const risk = fc.map((f, i) => (outageIdx.has(i) ? 1 : heatRisk(f.tempC, localHour(slotMs[i]!))));

  const kWhPerM3 = gda.pump.powerKW / gda.pump.flowM3h;
  const solarKW = (rad: number) => (gda.solar ? gda.solar.kWp * (rad / 1000) * 0.8 : 0);
  const inPeak = (ms: number) => {
    const h = localHour(ms);
    return h >= gda.tariff.peakHours[0] && h < gda.tariff.peakHours[1];
  };
  const source: Array<EnergySource | undefined> = fc.map((f, i) => {
    if (solarKW(f.radiationWm2) >= opt.solarThreshold * gda.pump.powerKW) return 'solar';
    if (!outageIdx.has(i)) return 'grid';
    if (gda.diesel?.available) return 'diesel';
    return undefined;
  });
  const costPerM3 = source.map((s, i) => {
    if (s === 'solar') return 0;
    if (s === 'grid') {
      const tariff = inPeak(slotMs[i]!) ? gda.tariff.peakTNDPerKWh : gda.tariff.gridTNDPerKWh;
      return kWhPerM3 * (tariff + risk[i]! * opt.riskPenaltyTNDPerKWh);
    }
    if (s === 'diesel' && gda.diesel) {
      return (gda.diesel.litersPerHour / gda.pump.flowM3h) * gda.diesel.costTNDPerLiter + opt.dieselPenaltyTNDPerM3;
    }
    return Number.POSITIVE_INFINITY;
  });

  /* ---------- 2. Turns: one per plot per irrigation day ---------- */
  const firstDate = floorHour(start - localHour(start) * HOUR);
  const dates: number[] = [];
  for (let d = firstDate; d < endMs; d += DAY_MS) dates.push(d);

  const dayEt0 = (dateMs: number) => {
    let et0 = 0;
    let rain = 0;
    for (let h = 0; h < 24; h++) {
      const f = fcAt(addHours(dateMs, h));
      et0 += f.et0mm;
      rain += f.rainMm;
    }
    return { et0, rain };
  };

  const drafts: TurnDraft[] = [];
  dates.forEach((dateMs, dateIndex) => {
    const { et0, rain } = dayEt0(dateMs);
    input.plots.forEach((plot, plotIndex) => {
      if (plot.lastIrrigatedAt) {
        const last = toMs(plot.lastIrrigatedAt);
        if (last >= dateMs && last < dateMs + DAY_MS) return; // already watered that day
      }
      const need = plotNeedM3(plot, dateMs + 12 * HOUR, et0, rain);
      if (need.volumeM3 < 0.5) return;
      const lastMs = plot.lastIrrigatedAt ? toMs(plot.lastIrrigatedAt) : dateMs - DAY_MS;
      const stressDays = Math.max(1, daysBetween(lastMs, dateMs));
      const sensitivity = CROPS[plot.crop].sensitivity[need.stage];
      const n = input.plots.length;
      const rotation = ((plotIndex + dateIndex * 7) % n) / (n * 1000); // rotates ties day to day
      const priority = sensitivity * (1 + 0.25 * (stressDays - 1)) + 0.1 * plot.fairnessDebt + rotation;
      drafts.push({
        plot,
        dateMs,
        dateIndex,
        requestedM3: need.volumeM3,
        volumeM3: need.volumeM3,
        priority,
        stage: need.stage,
        shares: [],
      });
    });
  });

  // Pack each day's turns into its windows, highest priority first.
  const flow = gda.gravityFlowM3h;
  const scheduleStart = Math.max(nowMs, start);
  for (const dateMs of dates) {
    const queue = drafts.filter((t) => t.dateMs === dateMs).sort((a, b) => b.priority - a.priority);
    for (const w of opt.windows) {
      if (queue.length === 0) break;
      const wStart = Math.max(addHours(dateMs, w.from), scheduleStart);
      const wEnd = Math.min(addHours(dateMs, w.to), endMs);
      let cursor = wStart;
      while (queue.length > 0 && cursor < wEnd) {
        const t = queue[0]!;
        const dur = (t.volumeM3 / flow) * HOUR;
        if (cursor + dur > wEnd + EPS) break;
        t.startMs = cursor;
        t.endMs = cursor + dur;
        t.window = w.label;
        cursor += dur;
        queue.shift();
      }
    }
    for (const t of queue) {
      const farmer = input.farmers.find((f) => f.id === t.plot.farmerId);
      const fits = addHours(dateMs, 29) <= endMs;
      if (fits) {
        alerts.push({
          level: 'critical',
          plotId: t.plot.id,
          message: `${t.plot.name} (${farmer?.name ?? 'farmer'}) has no irrigation slot left on ${toTunisISO(dateMs).slice(0, 10)}.`,
        });
      }
    }
  }
  const scheduled = drafts.filter((t) => t.startMs !== undefined);

  /* ---------- 3. Water drawn from the tank, hour by hour ---------- */
  const draw = new Array<number>(H).fill(0);
  for (const t of scheduled) {
    for (let i = 0; i < H; i++) {
      const s = slotMs[i]!;
      const overlap = Math.min(s + HOUR, t.endMs!) - Math.max(s, t.startMs!);
      if (overlap > 0) {
        const m3 = (overlap / HOUR) * flow;
        draw[i]! += m3;
        t.shares.push({ slot: i, m3 });
      }
    }
  }

  /* ---------- 4. Pump ahead: cheapest energy before every need ---------- */
  const cap = gda.tank.capacityM3;
  const minR = gda.tank.minReserveM3;
  const req = new Array<number>(H + 1).fill(minR);
  const soft = new Array<boolean>(H + 1).fill(false);
  const cutStarts: number[] = [];
  for (let i = 1; i < H; i++) {
    if (outageIdx.has(i) && !outageIdx.has(i - 1)) {
      req[i] = Math.max(minR, opt.preCutFill * cap);
      soft[i] = true;
      cutStarts.push(i);
    }
  }
  const pumpIn = new Array<number>(H).fill(0);
  const level = new Array<number>(H + 1).fill(0);
  const simulate = () => {
    level[0] = gda.tank.levelM3;
    for (let i = 0; i < H; i++) level[i + 1] = level[i]! + pumpIn[i]! - draw[i]!;
  };

  const unmetTargets = new Map<number, number>();
  for (let iter = 0; iter < 5000; iter++) {
    simulate();
    let m = -1;
    for (let q = 1; q <= H; q++) {
      if (level[q]! < req[q]! - EPS) {
        m = q;
        break;
      }
    }
    if (m === -1) break;
    const deficit = req[m]! - level[m]!;
    const hard = !soft[m] || level[m]! < minR - EPS;
    const need = hard ? Math.max(minR - level[m]!, EPS) : deficit;
    const candidates: number[] = [];
    for (let j = 0; j < m; j++) {
      if (pumpIn[j]! >= gda.pump.flowM3h - EPS) continue;
      if (!Number.isFinite(costPerM3[j]!)) continue;
      if (!hard && source[j] === 'diesel') continue;
      candidates.push(j);
    }
    candidates.sort((a, b) => costPerM3[a]! - costPerM3[b]! || risk[a]! - risk[b]! || b - a);
    let progressed = false;
    for (const j of candidates) {
      let headroom = Number.POSITIVE_INFINITY;
      for (let q = j + 1; q <= H; q++) headroom = Math.min(headroom, cap - level[q]!);
      const add = Math.min(hard ? need : deficit, gda.pump.flowM3h - pumpIn[j]!, headroom);
      if (add > EPS) {
        pumpIn[j]! += add;
        progressed = true;
        break;
      }
    }
    if (progressed) continue;
    if (!hard) {
      unmetTargets.set(m, level[m]!);
      req[m] = Math.max(minR, level[m]!);
      continue;
    }
    // Real shortage: cut the lowest-priority water drawn before slot m.
    let short = need;
    const victims = scheduled
      .filter((t) => t.shares.some((s) => s.slot < m && s.m3 > EPS))
      .sort((a, b) => a.priority - b.priority);
    for (const t of victims) {
      if (short <= EPS) break;
      for (const s of [...t.shares].filter((x) => x.slot < m).sort((a, b) => b.slot - a.slot)) {
        if (short <= EPS) break;
        const cut = Math.min(s.m3, short);
        s.m3 -= cut;
        draw[s.slot]! -= cut;
        t.volumeM3 -= cut;
        short -= cut;
      }
    }
    if (short > EPS) {
      // Nothing left to cut: accept the level (tank cannot go lower than empty).
      req[m] = level[m]!;
    }
  }
  simulate();

  /* ---------- 5. Outputs with reasons ---------- */
  const nextCutWithin = (i: number, hours: number) => cutStarts.find((c) => c > i && c - i <= hours);
  const pump: PumpSlot[] = slotMs.map((ms, i) => {
    const on = pumpIn[i]! > EPS;
    const h = localHour(ms);
    let reason: string;
    if (on) {
      const src = source[i];
      if (src === 'solar') reason = 'Solar pumping: free midday energy.';
      else if (src === 'diesel') reason = 'Diesel: no sun or grid left before a shortage.';
      else {
        const cut = nextCutWithin(i, 14);
        if (cut !== undefined) reason = `Filling the tank before the STEG cut at ${String(localHour(slotMs[cut]!)).padStart(2, '0')}:00.`;
        else if (h >= 22 || h < 6) reason = 'Night pumping: cheap energy, low cut risk.';
        else reason = 'Grid pumping in a low-risk hour.';
      }
    } else if (outageIdx.has(i)) {
      reason = source[i] === 'solar' ? 'STEG cut, tank full enough: solar not needed.' : 'STEG cut: grid off.';
    } else if (risk[i]! >= 0.2) {
      reason = 'Kept free: high risk of a cut in the heat.';
    } else {
      reason = 'Tank has enough water.';
    }
    return { time: toTunisISO(ms), on, source: on ? source[i] : undefined, risk: Math.round(risk[i]! * 100) / 100, reason };
  });

  const tank = level.map((l, i) => ({ time: toTunisISO(addHours(start, i)), levelM3: Math.round(l * 10) / 10 }));

  const turns: Turn[] = scheduled
    .filter((t) => t.volumeM3 > 0.05)
    .sort((a, b) => a.startMs! - b.startMs!)
    .map((t) => {
      const crop = CROPS[t.plot.crop];
      const when =
        t.window === 'morning'
          ? 'in the cool morning'
          : t.window === 'evening'
            ? 'in the evening'
            : t.window === 'night'
              ? 'at night'
              : 'in the heat (no cooler slot left)';
      const first = t.stage === 'mid' && t.priority >= 0.95 ? ', so it goes first' : '';
      return {
        plotId: t.plot.id,
        farmerId: t.plot.farmerId,
        start: toTunisISO(t.startMs!),
        end: toTunisISO(t.endMs!),
        volumeM3: Math.round(t.volumeM3 * 10) / 10,
        priority: Math.round(t.priority * 1000) / 1000,
        reason: `${crop.name}, ${STAGE_WORDS[t.stage]}${first}; watered ${when}.`,
      };
    });

  for (const t of scheduled) {
    if (t.window === 'hot') {
      alerts.push({ level: 'warn', plotId: t.plot.id, message: `${t.plot.name} is watered in the heat: more water is lost to evaporation.` });
    }
    const lost = t.requestedM3 - t.volumeM3;
    if (lost > 0.5) {
      alerts.push({
        level: 'critical',
        plotId: t.plot.id,
        message: `${t.plot.name} gets ${lost.toFixed(1)} m³ less than it needs (${Math.round((lost / t.requestedM3) * 100)}% short).`,
      });
    }
  }
  for (const c of cutStarts) {
    const pct = Math.round((level[c]! / cap) * 100);
    const at = String(localHour(slotMs[c]!)).padStart(2, '0');
    if (unmetTargets.has(c)) {
      alerts.push({ level: 'warn', message: `The tank only reaches ${pct}% before the STEG cut at ${at}:00 (target ${Math.round(opt.preCutFill * 100)}%).` });
    } else {
      alerts.push({ level: 'info', message: `The tank is ${pct}% full when the STEG cut starts at ${at}:00.` });
    }
  }
  if (usedFallback) alerts.push({ level: 'warn', message: 'Part of the forecast is missing; Sonae used the closest earlier day.' });

  let kWhSolar = 0;
  let kWhGrid = 0;
  let kWhPeak = 0;
  let dieselL = 0;
  let costTND = 0;
  pumpIn.forEach((m3, i) => {
    if (m3 <= EPS) return;
    const kWh = m3 * kWhPerM3;
    if (source[i] === 'solar') kWhSolar += kWh;
    else if (source[i] === 'grid') {
      kWhGrid += kWh;
      const peak = inPeak(slotMs[i]!);
      if (peak) kWhPeak += kWh;
      costTND += kWh * (peak ? gda.tariff.peakTNDPerKWh : gda.tariff.gridTNDPerKWh);
    } else if (source[i] === 'diesel' && gda.diesel) {
      const liters = (m3 / gda.pump.flowM3h) * gda.diesel.litersPerHour;
      dieselL += liters;
      costTND += liters * gda.diesel.costTNDPerLiter;
    }
  });
  const demandM3 = scheduled.reduce((a, t) => a + t.requestedM3, 0);
  const deliveredM3 = scheduled.reduce((a, t) => a + t.volumeM3, 0);
  const r1 = (x: number) => Math.round(x * 10) / 10;

  const result: Plan = {
    id: `plan-${toTunisISO(start)}`,
    createdAt: input.now,
    horizonHours: H,
    pump,
    tank,
    turns,
    alerts,
    kpis: {
      kWhSolar: r1(kWhSolar),
      kWhGrid: r1(kWhGrid),
      kWhPeak: r1(kWhPeak),
      dieselL: r1(dieselL),
      costTND: Math.round(costTND * 100) / 100,
      demandM3: r1(demandM3),
      deliveredM3: r1(deliveredM3),
      demandMetPct: demandM3 > 0 ? Math.round((deliveredM3 / demandM3) * 1000) / 10 : 100,
    },
  };
  const drawsByPlot = scheduled.flatMap((t) => t.shares.filter((s) => s.m3 > EPS).map((s) => ({ plotId: t.plot.id, slot: s.slot, m3: s.m3 })));
  return { plan: result, slotMs, pumpIn, draw, source, drawsByPlot };
}
