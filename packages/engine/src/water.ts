import { cropStage, IRRIGATION_EFFICIENCY, toMs, HOUR, type CropStage, type Plot } from '@sonae/shared';

const DAY_MS = 24 * HOUR;

export function daysBetween(aMs: number, bMs: number): number {
  return (bMs - aMs) / DAY_MS;
}

export interface PlotNeed {
  volumeM3: number;
  kc: number;
  stage: CropStage;
}

/**
 * Water to apply to a plot (m³) for a day with the given reference
 * evapotranspiration and rain: Kc × ET0 × area ÷ efficiency (FAO-56),
 * counting 80% of the rain as useful.
 */
export function plotNeedM3(plot: Plot, atMs: number, et0mm: number, rainMm: number): PlotNeed {
  const { stage, kc } = cropStage(plot.crop, daysBetween(toMs(plot.plantedOn), atMs));
  const netMm = Math.max(0, kc * et0mm - 0.8 * rainMm);
  const volumeM3 = (netMm * plot.areaM2) / 1000 / IRRIGATION_EFFICIENCY[plot.method];
  return { volumeM3, kc, stage };
}
