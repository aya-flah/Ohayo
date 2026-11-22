/**
 * Sonae Zitoun: the olive-mill waste planner.
 *
 * A maâsra (olive mill) produces two wastes while it presses: margine (the dark, bitter
 * vegetation water) and grignon (the pomace). Sonae plans, every day, where the margine
 * can be spread safely on olive groves, as free water and potassium, and which hammam,
 * bakery or kiln takes the grignon as fuel.
 *
 * Scene coordinates (x, z) are in "map units" for the 3D twin; 1 unit ≈ 250 m.
 */

export type ResourceKind = 'margine' | 'grignon';

export interface Mill {
  id: string;
  name: string;
  town: string;
  pos: [number, number];
  /** Storage pond for margine (m³). */
  pondCapacityM3: number;
  /** Margine in the pond right now (m³). */
  pondM3: number;
  /** Pond surface (m²), for evaporation. */
  pondAreaM2: number;
  /** Margine produced per pressing day (m³). */
  marginePerDayM3: number;
  /** Grignon in stock (t) and produced per pressing day (t). */
  grignonT: number;
  grignonPerDayT: number;
  /** Tankers that carry this mill's margine. */
  trucks: number;
  truckM3: number;
}

export type Soil = 'sandy' | 'loam' | 'clay';

export interface Grove {
  id: string;
  owner: string;
  /** Phone, for the Derja SMS. Demo numbers only. */
  phone: string;
  areaHa: number;
  pos: [number, number];
  slopePct: number;
  /** Distance to the nearest drinking-water well and to the wadi (m). */
  distWellM: number;
  distWadiM: number;
  soil: Soil;
  /** Margine already spread this season (m³). */
  appliedM3: number;
}

export type BuyerKind = 'hammam' | 'bakery' | 'kiln' | 'greenhouse';

export interface Buyer {
  id: string;
  name: string;
  kind: BuyerKind;
  pos: [number, number];
  /** Grignon burned per week (t) and in stock now (t). */
  needTPerWeek: number;
  stockT: number;
}

export interface DayWeather {
  /** YYYY-MM-DD, Tunis time. */
  date: string;
  rainMm: number;
  tMaxC: number;
  /** Reference evapotranspiration (mm/day), drives pond evaporation. */
  et0Mm: number;
}

/** The rules every plan obeys. Defaults are cautious; check them against the current Tunisian decree. */
export interface ZitounRules {
  /** Maximum margine per hectare and per season (m³/ha). */
  capM3PerHa: number;
  /** Maximum per hectare in one day, so the soil can absorb it (m³/ha/day). */
  maxDoseM3PerHaDay: number;
  /** No spreading on a day with this much rain, or the day before it (mm). */
  rainBlockMm: number;
  /** No spreading while the soil is wet: rain over the previous two days (mm). */
  wetSoilMm: number;
  maxSlopePct: number;
  minDistWellM: number;
  minDistWadiM: number;
  /** Round trips a tanker can do in a working day. */
  tripsPerTruckDay: number;
  /** Transport cost (TND per km driven). */
  costPerKmTND: number;
  /** Potassium in margine (kg K₂O per m³) and what that fertiliser costs (TND per kg K₂O). */
  k2oKgPerM3: number;
  k2oTNDPerKg: number;
  /** What an olive grove actually needs per season (kg K₂O/ha): only this much counts as fertiliser saved. */
  k2oNeedKgPerHa: number;
  /** Grignon heat value relative to diesel: kg of dry grignon per kg of diesel replaced. */
  grignonKgPerKgDiesel: number;
  /** Sonae's fee to the mill (TND per m³ handled). */
  feeTNDPerM3: number;
  /** Map units to km. */
  kmPerUnit: number;
}

export const DEFAULT_RULES: ZitounRules = {
  capM3PerHa: 50,
  maxDoseM3PerHaDay: 10,
  rainBlockMm: 8,
  wetSoilMm: 12,
  maxSlopePct: 8,
  minDistWellM: 100,
  minDistWadiM: 50,
  tripsPerTruckDay: 4,
  costPerKmTND: 1.6,
  k2oKgPerM3: 4,
  k2oTNDPerKg: 3.2,
  k2oNeedKgPerHa: 80,
  grignonKgPerKgDiesel: 2.5,
  feeTNDPerM3: 0.5,
  kmPerUnit: 0.25,
};

export interface ZitounInput {
  /** First planned day, YYYY-MM-DD. */
  start: string;
  days: number;
  mills: Mill[];
  groves: Grove[];
  buyers: Buyer[];
  weather: DayWeather[];
  rules: ZitounRules;
  /** Mills keep pressing during the plan (true in season). */
  pressing: boolean;
}

export interface Trip {
  day: number;
  millId: string;
  groveId: string;
  truck: number;
  /** Order of this trip for the truck that day (0-based). */
  slot: number;
  m3: number;
  km: number;
  reason: string;
}

export interface GrignonDelivery {
  day: number;
  millId: string;
  buyerId: string;
  tonnes: number;
  km: number;
}

export interface GroveCheck {
  groveId: string;
  allowed: boolean;
  /** Why a grove can never receive margine (slope, well, wadi). */
  reason: string | null;
  capM3: number;
  /** Season cap left at the end of the plan. */
  remainingM3: number;
}

export interface DayPlan {
  day: number;
  date: string;
  rainMm: number;
  blocked: boolean;
  blockReason: string | null;
  trips: Trip[];
  grignon: GrignonDelivery[];
  /** Pond level per mill at the end of the day (m³). */
  pondEnd: Record<string, number>;
  /** Margine that overflowed per mill that day (m³): the pollution we try to avoid. */
  overflow: Record<string, number>;
  /** Margine applied per grove that day (m³). */
  applied: Record<string, number>;
}

export interface ZitounAlert {
  level: 'info' | 'warn' | 'critical';
  day: number;
  text: string;
}

export interface ZitounKpis {
  spreadM3: number;
  trips: number;
  km: number;
  transportTND: number;
  overflowM3: number;
  k2oKg: number;
  fertiliserTND: number;
  grignonT: number;
  dieselLitresReplaced: number;
  blockedDays: number;
  feeTND: number;
}

export interface ZitounPlan {
  days: DayPlan[];
  groves: GroveCheck[];
  alerts: ZitounAlert[];
  kpis: ZitounKpis;
}

/* ── Demo region: olive country around Sfax ─────────────────────────── */

export const DEMO_MILLS: Mill[] = [
  { id: 'm1', name: 'Maâsra El Amel', town: 'Sakiet Ezzit', pos: [-10, -5], pondCapacityM3: 1400, pondM3: 1050, pondAreaM2: 900, marginePerDayM3: 38, grignonT: 60, grignonPerDayT: 9, trucks: 2, truckM3: 15 },
  { id: 'm2', name: 'Maâsra Ben Salah', town: 'Agareb', pos: [7, -9], pondCapacityM3: 900, pondM3: 790, pondAreaM2: 600, marginePerDayM3: 30, grignonT: 35, grignonPerDayT: 7, trucks: 1, truckM3: 15 },
  { id: 'm3', name: 'Maâsra Zitouna', town: 'El Hencha', pos: [11, 6], pondCapacityM3: 2000, pondM3: 700, pondAreaM2: 1300, marginePerDayM3: 45, grignonT: 90, grignonPerDayT: 11, trucks: 2, truckM3: 18 },
];

export const DEMO_GROVES: Grove[] = [
  { id: 'g1', owner: 'Hédi Ben Ali', phone: '+216 20 000 101', areaHa: 12, pos: [-16, 2], slopePct: 2, distWellM: 900, distWadiM: 400, soil: 'loam', appliedM3: 120 },
  { id: 'g2', owner: 'Salma Trabelsi', phone: '+216 20 000 102', areaHa: 8, pos: [-6, 4], slopePct: 3, distWellM: 650, distWadiM: 300, soil: 'sandy', appliedM3: 60 },
  { id: 'g3', owner: 'Mongi Karray', phone: '+216 20 000 103', areaHa: 15, pos: [-15, -12], slopePct: 1, distWellM: 1200, distWadiM: 900, soil: 'loam', appliedM3: 300 },
  { id: 'g4', owner: 'Fatma Jemli', phone: '+216 20 000 104', areaHa: 6, pos: [-1, -3], slopePct: 2, distWellM: 70, distWadiM: 500, soil: 'loam', appliedM3: 0 },
  { id: 'g5', owner: 'Ridha Masmoudi', phone: '+216 20 000 105', areaHa: 10, pos: [3, -16], slopePct: 4, distWellM: 800, distWadiM: 700, soil: 'clay', appliedM3: 80 },
  { id: 'g6', owner: 'Nabil Ayadi', phone: '+216 20 000 106', areaHa: 9, pos: [15, -6], slopePct: 13, distWellM: 1000, distWadiM: 600, soil: 'sandy', appliedM3: 0 },
  { id: 'g7', owner: 'Amel Chaabane', phone: '+216 20 000 107', areaHa: 14, pos: [18, 12], slopePct: 2, distWellM: 1100, distWadiM: 350, soil: 'loam', appliedM3: 200 },
  { id: 'g8', owner: 'Karim Feki', phone: '+216 20 000 108', areaHa: 7, pos: [6, 13], slopePct: 3, distWellM: 500, distWadiM: 30, soil: 'sandy', appliedM3: 0 },
  { id: 'g9', owner: 'Leila Gargouri', phone: '+216 20 000 109', areaHa: 11, pos: [0, 6], slopePct: 2, distWellM: 700, distWadiM: 250, soil: 'loam', appliedM3: 340 },
];

export const DEMO_BUYERS: Buyer[] = [
  { id: 'b1', name: 'Hammam Sidi Mansour', kind: 'hammam', pos: [-4, 13], needTPerWeek: 12, stockT: 5 },
  { id: 'b2', name: 'Boulangerie Ennour', kind: 'bakery', pos: [-12, 11], needTPerWeek: 6, stockT: 2 },
  { id: 'b3', name: 'Briqueterie El Hencha', kind: 'kiln', pos: [19, 0], needTPerWeek: 30, stockT: 8 },
  { id: 'b4', name: 'Serres Thyna', kind: 'greenhouse', pos: [12, -15], needTPerWeek: 9, stockT: 3 },
];

/** Dates as YYYY-MM-DD from a start date. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The pitch story: Monday 23 November 2026, mills pressing, a storm on Wednesday night. */
export const DEMO_START = '2026-11-23';

export function demoWeather(start = DEMO_START, days = 7): DayWeather[] {
  const rain = [0, 0, 3, 24, 9, 0, 0, 0, 1, 0, 0, 0, 0, 0];
  const tmax = [21, 22, 19, 16, 17, 19, 20, 21, 20, 19, 20, 21, 22, 21];
  return Array.from({ length: days }, (_, i) => ({
    date: addDays(start, i),
    rainMm: rain[i % rain.length]!,
    tMaxC: tmax[i % tmax.length]!,
    et0Mm: rain[i % rain.length]! > 5 ? 0.9 : 2.1,
  }));
}

export const RESOURCE_LABEL: Record<BuyerKind, string> = {
  hammam: 'Hammam',
  bakery: 'Bakery',
  kiln: 'Brick kiln',
  greenhouse: 'Greenhouses',
};
