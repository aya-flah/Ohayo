import { localHour, toMs, HOUR, TZ_OFFSET_HOURS, type Plot, type Turn } from '@sonae/shared';

const DAY_MS = 24 * HOUR;

function hhmm(ms: number): string {
  const h = localHour(ms);
  const m = new Date(ms).getUTCMinutes();
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

const localDay = (ms: number) => Math.floor((ms + TZ_OFFSET_HOURS * HOUR) / DAY_MS);

function dayIndex(fromMs: number, toMsValue: number): number {
  return localDay(toMsValue) - localDay(fromMs);
}

function plotNumber(plot: Plot): string {
  const n = plot.name.match(/\d+/)?.[0];
  return n ?? plot.name;
}

/**
 * The turn SMS in Derja. Latin script stays in the GSM-7 alphabet, so one SMS
 * holds 160 characters; Arabic script uses UCS-2 and holds only 70.
 */
export function turnSms(turn: Turn, plot: Plot, nowMs: number, script: 'latin' | 'arabic' = 'latin'): string {
  const s = toMs(turn.start);
  const e = toMs(turn.end);
  const d = dayIndex(nowMs, s);
  const vol = Math.max(1, Math.round(turn.volumeM3));
  if (script === 'arabic') {
    const day = d === 0 ? 'اليوم' : d === 1 ? 'غدوة' : d === 2 ? 'بعد غدوة' : '';
    return `سوناي: دورك ${day} ${hhmm(s)}-${hhmm(e)}، القطعة ${plotNumber(plot)} (${vol} م3)`;
  }
  const day = d === 0 ? 'lyoum' : d === 1 ? 'ghodwa' : d === 2 ? 'ba3d ghodwa' : '';
  return `Sonae: Dourek ${day} ${hhmm(s)}-${hhmm(e)}, parcelle ${plotNumber(plot)} (${vol} m3).`;
}

/** True when every character is in the plain ASCII range (safe for GSM-7). */
export function isGsmSafe(text: string): boolean {
  return /^[\x20-\x7E]*$/.test(text);
}
