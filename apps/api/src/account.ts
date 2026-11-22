import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, type UserRow } from './db';
import { HttpError, createSession, endSession, hashPassword, publicUser, requireUser, verifyPassword } from './auth';
import { PACKS, packCost } from './packs';
import { farmFacts, generateSeasonPlan, millFacts, type FarmProfile, type MillProfile } from './season';
import { spend } from './budget';

const Email = z.string().trim().toLowerCase().email().max(120);
const Password = z.string().min(8, 'Use at least 8 characters.').max(128);

interface MillRow { name: string; town: string; olives_t: number; margine_m3: number; grignon_t: number; pond_m3: number; trucks: number; truck_m3: number; season_days: number }
interface FarmRow { name: string; town: string; area_ha: number; trees: number; slope_pct: number; dist_well_m: number; dist_wadi_m: number; irrigated: number; fertiliser_tnd: number }

const millOf = (id: number): MillProfile | null => {
  const r = db.prepare('SELECT * FROM mills WHERE user_id = ?').get(id) as MillRow | undefined;
  return r ? { name: r.name, town: r.town, olivesT: r.olives_t, margineM3: r.margine_m3, grignonT: r.grignon_t, pondM3: r.pond_m3, trucks: r.trucks, truckM3: r.truck_m3, seasonDays: r.season_days } : null;
};
const farmOf = (id: number): FarmProfile | null => {
  const r = db.prepare('SELECT * FROM farms WHERE user_id = ?').get(id) as FarmRow | undefined;
  return r ? { name: r.name, town: r.town, areaHa: r.area_ha, trees: r.trees, slopePct: r.slope_pct, distWellM: r.dist_well_m, distWadiM: r.dist_wadi_m, irrigated: !!r.irrigated, fertiliserTND: r.fertiliser_tnd } : null;
};
const subOf = (id: number) => (db.prepare('SELECT pack_id, status, started_at FROM subscriptions WHERE user_id = ?').get(id) as { pack_id: string; status: string; started_at: string } | undefined) ?? null;

const MillBody = z.object({
  name: z.string().trim().min(2).max(80),
  town: z.string().trim().min(2).max(40),
  olivesT: z.number().min(10).max(100_000),
  margineM3: z.number().min(5).max(100_000),
  grignonT: z.number().min(1).max(50_000),
  pondM3: z.number().min(10).max(100_000),
  trucks: z.number().int().min(1).max(50),
  truckM3: z.number().min(2).max(40),
  seasonDays: z.number().int().min(20).max(150),
});
const FarmBody = z.object({
  name: z.string().trim().min(2).max(80),
  town: z.string().trim().min(2).max(40),
  areaHa: z.number().min(0.2).max(5000),
  trees: z.number().int().min(1).max(500_000),
  slopePct: z.number().min(0).max(60),
  distWellM: z.number().min(0).max(50_000),
  distWadiM: z.number().min(0).max(50_000),
  irrigated: z.boolean(),
  fertiliserTND: z.number().min(0).max(1_000_000),
});

const plansOf = (id: number) =>
  (db.prepare('SELECT id, kind, output_json, created_at FROM plans WHERE user_id = ? ORDER BY id DESC LIMIT 10').all(id) as Array<{ id: number; kind: string; output_json: string; created_at: string }>).map((p) => ({
    id: p.id,
    kind: p.kind,
    created_at: p.created_at,
    headline: (JSON.parse(p.output_json) as { ai?: { headline?: string } }).ai?.headline ?? 'Season plan',
  }));

export async function registerAccount(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/auth/signup', strict, async (req) => {
    const b = z.object({ email: Email, password: Password, name: z.string().trim().min(2).max(80), role: z.enum(['mill', 'farmer']), phone: z.string().trim().max(30).optional() }).parse(req.body);
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(b.email)) throw new HttpError(409, 'An account already uses this email. Sign in instead.');
    const res = db.prepare('INSERT INTO users (email, name, role, phone, password_hash) VALUES (?, ?, ?, ?, ?)').run(b.email, b.name, b.role, b.phone ?? null, await hashPassword(b.password));
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(res.lastInsertRowid)) as unknown as UserRow;
    return { token: createSession(user.id), user: publicUser(user) };
  });

  app.post('/auth/login', strict, async (req) => {
    const b = z.object({ email: Email, password: z.string().min(1).max(128) }).parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(b.email) as UserRow | undefined;
    // Same message either way, so the form can't be used to find out who has an account.
    if (!user || !(await verifyPassword(b.password, user.password_hash))) throw new HttpError(401, 'Wrong email or password.');
    if (!user.active) throw new HttpError(403, 'This account is suspended. Contact Sonae.');
    return { token: createSession(user.id), user: publicUser(user) };
  });

  app.post('/auth/logout', async (req) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) endSession(auth.slice(7));
    return { ok: true };
  });

  app.get('/packs', async () => PACKS);

  app.get('/me', async (req) => {
    const u = requireUser(req.headers.authorization);
    return { user: publicUser(u), mill: u.role === 'mill' ? millOf(u.id) : null, farm: u.role === 'farmer' ? farmOf(u.id) : null, subscription: subOf(u.id), plans: plansOf(u.id) };
  });

  app.put('/me/mill', async (req) => {
    const u = requireUser(req.headers.authorization, ['mill']);
    const b = MillBody.parse(req.body);
    db.prepare(
      `INSERT INTO mills (user_id, name, town, olives_t, margine_m3, grignon_t, pond_m3, trucks, truck_m3, season_days, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET name=excluded.name, town=excluded.town, olives_t=excluded.olives_t, margine_m3=excluded.margine_m3, grignon_t=excluded.grignon_t, pond_m3=excluded.pond_m3, trucks=excluded.trucks, truck_m3=excluded.truck_m3, season_days=excluded.season_days, updated_at=datetime('now')`,
    ).run(u.id, b.name, b.town, b.olivesT, b.margineM3, b.grignonT, b.pondM3, b.trucks, b.truckM3, b.seasonDays);
    return { mill: millOf(u.id) };
  });

  app.put('/me/farm', async (req) => {
    const u = requireUser(req.headers.authorization, ['farmer']);
    const b = FarmBody.parse(req.body);
    db.prepare(
      `INSERT INTO farms (user_id, name, town, area_ha, trees, slope_pct, dist_well_m, dist_wadi_m, irrigated, fertiliser_tnd, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET name=excluded.name, town=excluded.town, area_ha=excluded.area_ha, trees=excluded.trees, slope_pct=excluded.slope_pct, dist_well_m=excluded.dist_well_m, dist_wadi_m=excluded.dist_wadi_m, irrigated=excluded.irrigated, fertiliser_tnd=excluded.fertiliser_tnd, updated_at=datetime('now')`,
    ).run(u.id, b.name, b.town, b.areaHa, b.trees, b.slopePct, b.distWellM, b.distWadiM, b.irrigated ? 1 : 0, b.fertiliserTND);
    return { farm: farmOf(u.id) };
  });

  app.post('/me/subscribe', async (req) => {
    const u = requireUser(req.headers.authorization, ['mill', 'farmer']);
    const { packId } = z.object({ packId: z.string().max(40) }).parse(req.body);
    const pack = PACKS.find((p) => p.id === packId && p.role === u.role);
    if (!pack) throw new HttpError(400, 'This pack is not for your account type.');
    // Demo: no payment is taken. A real launch would add a payment step (e.g. bank transfer or D17) before "active".
    db.prepare(`INSERT INTO subscriptions (user_id, pack_id, status, started_at) VALUES (?, ?, 'active', datetime('now')) ON CONFLICT(user_id) DO UPDATE SET pack_id=excluded.pack_id, status='active', started_at=datetime('now')`).run(u.id, pack.id);
    return { subscription: subOf(u.id) };
  });

  /** Numbers only, instantly (no AI): what the season costs on the chosen pack. */
  app.post('/me/estimate', async (req) => {
    const u = requireUser(req.headers.authorization, ['mill', 'farmer']);
    const { packId } = z.object({ packId: z.string().max(40).optional() }).parse(req.body ?? {});
    if (u.role === 'mill') {
      const m = millOf(u.id);
      if (!m) throw new HttpError(400, 'Fill in your mill first.');
      return millFacts(m, packId ?? subOf(u.id)?.pack_id);
    }
    const f = farmOf(u.id);
    if (!f) throw new HttpError(400, 'Fill in your farm first.');
    return farmFacts(f, packId ?? subOf(u.id)?.pack_id);
  });

  app.post('/me/plan', { config: { rateLimit: { max: 4, timeWindow: '1 minute' } } }, async (req) => {
    const u = requireUser(req.headers.authorization, ['mill', 'farmer']);
    const packId = subOf(u.id)?.pack_id;
    let facts;
    if (u.role === 'mill') {
      const m = millOf(u.id);
      if (!m) throw new HttpError(400, 'Fill in your mill first.');
      facts = millFacts(m, packId);
    } else {
      const f = farmOf(u.id);
      if (!f) throw new HttpError(400, 'Fill in your farm first.');
      facts = farmFacts(f, packId);
    }
    const { ai, usd } = await generateSeasonPlan(facts);
    const out = { facts, ai };
    const res = db.prepare('INSERT INTO plans (user_id, kind, input_json, output_json, cost_usd) VALUES (?, ?, ?, ?, ?)').run(u.id, u.role, JSON.stringify(facts.profile), JSON.stringify(out), usd);
    return { id: Number(res.lastInsertRowid), created_at: new Date().toISOString(), ...out };
  });

  app.get('/me/plans/:id', async (req) => {
    const u = requireUser(req.headers.authorization);
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const row = db.prepare('SELECT id, output_json, created_at, user_id FROM plans WHERE id = ?').get(id) as { id: number; output_json: string; created_at: string; user_id: number } | undefined;
    if (!row || (row.user_id !== u.id && u.role !== 'admin')) throw new HttpError(404, 'Plan not found.');
    return { id: row.id, created_at: row.created_at, ...JSON.parse(row.output_json) };
  });

  /* ── Admin ── */

  app.get('/admin/overview', async (req) => {
    requireUser(req.headers.authorization, ['admin']);
    const users = db.prepare('SELECT id, email, name, role, phone, active, created_at FROM users ORDER BY id DESC LIMIT 200').all() as Array<{ id: number; email: string; name: string; role: string; phone: string | null; active: number; created_at: string }>;
    const subs = db.prepare('SELECT user_id, pack_id, status, started_at FROM subscriptions').all() as Array<{ user_id: number; pack_id: string; status: string; started_at: string }>;
    const revenue = subs.reduce((sum, s) => {
      const pack = PACKS.find((p) => p.id === s.pack_id);
      if (!pack) return sum;
      const amount = pack.role === 'mill' ? (millOf(s.user_id)?.margineM3 ?? pack.included) : (farmOf(s.user_id)?.areaHa ?? 0);
      return sum + packCost(pack, amount);
    }, 0);
    const plans = db.prepare('SELECT p.id, p.kind, p.created_at, p.cost_usd, u.name FROM plans p JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 20').all() as Array<{ id: number; kind: string; created_at: string; cost_usd: number; name: string }>;
    const mills = db.prepare('SELECT COALESCE(SUM(margine_m3),0) m, COALESCE(SUM(grignon_t),0) g FROM mills').get() as { m: number; g: number };
    const farms = db.prepare('SELECT COALESCE(SUM(area_ha),0) a FROM farms').get() as { a: number };
    return {
      counts: { mill: users.filter((u) => u.role === 'mill').length, farmer: users.filter((u) => u.role === 'farmer').length, admin: users.filter((u) => u.role === 'admin').length, plans: (db.prepare('SELECT COUNT(*) c FROM plans').get() as { c: number }).c },
      seasonRevenueTND: revenue,
      volume: { margineM3: mills.m, grignonT: mills.g, farmHa: farms.a },
      packs: PACKS.map((p) => ({ id: p.id, name: p.name, role: p.role, subscribers: subs.filter((s) => s.pack_id === p.id).length })),
      users: users.map((u) => ({ ...u, pack: subs.find((s) => s.user_id === u.id)?.pack_id ?? null })),
      plans,
      ai: spend(),
    };
  });

  app.patch('/admin/users/:id', async (req) => {
    const admin = requireUser(req.headers.authorization, ['admin']);
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    if (id === admin.id) throw new HttpError(400, 'You cannot suspend your own account.');
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
    if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    return { ok: true };
  });
}
