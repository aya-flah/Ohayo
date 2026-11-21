/**
 * Sonae shared contract. Every app (web, mobile, api, engine, replay) codes
 * against these types. Change them only with the whole team in the loop.
 *
 * Times are ISO 8601 strings in Tunis time (UTC+01:00, no DST), e.g.
 * "2026-07-21T10:00:00+01:00". The engine plans in 1-hour slots.
 */

export type ISODate = string;

export type EnergySource = 'solar' | 'grid' | 'diesel';
export type IrrigationMethod = 'drip' | 'furrow';
export type CropId = 'tomato' | 'pepper' | 'melon' | 'potato' | 'olive';
export type CropStage = 'ini' | 'dev' | 'mid' | 'late';

/** Elevated tank or basin: the "battery". */
export interface Tank {
  capacityM3: number;
  /** Never plan below this level (kept for surprise cuts). */
  minReserveM3: number;
  /** Height of the water above the plots, in metres (10 m ≈ 1 bar). */
  headM: number;
  /** Level right now. */
  levelM3: number;
}

export interface Pump {
  flowM3h: number;
  powerKW: number;
}

export interface Solar {
  /** Peak power of the PV array feeding the pump (off-grid pump inverter). */
  kWp: number;
}

export interface Diesel {
  available: boolean;
  litersPerHour: number;
  costTNDPerLiter: number;
}

export interface Tariff {
  gridTNDPerKWh: number;
  peakTNDPerKWh: number;
  /** Local hours [start, end) of the grid peak, e.g. [13, 17]. */
  peakHours: [number, number];
}

export interface GDA {
  id: string;
  name: string;
  governorate: string;
  lat: number;
  lon: number;
  tank: Tank;
  pump: Pump;
  solar?: Solar;
  diesel?: Diesel;
  tariff: Tariff;
  /** Maximum delivery rate from the tank to the plots by gravity. */
  gravityFlowM3h: number;
}

export interface Farmer {
  id: string;
  name: string;
  phone: string;
  /** Script for SMS: Latin letters fit 160 chars per SMS, Arabic only 70. */
  smsScript: 'latin' | 'arabic';
}

export interface Plot {
  id: string;
  farmerId: string;
  name: string;
  crop: CropId;
  areaM2: number;
  plantedOn: ISODate;
  method: IrrigationMethod;
  lastIrrigatedAt?: ISODate;
  /** Positive = this farmer is owed water from earlier shortages (bansui fairness). */
  fairnessDebt: number;
}

export interface ForecastHour {
  time: ISODate;
  tempC: number;
  radiationWm2: number;
  /** Reference evapotranspiration for this hour, mm. */
  et0mm: number;
  rainMm: number;
}

export interface Outage {
  id: string;
  start: ISODate;
  end: ISODate;
  source: 'steg-notice' | 'manual' | 'model';
  note?: string;
}

export interface PlanInput {
  gda: GDA;
  farmers: Farmer[];
  plots: Plot[];
  /** Hourly forecast covering at least the planning horizon, starting at or before `now`. */
  forecast: ForecastHour[];
  /** Announced cuts. Surprise cuts are handled by the reserve and the heat-risk weight. */
  outages: Outage[];
  now: ISODate;
  horizonHours?: number;
}

export interface PumpSlot {
  time: ISODate;
  on: boolean;
  source?: EnergySource;
  /** 0..1 chance the grid is cut in this hour (1 = announced cut). */
  risk: number;
  reason: string;
}

export interface TankPoint {
  time: ISODate;
  levelM3: number;
}

export interface Turn {
  plotId: string;
  farmerId: string;
  start: ISODate;
  end: ISODate;
  volumeM3: number;
  priority: number;
  reason: string;
}

export type AlertLevel = 'info' | 'warn' | 'critical';

export interface PlanAlert {
  level: AlertLevel;
  message: string;
  plotId?: string;
}

export interface PlanKpis {
  kWhSolar: number;
  kWhGrid: number;
  /** Grid energy used inside the peak window. */
  kWhPeak: number;
  dieselL: number;
  costTND: number;
  demandM3: number;
  deliveredM3: number;
  demandMetPct: number;
}

export interface Plan {
  id: string;
  createdAt: ISODate;
  horizonHours: number;
  pump: PumpSlot[];
  /** Level at the START of each hour, plus one final point. */
  tank: TankPoint[];
  turns: Turn[];
  alerts: PlanAlert[];
  kpis: PlanKpis;
}

/* ---------- Node / telemetry / ledger ---------- */

export type NodeMode = 'BOOT' | 'IDLE' | 'PUMPING' | 'IRRIGATING' | 'GRID_DOWN' | 'SAFE_STOP';

/** What the ESP32 (real or Wokwi) publishes on sonae/{gda}/{node}/telemetry. */
export interface Telemetry {
  v: 1;
  node: string;
  seq: number;
  /** Unix seconds. */
  ts: number;
  levelPct: number;
  flowLpm: number;
  /** Litres delivered since the current turn started. */
  litres: number;
  solarW: number;
  grid: boolean;
  pump: boolean;
  valve: 'open' | 'closed';
  mode: NodeMode;
  /** Hash of the previous message (hash chain). */
  prev?: string;
  /** HMAC-SHA256 over the canonical JSON without `sig`. */
  sig?: string;
}

export type LedgerEventType =
  | 'telemetry'
  | 'delivery'
  | 'plan_published'
  | 'command'
  | 'grid_lost'
  | 'grid_back';

export interface LedgerEvent {
  id: string;
  deviceId: string;
  seq: number;
  time: ISODate;
  type: LedgerEventType;
  data: Record<string, unknown>;
  prev: string;
  hash: string;
  sig: string;
}

/* ---------- Yui exchange (Sepolia) ---------- */

/** Matches the Solidity enum: 0 = Water (litres), 1 = Energy (Wh). */
export type YuiResource = 'water' | 'energy';
export type YuiOrderStatus = 'escrowed' | 'released' | 'refunded';
export type Address = `0x${string}`;

export interface YuiOffer {
  id: string;
  seller: Address;
  resource: YuiResource;
  quantity: number;
  remaining: number;
  pricePerUnitWei: string;
  expiresAt: number;
  meta: string;
  active: boolean;
}

export interface YuiOrder {
  id: string;
  offerId: string;
  buyer: Address;
  quantity: number;
  amountWei: string;
  deliverBy: number;
  status: YuiOrderStatus;
  delivered: number;
}
