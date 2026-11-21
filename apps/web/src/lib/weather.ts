import type { ForecastHour } from '@sonae/shared';

const KAIROUAN = { lat: 35.6781, lon: 10.0963 };

interface OpenMeteoHourly {
  time: string[];
  temperature_2m: number[];
  shortwave_radiation: number[];
  et0_fao_evapotranspiration: number[];
  precipitation: number[];
}

/** Times come back in Africa/Tunis local time ("2026-07-21T05:00"); Tunisia is UTC+01:00 all year. */
function toForecast(h: OpenMeteoHourly): ForecastHour[] {
  return h.time.map((t, i) => ({
    time: `${t}:00+01:00`,
    tempC: h.temperature_2m[i] ?? 0,
    radiationWm2: h.shortwave_radiation[i] ?? 0,
    et0mm: h.et0_fao_evapotranspiration[i] ?? 0,
    rainMm: h.precipitation[i] ?? 0,
  }));
}

const FIELDS = 'temperature_2m,shortwave_radiation,et0_fao_evapotranspiration,precipitation';

/** Three days of hourly forecast for Kairouan from Open-Meteo (free, no key; credit Open-Meteo). */
export async function fetchKairouanForecast(signal?: AbortSignal): Promise<ForecastHour[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${KAIROUAN.lat}&longitude=${KAIROUAN.lon}` +
    `&hourly=${FIELDS}&timezone=Africa%2FTunis&forecast_days=3&past_days=1`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
  const json = (await res.json()) as { hourly: OpenMeteoHourly };
  return toForecast(json.hourly);
}

/** Summer 2026 hourly history, cached by `npm run weather:fetch` into /data. */
export async function loadSummer2026(): Promise<{ hourly: ForecastHour[]; source: 'open-meteo' } | null> {
  try {
    const res = await fetch('/data/kairouan-summer-2026.json');
    if (!res.ok) return null;
    const json = (await res.json()) as { hourly: OpenMeteoHourly };
    return { hourly: toForecast(json.hourly), source: 'open-meteo' };
  } catch {
    return null;
  }
}
