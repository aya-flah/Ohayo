// Fetch Kairouan's hourly weather for summer 2026 from the Open-Meteo archive
// (free, no key; please credit Open-Meteo). Writes the file the website's
// Replay page loads, plus a copy here.
//   node data/fetch-weather.mjs [start] [end]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const start = process.argv[2] ?? '2026-06-01';
const end = process.argv[3] ?? '2026-09-30';
const fields = 'temperature_2m,shortwave_radiation,et0_fao_evapotranspiration,precipitation';
const url =
  `https://archive-api.open-meteo.com/v1/archive?latitude=35.6781&longitude=10.0963` +
  `&start_date=${start}&end_date=${end}&hourly=${fields}&timezone=Africa%2FTunis`;

const res = await fetch(url);
if (!res.ok) {
  console.error(`Open-Meteo answered ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const json = await res.json();
const out = {
  source: 'Open-Meteo Historical Weather API (ERA5), https://open-meteo.com',
  location: { name: 'Kairouan', lat: 35.6781, lon: 10.0963 },
  fetchedAt: new Date().toISOString(),
  hourly: json.hourly,
};
const n = json.hourly?.time?.length ?? 0;
const temps = (json.hourly?.temperature_2m ?? []).filter((t) => t !== null);
const missing = (json.hourly?.temperature_2m ?? []).length - temps.length;

for (const file of [join(here, 'kairouan-summer-2026.json'), join(here, '..', 'apps', 'web', 'public', 'data', 'kairouan-summer-2026.json')]) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out));
}
console.log(`Saved ${n} hours (${start} to ${end}); hottest ${Math.max(...temps)} °C; ${missing} missing values.`);
