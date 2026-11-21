import type { CropId, CropStage } from './types';

export interface CropInfo {
  name: string;
  nameFr: string;
  nameDerja: string;
  /** FAO-56 crop coefficients (approximate, Mediterranean conditions). */
  kc: { ini: number; mid: number; end: number };
  /** Stage lengths in days: initial, development, mid-season, late. */
  stageDays: [number, number, number, number];
  /** How much a missed watering hurts at each stage (0..1). Used for turn priority. */
  sensitivity: Record<CropStage, number>;
  /** FAO-33 yield response factor (higher = more yield lost per water lost). */
  ky: number;
}

/**
 * Values follow FAO-56 tables 11 and 12 and FAO-33, rounded. Check before
 * quoting them on stage; they are good enough for planning and the replay.
 */
export const CROPS: Record<CropId, CropInfo> = {
  tomato: {
    name: 'Tomato',
    nameFr: 'Tomate',
    nameDerja: 'tmatem',
    kc: { ini: 0.6, mid: 1.15, end: 0.8 },
    stageDays: [30, 40, 40, 25],
    sensitivity: { ini: 0.6, dev: 0.8, mid: 1.0, late: 0.5 },
    ky: 1.05,
  },
  pepper: {
    name: 'Pepper',
    nameFr: 'Piment',
    nameDerja: 'felfel',
    kc: { ini: 0.6, mid: 1.05, end: 0.9 },
    stageDays: [25, 35, 40, 20],
    sensitivity: { ini: 0.6, dev: 0.8, mid: 1.0, late: 0.6 },
    ky: 1.1,
  },
  melon: {
    name: 'Melon',
    nameFr: 'Melon',
    nameDerja: 'bettikh',
    kc: { ini: 0.5, mid: 1.05, end: 0.75 },
    stageDays: [25, 35, 40, 20],
    sensitivity: { ini: 0.5, dev: 0.7, mid: 0.9, late: 0.4 },
    ky: 1.1,
  },
  potato: {
    name: 'Potato',
    nameFr: 'Pomme de terre',
    nameDerja: 'batata',
    kc: { ini: 0.5, mid: 1.15, end: 0.75 },
    stageDays: [25, 30, 45, 30],
    sensitivity: { ini: 0.5, dev: 0.8, mid: 1.0, late: 0.5 },
    ky: 1.1,
  },
  olive: {
    name: 'Olive',
    nameFr: 'Olivier',
    nameDerja: 'zitoun',
    kc: { ini: 0.65, mid: 0.7, end: 0.7 },
    stageDays: [30, 90, 60, 90],
    sensitivity: { ini: 0.3, dev: 0.3, mid: 0.4, late: 0.3 },
    ky: 0.5,
  },
};

/** Growth stage and Kc for a crop planted `daysSincePlanting` days ago. */
export function cropStage(crop: CropId, daysSincePlanting: number): { stage: CropStage; kc: number } {
  const c = CROPS[crop];
  const [ini, dev, mid] = c.stageDays;
  const d = Math.max(0, daysSincePlanting);
  if (d < ini) return { stage: 'ini', kc: c.kc.ini };
  if (d < ini + dev) {
    const t = (d - ini) / dev;
    return { stage: 'dev', kc: c.kc.ini + t * (c.kc.mid - c.kc.ini) };
  }
  if (d < ini + dev + mid) return { stage: 'mid', kc: c.kc.mid };
  const late = c.stageDays[3];
  const t = Math.min(1, (d - ini - dev - mid) / late);
  return { stage: 'late', kc: c.kc.mid + t * (c.kc.end - c.kc.mid) };
}

/** Share of water that actually reaches the roots. */
export const IRRIGATION_EFFICIENCY = { drip: 0.9, furrow: 0.6 } as const;
