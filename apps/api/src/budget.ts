import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Hard AI budget. Every Claude response's token usage is priced (Claude Opus
 * 5.5: $4 / $20 per million input / output tokens, cache reads $0.20, cache
 * writes ~1.25x input) and added to a ledger on disk. Past the cap, the API
 * refuses new AI calls until someone raises AI_BUDGET_USD.
 */
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }; // USD per million tokens

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, '..', 'data', 'ai-spend.json');

interface Spend {
  totalUSD: number;
  byFeature: Record<string, { calls: number; usd: number }>;
}

function read(): Spend {
  try {
    if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, 'utf8')) as Spend;
  } catch {
    /* start fresh if the file is damaged */
  }
  return { totalUSD: 0, byFeature: {} };
}

export const capUSD = () => Number(process.env.AI_BUDGET_USD ?? 20);

export function spend(): Spend & { capUSD: number } {
  return { ...read(), capUSD: capUSD() };
}

export function canSpend(): boolean {
  return read().totalUSD < capUSD();
}

export interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function record(feature: string, usage: Usage): number {
  const usd =
    ((usage.input_tokens ?? 0) * PRICE.input +
      (usage.output_tokens ?? 0) * PRICE.output +
      (usage.cache_read_input_tokens ?? 0) * PRICE.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) /
    1_000_000;
  const s = read();
  s.totalUSD = Math.round((s.totalUSD + usd) * 1e6) / 1e6;
  const f = (s.byFeature[feature] ??= { calls: 0, usd: 0 });
  f.calls += 1;
  f.usd = Math.round((f.usd + usd) * 1e6) / 1e6;
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(s, null, 2));
  return usd;
}
