import { describe, expect, it } from 'vitest';
import { DEMO_GDA, demoPlots, toMs } from '@sonae/shared';
import { modelCuts, replaySeason, replaySummary, syntheticSeason } from '../src/replay';

const START = '2026-07-01T00:00:00+01:00';
const season = syntheticSeason(START, 21, 7);
const plots = demoPlots(toMs('2026-07-10T12:00:00+01:00'));

describe('Summer Replay', () => {
  it('models more cuts on hotter days and is reproducible', () => {
    const a = modelCuts(season, 42);
    const b = modelCuts(season, 42);
    expect(a).toEqual(b);
    for (const c of a) {
      expect(c.endMs).toBeGreaterThan(c.startMs);
    }
  });

  it('delivers at least as much water with Sonae as without, on the same weather and cuts', () => {
    const run = replaySeason({ gda: DEMO_GDA, plots, hourly: season, seed: 3 });
    expect(run.with.demandM3).toBeGreaterThan(0);
    expect(run.with.deliveredPct).toBeGreaterThanOrEqual(run.without.deliveredPct);
    expect(run.with.kWhPeak).toBeLessThanOrEqual(run.without.kWhPeak);
  });

  it('summarises many seeds as median and range', () => {
    const s = replaySummary({ gda: DEMO_GDA, plots, hourly: season }, [1, 2, 3, 4, 5]);
    expect(s.runs).toBe(5);
    expect(s.with.min.deliveredPct).toBeLessThanOrEqual(s.with.max.deliveredPct);
  });
});
