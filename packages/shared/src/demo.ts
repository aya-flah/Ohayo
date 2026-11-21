/**
 * Demo data: a realistic GDA near Kairouan and the "Hédi" story used in the
 * pitch. Numbers are planning assumptions, not measurements. Replace them with
 * a real GDA's figures as soon as the team gets them.
 */
import type { Farmer, ForecastHour, GDA, Outage, Plot } from './types';
import { addHours, floorHour, localHour, toTunisISO, HOUR } from './time';

export const DEMO_GDA: GDA = {
  id: 'gda-kairouan-01',
  name: 'GDA Sidi Ali (demo)',
  governorate: 'Kairouan',
  lat: 35.6781,
  lon: 10.0963,
  tank: { capacityM3: 300, minReserveM3: 30, headM: 10, levelM3: 120 },
  pump: { flowM3h: 40, powerKW: 15 },
  solar: { kWp: 25 },
  diesel: { available: true, litersPerHour: 5, costTNDPerLiter: 2.2 },
  // Demo tariff: check real STEG agricultural tariffs before quoting.
  tariff: { gridTNDPerKWh: 0.22, peakTNDPerKWh: 0.32, peakHours: [13, 17] },
  // Matched to the pump: if turns drew faster than the pump fills, the tank
  // could never be full when a cut starts.
  gravityFlowM3h: 40,
};

export const DEMO_FARMERS: Farmer[] = [
  { id: 'f-hedi', name: 'Hédi', phone: '+21600000001', smsScript: 'latin' },
  { id: 'f-amira', name: 'Amira', phone: '+21600000002', smsScript: 'latin' },
  { id: 'f-sami', name: 'Sami', phone: '+21600000003', smsScript: 'latin' },
  { id: 'f-ali', name: 'Ali', phone: '+21600000004', smsScript: 'arabic' },
  { id: 'f-nour', name: 'Nour', phone: '+21600000005', smsScript: 'latin' },
  { id: 'f-karim', name: 'Karim', phone: '+21600000006', smsScript: 'latin' },
  { id: 'f-leila', name: 'Leila', phone: '+21600000007', smsScript: 'latin' },
  { id: 'f-youssef', name: 'Youssef', phone: '+21600000008', smsScript: 'arabic' },
  { id: 'f-mounir', name: 'Mounir', phone: '+21600000009', smsScript: 'latin' },
  { id: 'f-salma', name: 'Salma', phone: '+21600000010', smsScript: 'latin' },
];

const DAY = 24 * HOUR;

/** Plots planted relative to `nowMs`, so Hédi's tomatoes are always flowering in the demo. */
export function demoPlots(nowMs: number): Plot[] {
  const planted = (daysAgo: number) => toTunisISO(nowMs - daysAgo * DAY);
  return [
    // 3 ha in total: about 300 m³ a day at the peak of a heatwave.
    // Hédi lost a turn in last week's cut, so bansui fairness owes him one.
    { id: 'p1', farmerId: 'f-hedi', name: 'Plot 1', crop: 'tomato', areaM2: 3000, plantedOn: planted(80), method: 'drip', fairnessDebt: 1 },
    { id: 'p2', farmerId: 'f-amira', name: 'Plot 2', crop: 'pepper', areaM2: 2500, plantedOn: planted(50), method: 'drip', fairnessDebt: 0 },
    { id: 'p3', farmerId: 'f-sami', name: 'Plot 3', crop: 'melon', areaM2: 2000, plantedOn: planted(70), method: 'furrow', fairnessDebt: 0 },
    { id: 'p4', farmerId: 'f-ali', name: 'Plot 4', crop: 'olive', areaM2: 5000, plantedOn: planted(200), method: 'drip', fairnessDebt: 0 },
    { id: 'p5', farmerId: 'f-nour', name: 'Plot 5', crop: 'tomato', areaM2: 2500, plantedOn: planted(40), method: 'furrow', fairnessDebt: 0 },
    { id: 'p6', farmerId: 'f-karim', name: 'Plot 6', crop: 'potato', areaM2: 2000, plantedOn: planted(60), method: 'furrow', fairnessDebt: 0 },
    { id: 'p7', farmerId: 'f-leila', name: 'Plot 7', crop: 'pepper', areaM2: 2000, plantedOn: planted(95), method: 'drip', fairnessDebt: 0 },
    { id: 'p8', farmerId: 'f-youssef', name: 'Plot 8', crop: 'olive', areaM2: 4000, plantedOn: planted(200), method: 'drip', fairnessDebt: 0 },
    { id: 'p9', farmerId: 'f-mounir', name: 'Plot 9', crop: 'melon', areaM2: 1500, plantedOn: planted(30), method: 'drip', fairnessDebt: 0 },
    { id: 'p10', farmerId: 'f-salma', name: 'Plot 10', crop: 'tomato', areaM2: 2000, plantedOn: planted(110), method: 'drip', fairnessDebt: 0 },
    { id: 'p11', farmerId: 'f-hedi', name: 'Plot 11', crop: 'pepper', areaM2: 1000, plantedOn: planted(60), method: 'drip', fairnessDebt: 0 },
    { id: 'p12', farmerId: 'f-amira', name: 'Plot 12', crop: 'olive', areaM2: 2500, plantedOn: planted(200), method: 'drip', fairnessDebt: 0 },
  ];
}

/**
 * A synthetic heatwave forecast for offline demos: tomorrow peaks at 46 °C.
 * Daily ET0 is spread over the day in proportion to solar radiation.
 */
export function demoForecast(startMs: number, hours = 72, peakDay = 1): ForecastHour[] {
  const start = floorHour(startMs);
  const out: ForecastHour[] = [];
  const radiationAt = (h: number) => {
    if (h < 6 || h > 19) return 0;
    const x = (h - 6) / 13; // 0..1 across daylight
    return Math.round(1000 * Math.sin(Math.PI * x) ** 1.4);
  };
  const daylightTotal = Array.from({ length: 24 }, (_, h) => radiationAt(h)).reduce((a, b) => a + b, 0);
  const firstDayMs = floorHour(start - localHour(start) * HOUR);
  for (let i = 0; i < hours; i++) {
    const ms = addHours(start, i);
    const h = localHour(ms);
    const dayIndex = Math.floor((ms - firstDayMs) / DAY);
    const tMax = dayIndex === peakDay ? 46 : 41;
    const tMin = dayIndex === peakDay ? 29 : 27;
    // Coldest at 05:00, hottest at 15:00, smooth in between.
    const d = (h - 5 + 24) % 24;
    const warming = d <= 10 ? (1 - Math.cos((Math.PI * d) / 10)) / 2 : (1 + Math.cos((Math.PI * (d - 10)) / 14)) / 2;
    const tempC = Math.round((tMin + (tMax - tMin) * warming) * 10) / 10;
    const radiationWm2 = radiationAt(h);
    const dailyEt0 = dayIndex === peakDay ? 9.2 : 7.6;
    const et0mm = daylightTotal > 0 ? Math.round((dailyEt0 * radiationWm2) / daylightTotal * 1000) / 1000 : 0;
    out.push({ time: toTunisISO(ms), tempC, radiationWm2, et0mm, rainMm: 0 });
  }
  return out;
}

/** The pitch scenario: STEG announces a cut from 10:00 to 16:00 tomorrow. */
export function demoOutages(nowMs: number): Outage[] {
  const today0 = floorHour(nowMs - localHour(nowMs) * HOUR);
  const tomorrow = today0 + DAY;
  return [
    {
      id: 'o-demo-1',
      start: toTunisISO(tomorrow + 10 * HOUR),
      end: toTunisISO(tomorrow + 16 * HOUR),
      source: 'steg-notice',
      note: 'Planned STEG cut, heatwave load-shedding (demo)',
    },
  ];
}
