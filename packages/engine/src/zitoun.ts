import {
  DEMO_BUYERS,
  DEMO_GROVES,
  DEMO_MILLS,
  type Buyer,
  type DayPlan,
  type DayWeather,
  type GrignonDelivery,
  type Grove,
  type GroveCheck,
  type Mill,
  type Trip,
  type ZitounAlert,
  type ZitounInput,
  type ZitounKpis,
  type ZitounPlan,
  type ZitounRules,
} from '@sonae/shared';
import { isGsmSafe } from './sms';
import { mulberry32 } from './replay';

/**
 * Sonae Zitoun planner.
 *
 * Every day: the mills press (pond rises, grignon piles up), the pond evaporates a little,
 * then, on a safe day, tankers carry margine to the nearest allowed groves with room left.
 * Ponds closest to overflowing are served first. Grignon goes to the buyers that are about
 * to run out. Nothing is ever spread on a rainy day, the day before rain, on wet soil, on a
 * steep slope, near a drinking-water well or near the wadi, or beyond a grove's season cap.
 */

export type ZitounMode = 'sonae' | 'baseline';

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function groveCap(g: Grove, rules: ZitounRules): number {
  return Math.round(g.areaHa * rules.capM3PerHa);
}

/** Why a grove can never take margine, or null when it can. */
export function groveBlock(g: Grove, rules: ZitounRules): string | null {
  if (g.slopePct > rules.maxSlopePct) return `Slope of ${g.slopePct}% (limit ${rules.maxSlopePct}%): margine would run off`;
  if (g.distWellM < rules.minDistWellM) return `${g.distWellM} m from a drinking-water well (minimum ${rules.minDistWellM} m)`;
  if (g.distWadiM < rules.minDistWadiM) return `${g.distWadiM} m from the wadi (minimum ${rules.minDistWadiM} m)`;
  return null;
}

/** Why nothing can be spread on day `d`, or null when the day is safe. */
export function dayBlock(weather: DayWeather[], d: number, rules: ZitounRules): string | null {
  const today = weather[d];
  if (!today) return null;
  if (today.rainMm >= rules.rainBlockMm) return `${round1(today.rainMm)} mm of rain: margine would wash into the wadis`;
  const next = weather[d + 1];
  if (next && next.rainMm >= rules.rainBlockMm) return `${round1(next.rainMm)} mm of rain tomorrow: no spreading the day before`;
  const wet = (weather[d - 1]?.rainMm ?? 0) + (weather[d - 2]?.rainMm ?? 0);
  if (wet >= rules.wetSoilMm) return `Soil still wet (${round1(wet)} mm over the last two days)`;
  return null;
}

export function planZitoun(input: ZitounInput, mode: ZitounMode = 'sonae'): ZitounPlan {
  const { rules } = input;
  const ndays = Math.min(input.days, input.weather.length);
  const pond = new Map(input.mills.map((m) => [m.id, m.pondM3]));
  const grignon = new Map(input.mills.map((m) => [m.id, m.grignonT]));
  const applied = new Map(input.groves.map((g) => [g.id, g.appliedM3]));
  const stock = new Map(input.buyers.map((b) => [b.id, b.stockT]));
  const checks = new Map(input.groves.map((g) => [g.id, groveBlock(g, rules)]));
  const alerts: ZitounAlert[] = [];
  const days: DayPlan[] = [];
  const kpis: ZitounKpis = { spreadM3: 0, trips: 0, km: 0, transportTND: 0, overflowM3: 0, k2oKg: 0, fertiliserTND: 0, grignonT: 0, dieselLitresReplaced: 0, blockedDays: 0, feeTND: 0 };
  const capped = new Set<string>();

  for (let d = 0; d < ndays; d++) {
    const w = input.weather[d]!;
    const block = mode === 'sonae' ? dayBlock(input.weather, d, rules) : null;
    const day: DayPlan = { day: d, date: w.date, rainMm: w.rainMm, blocked: !!block, blockReason: block, trips: [], grignon: [], pondEnd: {}, overflow: {}, applied: {} };
    if (block) kpis.blockedDays++;

    // 1. Pressing and evaporation. Rain also lands in the open pond.
    for (const m of input.mills) {
      let p = pond.get(m.id)!;
      if (input.pressing) {
        p += m.marginePerDayM3;
        grignon.set(m.id, grignon.get(m.id)! + m.grignonPerDayT);
      }
      p += (w.rainMm / 1000) * m.pondAreaM2;
      p -= Math.min(p, (w.et0Mm / 1000) * m.pondAreaM2);
      pond.set(m.id, p);
    }

    // 2. Spreading, most urgent pond first.
    if (mode === 'sonae' && !block) {
      const today = new Map<string, number>();
      const mills = [...input.mills].sort((a, b) => pond.get(b.id)! / b.pondCapacityM3 - pond.get(a.id)! / a.pondCapacityM3);
      for (const m of mills) {
        const groves = input.groves
          .filter((g) => !checks.get(g.id))
          .sort((a, b) => dist(m.pos, a.pos) - dist(m.pos, b.pos));
        const share = pond.get(m.id)! / m.pondCapacityM3;
        const tripsMax = m.trucks * rules.tripsPerTruckDay;
        for (let t = 0; t < tripsMax; t++) {
          const p = pond.get(m.id)!;
          if (p < 1) break;
          const g = groves.find((gr) => {
            const dayRoom = rules.maxDoseM3PerHaDay * gr.areaHa - (today.get(gr.id) ?? 0);
            const seasonRoom = groveCap(gr, rules) - applied.get(gr.id)!;
            return Math.min(dayRoom, seasonRoom) >= 1;
          });
          if (!g) break;
          const dayRoom = rules.maxDoseM3PerHaDay * g.areaHa - (today.get(g.id) ?? 0);
          const seasonRoom = groveCap(g, rules) - applied.get(g.id)!;
          const m3 = round1(Math.min(m.truckM3, p, dayRoom, seasonRoom));
          const oneWay = dist(m.pos, g.pos) * rules.kmPerUnit;
          const km = round1(oneWay * 2);
          const urgent = share >= 0.85 ? `Pond ${Math.round(share * 100)}% full, served first. ` : '';
          const left = Math.round(seasonRoom - m3);
          day.trips.push({
            day: d,
            millId: m.id,
            groveId: g.id,
            truck: t % m.trucks,
            slot: Math.floor(t / m.trucks),
            m3,
            km,
            reason: `${urgent}Nearest allowed grove with room: ${g.owner}, ${round1(oneWay)} km away, ${left} m³ of its season cap left.`,
          });
          pond.set(m.id, p - m3);
          today.set(g.id, (today.get(g.id) ?? 0) + m3);
          applied.set(g.id, applied.get(g.id)! + m3);
          if (groveCap(g, rules) - applied.get(g.id)! < 1 && !capped.has(g.id)) {
            capped.add(g.id);
            alerts.push({ level: 'info', day: d, text: `${g.owner}'s grove reached its season cap; Sonae stops sending margine there.` });
          }
          kpis.trips++;
          kpis.km += km;
          kpis.spreadM3 += m3;
        }
      }
      for (const [gid, v] of today) day.applied[gid] = round1(v);
    }

    // 3. Overflow: what a full pond spills into the wadi.
    for (const m of input.mills) {
      const p = pond.get(m.id)!;
      if (p > m.pondCapacityM3) {
        const over = p - m.pondCapacityM3;
        day.overflow[m.id] = round1(over);
        kpis.overflowM3 += over;
        pond.set(m.id, m.pondCapacityM3);
        if (mode === 'sonae') alerts.push({ level: 'critical', day: d, text: `${m.name}'s pond overflows by ${Math.round(over)} m³. Add a tanker or more groves.` });
      } else if (mode === 'sonae' && p / m.pondCapacityM3 >= 0.9) {
        alerts.push({ level: 'warn', day: d, text: `${m.name}'s pond is ${Math.round((p / m.pondCapacityM3) * 100)}% full at the end of the day.` });
      }
      day.pondEnd[m.id] = round1(pond.get(m.id)!);
    }

    // 4. Grignon to buyers about to run out (covered trucks, so rain does not matter).
    for (const b of input.buyers) {
      const daily = b.needTPerWeek / 7;
      let s = stock.get(b.id)! - daily;
      if (mode === 'sonae' && s < daily * 3) {
        const mill = [...input.mills].filter((m) => grignon.get(m.id)! >= 1).sort((x, y) => dist(x.pos, b.pos) - dist(y.pos, b.pos))[0];
        if (mill) {
          const tonnes = round1(Math.min(grignon.get(mill.id)!, Math.max(2, b.needTPerWeek), 12));
          const km = round1(dist(mill.pos, b.pos) * rules.kmPerUnit * 2);
          day.grignon.push({ day: d, millId: mill.id, buyerId: b.id, tonnes, km } satisfies GrignonDelivery);
          grignon.set(mill.id, grignon.get(mill.id)! - tonnes);
          s += tonnes;
          kpis.grignonT += tonnes;
          kpis.km += km;
        }
      }
      stock.set(b.id, Math.max(0, s));
    }

    if (block && mode === 'sonae') alerts.push({ level: 'info', day: d, text: `No spreading: ${block}.` });
    days.push(day);
  }

  kpis.spreadM3 = round1(kpis.spreadM3);
  kpis.km = round1(kpis.km);
  kpis.transportTND = Math.round(kpis.km * rules.costPerKmTND);
  kpis.overflowM3 = round1(kpis.overflowM3);
  kpis.k2oKg = Math.round(kpis.spreadM3 * rules.k2oKgPerM3);
  // Only the potassium a grove needs this season replaces fertiliser it would have bought.
  let usefulK2o = 0;
  for (const g of input.groves) {
    const need = rules.k2oNeedKgPerHa * g.areaHa;
    const before = Math.min(need, g.appliedM3 * rules.k2oKgPerM3);
    const after = Math.min(need, applied.get(g.id)! * rules.k2oKgPerM3);
    usefulK2o += Math.max(0, after - before);
  }
  kpis.fertiliserTND = Math.round(usefulK2o * rules.k2oTNDPerKg);
  kpis.grignonT = round1(kpis.grignonT);
  // 1 kg diesel ≈ 1.19 L.
  kpis.dieselLitresReplaced = Math.round(((kpis.grignonT * 1000) / rules.grignonKgPerKgDiesel) * 1.19);
  kpis.feeTND = Math.round(kpis.spreadM3 * rules.feeTNDPerM3);

  const groves: GroveCheck[] = input.groves.map((g) => ({
    groveId: g.id,
    allowed: !checks.get(g.id),
    reason: checks.get(g.id) ?? null,
    capM3: groveCap(g, rules),
    remainingM3: Math.max(0, Math.round(groveCap(g, rules) - applied.get(g.id)!)),
  }));
  return { days, groves, alerts, kpis };
}

/* ── Derja SMS (Latin script, GSM-7, ≤ 160 characters) ──────────────── */

const ascii = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '');

const DAY_WORD = ['lyoum', 'ghodwa', 'ba3d ghodwa'];

function fit(s: string): string {
  return s.length <= 160 ? s : `${s.slice(0, 157)}...`;
}

/** The SMS a farmer receives the evening before margine is delivered to his grove. */
export function farmerSms(trips: Trip[], grove: Grove, mill: Mill, dayOffset: number): string {
  const m3 = Math.round(trips.reduce((s, t) => s + t.m3, 0));
  const when = DAY_WORD[dayOffset] ?? `nhar ${dayOffset}`;
  const text = `Sonae: ${when} ${m3} m3 margine men ${ascii(mill.name)} lel jnen mta3ek (${trips.length} kamyoun). Ma tsa9ich 3 ayem. Potassium bla flous lel zitoun.`;
  return fit(ascii(text));
}

/** The SMS a tanker driver receives with his round for the day. */
export function driverSms(trips: Trip[], groves: Grove[], mill: Mill, dayOffset: number): string {
  const when = DAY_WORD[dayOffset] ?? `nhar ${dayOffset}`;
  const legs = trips
    .sort((a, b) => a.slot - b.slot)
    .map((t, i) => `${i + 1}) ${ascii(groves.find((g) => g.id === t.groveId)?.owner.split(' ')[0] ?? '?')} ${Math.round(t.m3)}m3`)
    .join(' ');
  return fit(ascii(`Sonae ${ascii(mill.name)}: ${when} ${trips.length} rihla. ${legs}. Ken tsob chta, ma tfarra8ch.`));
}

/** The message on a blocked day, to every farmer expecting margine. */
export function rainSms(reason: string, dayOffset: number): string {
  const when = DAY_WORD[dayOffset] ?? `nhar ${dayOffset}`;
  const mm = reason.match(/[\d.]+ mm/)?.[0] ?? '';
  return fit(ascii(`Sonae: ${when} ma fammech margine${mm ? ` (chta ${mm})` : ''}. Nraj3ou ki tenchef lard. Jnenek w bir el ma mahmiyin.`));
}

export { isGsmSafe };

/* ── Season replay: a whole olive season, with and without Sonae ────── */

export interface ZitounReplayDay {
  date: string;
  rainMm: number;
  blocked: boolean;
  pondShareWithout: number;
  pondShareWith: number;
  overflowWithout: number;
  overflowWith: number;
}

export interface ZitounReplay {
  without: ZitounKpis;
  with: ZitounKpis;
  days: ZitounReplayDay[];
  overflowDaysWithout: number;
  overflowDaysWith: number;
  groves: number;
  hectares: number;
}

/** The demo groves plus the wider network a real pilot would sign up (deterministic). */
export function seasonGroves(seed = 7, extra = 27): Grove[] {
  const rand = mulberry32(seed);
  const out: Grove[] = DEMO_GROVES.map((g) => ({ ...g, appliedM3: 0 }));
  for (let i = 0; i < extra; i++) {
    const a = rand() * Math.PI * 2;
    const r = 8 + rand() * 18;
    out.push({
      id: `n${i + 1}`,
      owner: `Grove ${i + 1}`,
      phone: '',
      areaHa: Math.round(5 + rand() * 12),
      pos: [Math.cos(a) * r, Math.sin(a) * r],
      slopePct: rand() < 0.12 ? 12 : Math.round(1 + rand() * 5),
      distWellM: rand() < 0.1 ? 60 : Math.round(200 + rand() * 1200),
      distWadiM: Math.round(80 + rand() * 900),
      soil: rand() < 0.4 ? 'sandy' : 'loam',
      appliedM3: 0,
    });
  }
  return out;
}

export function replayZitounSeason(weather: DayWeather[], rules: ZitounRules, opts?: { mills?: Mill[]; groves?: Grove[]; buyers?: Buyer[]; startPondShare?: number }): ZitounReplay {
  const share = opts?.startPondShare ?? 0.1;
  const mills = (opts?.mills ?? DEMO_MILLS).map((m) => ({ ...m, pondM3: Math.round(m.pondCapacityM3 * share), grignonT: 0 }));
  const groves = opts?.groves ?? seasonGroves();
  const buyers = opts?.buyers ?? DEMO_BUYERS;
  const input: ZitounInput = { start: weather[0]?.date ?? '', days: weather.length, mills, groves, buyers, weather, rules, pressing: true };
  const a = planZitoun(input, 'baseline');
  const b = planZitoun(input, 'sonae');
  const cap = new Map(mills.map((m) => [m.id, m.pondCapacityM3]));
  const totalCap = [...cap.values()].reduce((s, v) => s + v, 0);
  const sum = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0);
  const days: ZitounReplayDay[] = weather.map((w, i) => ({
    date: w.date,
    rainMm: w.rainMm,
    blocked: b.days[i]!.blocked,
    pondShareWithout: sum(a.days[i]!.pondEnd) / totalCap,
    pondShareWith: sum(b.days[i]!.pondEnd) / totalCap,
    overflowWithout: sum(a.days[i]!.overflow),
    overflowWith: sum(b.days[i]!.overflow),
  }));
  return {
    without: a.kpis,
    with: b.kpis,
    days,
    overflowDaysWithout: days.filter((d) => d.overflowWithout > 0).length,
    overflowDaysWith: days.filter((d) => d.overflowWith > 0).length,
    groves: groves.filter((g) => !groveBlock(g, rules)).length,
    hectares: groves.filter((g) => !groveBlock(g, rules)).reduce((s, g) => s + g.areaHa, 0),
  };
}

/* ── From a lab analysis to a safe dose ─────────────────────────────── */

export interface MargineLab {
  ph: number | null;
  /** Potassium as K (g/L = kg/m³). */
  potassiumGL: number | null;
  /** Total polyphenols (g/L), the part that is toxic to soil life in large doses. */
  polyphenolsGL: number | null;
  /** Electrical conductivity (dS/m): salinity. */
  ecDsM: number | null;
}

export interface MargineAdvice {
  spreadable: boolean;
  /** Season dose this margine allows (m³/ha), never above the rules' cap. */
  maxM3PerHa: number;
  k2oKgPerM3: number | null;
  /** What a full dose gives a hectare (kg K₂O/ha). */
  k2oKgPerHa: number | null;
  reasons: string[];
}

/**
 * Indicative thresholds (to confirm with the regional lab and the decree): very acidic, very salty
 * or very phenolic margine gets a smaller dose; extreme values are not spread at all.
 */
export function margineAdvice(lab: MargineLab, rules: ZitounRules): MargineAdvice {
  const reasons: string[] = [];
  let factor = 1;
  let spreadable = true;
  if (lab.ph !== null) {
    if (lab.ph < 3.5) {
      spreadable = false;
      reasons.push(`pH ${lab.ph} is extremely acidic: neutralise (lime) before spreading.`);
    } else if (lab.ph < 4.5) {
      factor = Math.min(factor, 0.7);
      reasons.push(`pH ${lab.ph} is acidic: dose reduced by 30%.`);
    } else reasons.push(`pH ${lab.ph} is in the usual range for margine.`);
  }
  if (lab.polyphenolsGL !== null) {
    if (lab.polyphenolsGL > 15) {
      spreadable = false;
      reasons.push(`Polyphenols ${lab.polyphenolsGL} g/L are very high: let the pond age or treat it first.`);
    } else if (lab.polyphenolsGL > 8) {
      factor = Math.min(factor, 0.6);
      reasons.push(`Polyphenols ${lab.polyphenolsGL} g/L are high: dose reduced by 40%.`);
    } else reasons.push(`Polyphenols ${lab.polyphenolsGL} g/L are manageable for the soil.`);
  }
  if (lab.ecDsM !== null) {
    if (lab.ecDsM > 25) {
      spreadable = false;
      reasons.push(`Salinity ${lab.ecDsM} dS/m is too high for olive soils.`);
    } else if (lab.ecDsM > 15) {
      factor = Math.min(factor, 0.6);
      reasons.push(`Salinity ${lab.ecDsM} dS/m is high: dose reduced by 40%.`);
    }
  }
  const k2o = lab.potassiumGL !== null ? Math.round(lab.potassiumGL * 1.2046 * 10) / 10 : null;
  let maxM3PerHa = spreadable ? Math.round(rules.capM3PerHa * factor) : 0;
  // Never give a grove far more potassium than it can use in a season.
  if (spreadable && k2o && k2o > 0) {
    const kCap = Math.round((rules.k2oNeedKgPerHa * 2) / k2o);
    if (kCap < maxM3PerHa) {
      maxM3PerHa = kCap;
      reasons.push(`Rich in potassium (${k2o} kg K₂O/m³): ${kCap} m³/ha already covers twice what olive trees need.`);
    }
  }
  if (k2o !== null) reasons.push(`Each m³ brings about ${k2o} kg of K₂O, fertiliser the farmer does not buy.`);
  return { spreadable, maxM3PerHa, k2oKgPerM3: k2o, k2oKgPerHa: k2o !== null ? Math.round(k2o * maxM3PerHa) : null, reasons };
}
