import { create } from 'zustand';
import { useMemo, useSyncExternalStore } from 'react';
import type { ZitounInput, ZitounPlan } from '@sonae/shared';
import { useSonae } from './store';
import { useZPlan } from './zitoun';

/**
 * The living olive region behind every page. Pages tell the scene which moment of the
 * 7-day plan to show (cursor in days: 1.5 = tomorrow at noon) and whether to force rain.
 * The camera pose follows the current route.
 */
export type ScenePose = 'plan' | 'twin' | 'yui' | 'replay' | 'settings';

interface SceneStore {
  cursor: number;
  forceRain: boolean;
  setCursor: (c: number) => void;
  setForceRain: (f: boolean) => void;
}

/** Day 0 at 10:00: tankers on the road. */
export const DEFAULT_CURSOR = 10 / 24;

export const useScene = create<SceneStore>((set) => ({
  cursor: DEFAULT_CURSOR,
  forceRain: false,
  setCursor: (cursor) => set({ cursor }),
  setForceRain: (forceRain) => set({ forceRain }),
}));

export const poseFor = (path: string): ScenePose =>
  path.startsWith('/twin') ? 'twin' : path.startsWith('/yui') ? 'yui' : path.startsWith('/replay') ? 'replay' : path.startsWith('/settings') ? 'settings' : 'plan';

/* ── What the region looks like at one moment ───────────────────────── */

export interface TruckState {
  key: string;
  kind: 'margine' | 'grignon';
  from: [number, number];
  to: [number, number];
  /** 0 → 1: out (loaded), unload, back (empty). */
  phase: number;
  loaded: boolean;
  unloading: boolean;
  m3: number;
  toId: string;
}

export interface RegionState {
  day: number;
  hour: number;
  date: string;
  rainMm: number;
  /** 0..1, drives clouds and rain drops. */
  rain: number;
  blocked: boolean;
  blockReason: string | null;
  ponds: Array<{ id: string; share: number; m3: number; overflow: boolean }>;
  groves: Array<{ id: string; share: number; allowed: boolean; reason: string | null; receiving: boolean; todayM3: number }>;
  trucks: TruckState[];
  buyersServed: string[];
  spreadSoFarM3: number;
  pondAvg: number;
}

const WORK_START = 7;
const WORK_HOURS = 10;

export function regionAt(input: ZitounInput, plan: ZitounPlan, cursor: number, forceRain: boolean): RegionState {
  const maxC = plan.days.length - 0.001;
  const c = Math.max(0, Math.min(maxC, cursor));
  const d = Math.floor(c);
  const hour = (c - d) * 24;
  const day = plan.days[d]!;
  const work = Math.max(0, Math.min(1, (hour - WORK_START) / WORK_HOURS));

  // Ponds glide from yesterday's level to tonight's.
  const ponds = input.mills.map((m) => {
    const start = d === 0 ? m.pondM3 : plan.days[d - 1]!.pondEnd[m.id]!;
    const end = day.pondEnd[m.id]!;
    const m3 = start + (end - start) * work;
    return { id: m.id, m3, share: m3 / m.pondCapacityM3, overflow: (day.overflow[m.id] ?? 0) > 0 && work > 0.5 };
  });

  // Trucks: each tanker does its trips one after another in the working day.
  const trucks: TruckState[] = [];
  const receiving = new Map<string, number>();
  let spreadToday = 0;
  for (const m of input.mills) {
    const trips = day.trips.filter((t) => t.millId === m.id);
    const perTruck = input.rules.tripsPerTruckDay;
    const slotLen = 1 / perTruck;
    for (let k = 0; k < m.trucks; k++) {
      const mine = trips.filter((t) => t.truck === k);
      for (const t of mine) {
        const t0 = t.slot * slotLen;
        if (work >= t0 + slotLen * 0.5) spreadToday += t.m3;
      }
      if (work <= 0 || work >= 1) continue;
      const slot = Math.floor(work / slotLen);
      const trip = mine.find((t) => t.slot === slot);
      if (!trip) continue;
      const phase = (work - slot * slotLen) / slotLen;
      const g = input.groves.find((x) => x.id === trip.groveId)!;
      const unloading = phase > 0.45 && phase < 0.55;
      if (unloading) receiving.set(g.id, (receiving.get(g.id) ?? 0) + trip.m3);
      trucks.push({ key: `${m.id}-${k}`, kind: 'margine', from: m.pos, to: g.pos, phase, loaded: phase < 0.5, unloading, m3: trip.m3, toId: g.id });
    }
  }

  // Grignon trucks run in the morning, 08:00 to 12:00.
  const gPhase = (hour - 8) / 4;
  const buyersServed: string[] = [];
  for (const g of day.grignon) {
    const mill = input.mills.find((m) => m.id === g.millId)!;
    const buyer = input.buyers.find((b) => b.id === g.buyerId)!;
    if (gPhase > 0.5) buyersServed.push(buyer.id);
    if (gPhase <= 0 || gPhase >= 1) continue;
    trucks.push({ key: `g-${g.millId}-${g.buyerId}`, kind: 'grignon', from: mill.pos, to: buyer.pos, phase: gPhase, loaded: gPhase < 0.5, unloading: gPhase > 0.45 && gPhase < 0.55, m3: g.tonnes, toId: buyer.id });
  }

  // Grove soil darkens as its season cap fills.
  const appliedBefore = new Map(input.groves.map((g) => [g.id, g.appliedM3]));
  for (let i = 0; i < d; i++) for (const [gid, v] of Object.entries(plan.days[i]!.applied)) appliedBefore.set(gid, appliedBefore.get(gid)! + v);
  const groves = input.groves.map((g) => {
    const check = plan.groves.find((x) => x.groveId === g.id)!;
    const today = day.applied[g.id] ?? 0;
    const share = (appliedBefore.get(g.id)! + today * work) / check.capM3;
    return { id: g.id, share: Math.min(1, share), allowed: check.allowed, reason: check.reason, receiving: receiving.has(g.id), todayM3: today };
  });

  let spreadBefore = 0;
  for (let i = 0; i < d; i++) spreadBefore += plan.days[i]!.trips.reduce((s, t) => s + t.m3, 0);

  const rainMm = forceRain ? Math.max(20, day.rainMm) : day.rainMm;
  const rain = rainMm < 1 ? 0 : Math.min(1, 0.25 + rainMm / 25);
  const totalCap = input.mills.reduce((s, m) => s + m.pondCapacityM3, 0);
  return {
    day: d,
    hour,
    date: day.date,
    rainMm,
    rain,
    blocked: day.blocked || forceRain,
    blockReason: forceRain ? 'Raining now: spreading stops' : day.blockReason,
    ponds,
    groves,
    trucks: forceRain ? trucks.filter((t) => t.kind === 'grignon') : trucks,
    buyersServed,
    spreadSoFarM3: spreadBefore + spreadToday,
    pondAvg: ponds.reduce((s, p) => s + p.m3, 0) / totalCap,
  };
}

/** The region the scene is showing right now. */
export function useRegionState(): RegionState {
  const { input, plan } = useZPlan();
  const cursor = useScene((s) => s.cursor);
  const forceRain = useScene((s) => s.forceRain);
  return useMemo(() => regionAt(input, plan, cursor, forceRain), [input, plan, cursor, forceRain]);
}

const lightQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null;

/** True when Field (sunlight) mode is showing. */
export function useFieldMode(): boolean {
  const theme = useSonae((s) => s.theme);
  const systemLight = useSyncExternalStore(
    (cb) => {
      lightQuery?.addEventListener('change', cb);
      return () => lightQuery?.removeEventListener('change', cb);
    },
    () => !!lightQuery?.matches,
    () => false,
  );
  return theme === 'light' || (theme === 'system' && systemLight);
}
