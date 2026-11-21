import { localHour, toMs, TZ_OFFSET_HOURS, HOUR } from '@sonae/shared';

const DAY = 24 * HOUR;
const localDay = (ms: number) => Math.floor((ms + TZ_OFFSET_HOURS * HOUR) / DAY);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "05:00", "17:30" in Tunis time. */
export function clock(iso: string | number): string {
  const ms = typeof iso === 'number' ? iso : toMs(iso);
  const m = new Date(ms).getUTCMinutes();
  return `${String(localHour(ms)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "Today", "Tomorrow" or the weekday, relative to `nowIso`. */
export function dayLabel(iso: string | number, nowIso: string | number): string {
  const ms = typeof iso === 'number' ? iso : toMs(iso);
  const now = typeof nowIso === 'number' ? nowIso : toMs(nowIso);
  const d = localDay(ms) - localDay(now);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return WEEKDAYS[new Date(ms + TZ_OFFSET_HOURS * HOUR).getUTCDay()]!;
}

export function weekday(iso: string | number): string {
  const ms = typeof iso === 'number' ? iso : toMs(iso);
  return WEEKDAYS[new Date(ms + TZ_OFFSET_HOURS * HOUR).getUTCDay()]!;
}

export function fmt(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
