import { describe, expect, it } from 'vitest';
import {
  DEMO_FARMERS,
  DEMO_GDA,
  demoForecast,
  demoOutages,
  demoPlots,
  localHour,
  toMs,
  type PlanInput,
  type Plot,
} from '@sonae/shared';
import { heatRisk, plan } from '../src/plan';
import { isGsmSafe, turnSms } from '../src/sms';

// Monday 20 July 2026, 14:00 in Kairouan: the pitch story starts here.
const NOW = '2026-07-20T14:00:00+01:00';
const nowMs = toMs(NOW);

function hediInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    gda: DEMO_GDA,
    farmers: DEMO_FARMERS,
    plots: demoPlots(nowMs),
    forecast: demoForecast(nowMs, 72, 1),
    outages: demoOutages(nowMs),
    now: NOW,
    ...overrides,
  };
}

describe('the Hédi scenario: 46 °C tomorrow, STEG cut 10:00 to 16:00', () => {
  const p = plan(hediInput());
  const cut = demoOutages(nowMs)[0]!;
  const cutStart = toMs(cut.start);
  const cutEnd = toMs(cut.end);

  it('never pumps from the grid during the cut', () => {
    const inCut = p.pump.filter((s) => toMs(s.time) >= cutStart && toMs(s.time) < cutEnd);
    expect(inCut).toHaveLength(6);
    for (const s of inCut) expect(s.source).not.toBe('grid');
  });

  it('has the tank at least 90% full when the cut starts', () => {
    const atCut = p.tank.find((t) => toMs(t.time) === cutStart)!;
    expect(atCut.levelM3).toBeGreaterThanOrEqual(0.9 * DEMO_GDA.tank.capacityM3 - 0.5);
  });

  it("waters Hédi's flowering tomatoes first tomorrow morning", () => {
    const tomorrowMorning = p.turns.filter((t) => toMs(t.start) > cutStart - 6 * 3_600_000 && toMs(t.start) < cutStart);
    expect(tomorrowMorning[0]?.plotId).toBe('p1');
    expect(localHour(tomorrowMorning[0]!.start)).toBe(5);
  });

  it('burns no diesel', () => {
    expect(p.kpis.dieselL).toBe(0);
  });

  it('keeps the tank between the reserve and full at every hour', () => {
    for (const t of p.tank.slice(1)) {
      expect(t.levelM3).toBeLessThanOrEqual(DEMO_GDA.tank.capacityM3 + 0.5);
      expect(t.levelM3).toBeGreaterThanOrEqual(DEMO_GDA.tank.minReserveM3 - 0.5);
    }
  });

  it('delivers all the water that was planned', () => {
    const sum = p.turns.reduce((a, t) => a + t.volumeM3, 0);
    expect(Math.abs(sum - p.kpis.deliveredM3)).toBeLessThan(2);
    expect(p.kpis.demandMetPct).toBeGreaterThanOrEqual(99);
  });

  it('explains every pump hour and every turn', () => {
    for (const s of p.pump) expect(s.reason.length).toBeGreaterThan(5);
    for (const t of p.turns) expect(t.reason.length).toBeGreaterThan(5);
    expect(p.alerts.some((a) => a.message.includes('STEG cut'))).toBe(true);
  });
});

describe('fairness and edge cases', () => {
  it('rotates the first slot between two identical plots from day to day', () => {
    const twin = (id: string): Plot => ({
      id,
      farmerId: `f-${id}`,
      name: `Plot ${id}`,
      crop: 'pepper',
      areaM2: 2000,
      plantedOn: '2026-05-20T00:00:00+01:00',
      method: 'drip',
      fairnessDebt: 0,
    });
    const p = plan(hediInput({ plots: [twin('a'), twin('b')], outages: [], now: '2026-07-20T00:00:00+01:00' }));
    const firstOfDay = (day: number) =>
      p.turns.filter((t) => new Date(toMs(t.start) + 3_600_000).getUTCDate() === day).sort((x, y) => toMs(x.start) - toMs(y.start))[0]?.plotId;
    expect(firstOfDay(20)).toBeDefined();
    expect(firstOfDay(21)).toBeDefined();
    expect(firstOfDay(20)).not.toBe(firstOfDay(21));
  });

  it('uses diesel only when solar and grid cannot prevent a shortage', () => {
    const noSolar = { ...DEMO_GDA, solar: undefined, tank: { ...DEMO_GDA.tank, levelM3: 30 } };
    const longCut = [{ id: 'x', start: '2026-07-20T14:00:00+01:00', end: '2026-07-21T14:00:00+01:00', source: 'manual' as const }];
    const p = plan(hediInput({ gda: noSolar, outages: longCut }));
    expect(p.kpis.dieselL).toBeGreaterThan(0);
    for (const s of p.pump.filter((x) => x.source === 'diesel')) expect(toMs(s.time)).toBeLessThan(toMs('2026-07-21T14:00:00+01:00'));
  });

  it('rates the afternoon heat as risky and the night as safe', () => {
    expect(heatRisk(46, 15)).toBeGreaterThan(0.3);
    expect(heatRisk(46, 2)).toBe(0);
    expect(heatRisk(30, 15)).toBe(0);
  });
});

describe('Derja SMS', () => {
  it('fits one GSM-7 SMS and names the day, time and plot', () => {
    const p = plan(hediInput());
    const turn = p.turns.find((t) => t.plotId === 'p1' && localHour(t.start) === 5)!;
    const sms = turnSms(turn, demoPlots(nowMs)[0]!, nowMs);
    expect(sms).toMatch(/^Sonae: Dourek ghodwa 5h/);
    expect(sms).toContain('parcelle 1');
    expect(sms.length).toBeLessThanOrEqual(160);
    expect(isGsmSafe(sms)).toBe(true);
  });
});
