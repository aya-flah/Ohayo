import { db } from './db';

/**
 * Hard AI budget. Every Claude response's token usage is priced (Claude Opus
 * 5.5: $4 / $20 per million input / output tokens, cache reads $0.20, cache
 * writes ~1.25x input) and added to a ledger in the database. Past the cap, the
 * API refuses new AI calls until someone raises AI_BUDGET_USD.
 */
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }; // USD per million tokens

interface Spend {
  totalUSD: number;
  byFeature: Record<string, { calls: number; usd: number }>;
}

async function read(): Promise<Spend> {
  const rows = await db.all<{ feature: string; calls: number; usd: number }>('SELECT feature, calls, usd FROM ai_spend');
  const byFeature: Spend['byFeature'] = {};
  let total = 0;
  for (const r of rows) {
    byFeature[r.feature] = { calls: Number(r.calls), usd: Number(r.usd) };
    total += Number(r.usd);
  }
  return { totalUSD: Math.round(total * 1e6) / 1e6, byFeature };
}

export const capUSD = () => Number(process.env.AI_BUDGET_USD ?? 20);

export async function spend(): Promise<Spend & { capUSD: number }> {
  return { ...(await read()), capUSD: capUSD() };
}

export async function canSpend(): Promise<boolean> {
  return (await read()).totalUSD < capUSD();
}

export interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export async function record(feature: string, usage: Usage): Promise<number> {
  const usd =
    ((usage.input_tokens ?? 0) * PRICE.input +
      (usage.output_tokens ?? 0) * PRICE.output +
      (usage.cache_read_input_tokens ?? 0) * PRICE.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) /
    1_000_000;
  await db.run(
    'INSERT INTO ai_spend (feature, calls, usd) VALUES (?, 1, ?) ON CONFLICT(feature) DO UPDATE SET calls = ai_spend.calls + 1, usd = ai_spend.usd + excluded.usd',
    feature,
    usd,
  );
  return usd;
}
