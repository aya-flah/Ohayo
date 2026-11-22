import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, DEMO_BUYERS, DEMO_GROVES, DEMO_MILLS, DEMO_START, demoWeather, addDays, type ZitounInput } from '@sonae/shared';
import { dayBlock, driverSms, farmerSms, groveBlock, groveCap, isGsmSafe, planZitoun, rainSms, replayZitounSeason } from '../src';

const input = (over: Partial<ZitounInput> = {}): ZitounInput => ({
  start: DEMO_START,
  days: 7,
  mills: DEMO_MILLS,
  groves: DEMO_GROVES,
  buyers: DEMO_BUYERS,
  weather: demoWeather(DEMO_START, 7),
  rules: DEFAULT_RULES,
  pressing: true,
  ...over,
});

describe('Zitoun planner', () => {
  const plan = planZitoun(input());

  it('never spreads on a rainy day, the day before rain, or on wet soil', () => {
    const w = demoWeather(DEMO_START, 7);
    for (const d of plan.days) {
      const unsafe = w[d.day]!.rainMm >= DEFAULT_RULES.rainBlockMm || (w[d.day + 1]?.rainMm ?? 0) >= DEFAULT_RULES.rainBlockMm || (w[d.day - 1]?.rainMm ?? 0) + (w[d.day - 2]?.rainMm ?? 0) >= DEFAULT_RULES.wetSoilMm;
      if (unsafe) expect(d.trips).toHaveLength(0);
      expect(d.blocked).toBe(unsafe);
    }
    // The demo storm (24 mm on day 3) blocks days 2, 3 and 4 at least.
    expect(plan.days[2]!.blocked && plan.days[3]!.blocked && plan.days[4]!.blocked).toBe(true);
  });

  it('never sends margine to a grove near a well, near the wadi or on a slope', () => {
    const banned = new Set(DEMO_GROVES.filter((g) => groveBlock(g, DEFAULT_RULES)).map((g) => g.id));
    expect([...banned].sort()).toEqual(['g4', 'g6', 'g8']);
    for (const d of plan.days) for (const t of d.trips) expect(banned.has(t.groveId)).toBe(false);
  });

  it('keeps every grove within its season cap and its daily dose', () => {
    const total = new Map(DEMO_GROVES.map((g) => [g.id, g.appliedM3]));
    for (const d of plan.days) {
      for (const [gid, v] of Object.entries(d.applied)) {
        const g = DEMO_GROVES.find((x) => x.id === gid)!;
        expect(v).toBeLessThanOrEqual(g.areaHa * DEFAULT_RULES.maxDoseM3PerHaDay + 1e-6);
        total.set(gid, total.get(gid)! + v);
      }
    }
    for (const g of DEMO_GROVES) expect(total.get(g.id)!).toBeLessThanOrEqual(groveCap(g, DEFAULT_RULES) + 1e-6);
  });

  it('respects truck capacity and trips per day', () => {
    for (const d of plan.days) {
      for (const m of DEMO_MILLS) {
        const trips = d.trips.filter((t) => t.millId === m.id);
        expect(trips.length).toBeLessThanOrEqual(m.trucks * DEFAULT_RULES.tripsPerTruckDay);
        for (const t of trips) expect(t.m3).toBeLessThanOrEqual(m.truckM3);
      }
    }
  });

  it('serves the fullest pond first and avoids any overflow in the demo week', () => {
    const first = plan.days[0]!.trips[0]!;
    expect(first.millId).toBe('m2'); // Ben Salah starts at 88% full
    expect(plan.kpis.overflowM3).toBe(0);
    const baseline = planZitoun(input(), 'baseline');
    expect(baseline.kpis.overflowM3).toBeGreaterThan(0);
  });

  it('explains every trip', () => {
    for (const d of plan.days) for (const t of d.trips) expect(t.reason.length).toBeGreaterThan(20);
  });

  it('delivers grignon only from stock', () => {
    const stock = new Map(DEMO_MILLS.map((m) => [m.id, m.grignonT]));
    for (const d of plan.days) {
      for (const m of DEMO_MILLS) stock.set(m.id, stock.get(m.id)! + m.grignonPerDayT);
      for (const g of d.grignon) {
        stock.set(g.millId, stock.get(g.millId)! - g.tonnes);
        expect(stock.get(g.millId)!).toBeGreaterThanOrEqual(-1e-6);
      }
    }
    expect(plan.kpis.grignonT).toBeGreaterThan(0);
  });

  it('writes Derja SMS that fit one GSM-7 message', () => {
    const d0 = plan.days[0]!;
    const g = DEMO_GROVES.find((x) => x.id === d0.trips[0]!.groveId)!;
    const m = DEMO_MILLS.find((x) => x.id === d0.trips[0]!.millId)!;
    const sms = [
      farmerSms(d0.trips.filter((t) => t.groveId === g.id), g, m, 1),
      driverSms(d0.trips.filter((t) => t.millId === m.id && t.truck === 0), DEMO_GROVES, m, 0),
      rainSms(plan.days[3]!.blockReason!, 1),
    ];
    for (const s of sms) {
      expect(s.length).toBeLessThanOrEqual(160);
      expect(isGsmSafe(s)).toBe(true);
    }
  });

  it('a season with Sonae spills far less margine into the wadis', () => {
    const weather = Array.from({ length: 100 }, (_, i) => ({
      date: addDays('2025-11-15', i),
      rainMm: i % 9 === 4 ? 14 : i % 13 === 0 ? 4 : 0,
      tMaxC: 18,
      et0Mm: 1.8,
    }));
    const r = replayZitounSeason(weather, DEFAULT_RULES);
    expect(r.without.overflowM3).toBeGreaterThan(2000);
    expect(r.with.overflowM3).toBeLessThan(r.without.overflowM3 * 0.2);
    expect(r.with.spreadM3).toBeGreaterThan(5000);
    expect(dayBlock(weather, 4, DEFAULT_RULES)).toMatch(/rain/);
  });
});
