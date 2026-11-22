// Fetches the real 2025-26 olive-pressing season weather for the Sfax olive belt (Open-Meteo archive, CC BY 4.0)
// and writes apps/web/public/data/sfax-olive-season-2025-26.json for the Zitoun Season Replay.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'apps', 'web', 'public', 'data', 'sfax-olive-season-2025-26.json');
const url =
  'https://archive-api.open-meteo.com/v1/archive?latitude=34.74&longitude=10.76&start_date=2025-11-15&end_date=2026-02-28' +
  '&daily=precipitation_sum,temperature_2m_max,et0_fao_evapotranspiration&timezone=Africa%2FTunis';

const res = await fetch(url);
if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
const j = await res.json();
const days = j.daily.time.map((date, i) => ({
  date,
  rainMm: Math.round((j.daily.precipitation_sum[i] ?? 0) * 10) / 10,
  tMaxC: j.daily.temperature_2m_max[i] ?? 18,
  et0Mm: Math.round((j.daily.et0_fao_evapotranspiration[i] ?? 1.5) * 100) / 100,
}));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ place: 'Sfax olive belt (34.74 N, 10.76 E)', source: 'Open-Meteo historical weather API, CC BY 4.0', days }, null, 1));
const rain = days.reduce((s, d) => s + d.rainMm, 0);
console.log(`Wrote ${days.length} days, ${Math.round(rain)} mm of rain, ${days.filter((d) => d.rainMm >= 8).length} days with 8 mm or more`);
