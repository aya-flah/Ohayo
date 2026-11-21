import { z } from 'zod';

/** Runtime validation for data crossing a trust boundary (API input, MQTT, AI output). */

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid ISO date' });

export const OutageSchema = z.object({
  id: z.string().min(1),
  start: isoDate,
  end: isoDate,
  source: z.enum(['steg-notice', 'manual', 'model']),
  note: z.string().max(500).optional(),
});

/** What the STEG notice reader (Claude) must return. Validated before use. */
export const NoticeExtractionSchema = z.object({
  found: z.boolean(),
  governorate: z.string().nullable(),
  zone: z.string().nullable(),
  start: isoDate.nullable(),
  end: isoDate.nullable(),
  confidence: z.number().min(0).max(1),
  summary: z.string().max(400),
});

export const TelemetrySchema = z.object({
  v: z.literal(1),
  node: z.string().min(1).max(64),
  seq: z.number().int().nonnegative(),
  ts: z.number().int().positive(),
  levelPct: z.number().min(0).max(100),
  flowLpm: z.number().min(0),
  litres: z.number().min(0),
  solarW: z.number().min(0),
  grid: z.boolean(),
  pump: z.boolean(),
  valve: z.enum(['open', 'closed']),
  mode: z.enum(['BOOT', 'IDLE', 'PUMPING', 'IRRIGATING', 'GRID_DOWN', 'SAFE_STOP']),
  prev: z.string().optional(),
  sig: z.string().optional(),
});

export type NoticeExtraction = z.infer<typeof NoticeExtractionSchema>;
