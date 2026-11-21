/** Tunisia is UTC+01:00 all year (no daylight saving). */
export const TZ_OFFSET_HOURS = 1;

const HOUR_MS = 3_600_000;

export function toMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid date: ${iso}`);
  return ms;
}

/** Format a timestamp as ISO 8601 in Tunis time, e.g. 2026-07-21T10:00:00+01:00. */
export function toTunisISO(ms: number): string {
  const local = new Date(ms + TZ_OFFSET_HOURS * HOUR_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:00+01:00`
  );
}

/** Local (Tunis) hour of day, 0..23. */
export function localHour(isoOrMs: string | number): number {
  const ms = typeof isoOrMs === 'number' ? isoOrMs : toMs(isoOrMs);
  return new Date(ms + TZ_OFFSET_HOURS * HOUR_MS).getUTCHours();
}

/** Round down to the start of the hour. */
export function floorHour(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

export function addHours(ms: number, h: number): number {
  return ms + h * HOUR_MS;
}

export function hoursBetween(aMs: number, bMs: number): number {
  return (bMs - aMs) / HOUR_MS;
}

export const HOUR = HOUR_MS;
