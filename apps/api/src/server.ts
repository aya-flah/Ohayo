import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { plan, turnSms } from '@sonae/engine';
import { DEMO_FARMERS, DEMO_GDA, demoForecast, demoOutages, demoPlots, toMs, OutageSchema, type PlanInput } from '@sonae/shared';
import { ask, readNotice, BudgetExceededError } from './ai';
import { spend } from './budget';
import { readLab, zitounAsk } from './zitoun-ai';
import { registerAccount } from './account';
import { seedAccounts } from './auth';
import { confirmDelivery, oracleReady } from './oracle';

const app = Fastify({ logger: { level: 'info' }, bodyLimit: 6 * 1024 * 1024 });
const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174').split(',').map((s) => s.trim());

await app.register(helmet);
await app.register(cors, { origin: origins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['content-type', 'authorization'] });
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

/** Sensitive actions need the shared bearer token (until full login lands). */
function requireToken(auth: string | undefined) {
  const token = process.env.API_TOKEN;
  if (!token || token === 'change-me' || auth !== `Bearer ${token}`) {
    const err = new Error('Missing or wrong API token.') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
}

const DEMO_NOW = '2026-07-20T14:00:00+01:00';
function demoInput(): PlanInput {
  const nowMs = toMs(DEMO_NOW);
  return { gda: DEMO_GDA, farmers: DEMO_FARMERS, plots: demoPlots(nowMs), forecast: demoForecast(nowMs, 72, 1), outages: demoOutages(nowMs), now: DEMO_NOW };
}

app.setErrorHandler((error: Error & { statusCode?: number; issues?: Array<{ message: string; path: Array<string | number> }> }, _req, reply) => {
  if (error instanceof BudgetExceededError) return reply.code(402).send({ error: error.message });
  if (error.name === 'ZodError' && error.issues?.length) {
    const i = error.issues[0]!;
    return reply.code(400).send({ error: `${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}` });
  }
  const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  if (status >= 500) app.log.error(error);
  return reply.code(status).send({ error: status >= 500 ? 'Something went wrong on the server.' : error.message });
});

app.get('/health', async () => ({ ok: true, service: 'sonae-api', ai: { ...spend(), configured: !!process.env.ANTHROPIC_API_KEY }, oracle: oracleReady() }));

/** The pitch scenario, computed by the same engine the apps run offline. */
app.get('/plans/demo', async () => plan(demoInput()));

app.post('/plans', async (req) => {
  const body = req.body as Partial<PlanInput> | undefined;
  if (!body?.gda || !Array.isArray(body.plots) || !Array.isArray(body.forecast) || !body.now) {
    const err = new Error('Send gda, plots, forecast, outages and now.') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  const outages = z.array(OutageSchema).parse(body.outages ?? []);
  return plan({ ...(body as PlanInput), farmers: body.farmers ?? [], outages });
});

app.post('/sms/preview', async () => {
  const input = demoInput();
  const p = plan(input);
  return p.turns.map((t) => {
    const plot = input.plots.find((x) => x.id === t.plotId)!;
    const farmer = input.farmers.find((f) => f.id === t.farmerId);
    return { farmer: farmer?.name, phone: farmer?.phone, sms: turnSms(t, plot, toMs(input.now), farmer?.smsScript ?? 'latin') };
  });
});

const NoticeBody = z.object({
  text: z.string().max(5000).optional(),
  imageBase64: z.string().max(5_000_000).optional(),
  imageType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

app.post('/ai/notice', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
  const body = NoticeBody.parse(req.body);
  if (!body.text && !body.imageBase64) {
    const err = new Error('Send the notice text or a screenshot.') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  return readNotice(body);
});

app.post('/ai/ask', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (req) => {
  const { question } = z.object({ question: z.string().min(3).max(1000) }).parse(req.body);
  return ask(question, demoInput());
});

/* ── Sonae Zitoun ─────────────────────────────────────────────────── */

const LabBody = z.object({
  text: z.string().max(20_000).optional(),
  imageBase64: z.string().max(8_000_000).optional(),
  imageType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
  pdfBase64: z.string().max(8_000_000).optional(),
  lang: z.enum(['en', 'ar']).optional(),
});

app.post('/zitoun/lab', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (req) => {
  const body = LabBody.parse(req.body);
  if (!body.text && !body.imageBase64 && !body.pdfBase64) {
    const err = new Error('Send the lab report as text, a photo or a PDF.') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  return readLab(body);
});

const AskBody = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(2000) })).min(1).max(20),
  lang: z.enum(['en', 'ar']).optional(),
});

app.post('/zitoun/ask', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (req) => {
  const { messages, lang } = AskBody.parse(req.body);
  if (messages[messages.length - 1]!.role !== 'user') {
    const err = new Error('The last message must be the question.') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  return zitounAsk(messages, undefined, lang ?? 'en');
});

app.get('/admin/ai-spend', async (req) => {
  requireToken(req.headers.authorization);
  return spend();
});

app.post('/exchange/orders/:id/confirm', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
  requireToken(req.headers.authorization);
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
  const { measured } = z.object({ measured: z.number().nonnegative() }).parse(req.body);
  const hash = await confirmDelivery(id, measured);
  return { ok: true, hash };
});

await registerAccount(app);
await seedAccounts();

const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: '0.0.0.0' });
