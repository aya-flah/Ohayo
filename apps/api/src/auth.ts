import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db, type Role, type UserRow } from './db';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const SESSION_DAYS = 7;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, keyHex] = stored.split(':');
  if (algo !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(keyHex, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** A random token for the client; only its hash is stored, so a leaked database can't be replayed. */
export function createSession(userId: number): string {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
  return token;
}

export function endSession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export type PublicUser = Pick<UserRow, 'id' | 'email' | 'name' | 'role' | 'phone' | 'created_at'>;

export const publicUser = (u: UserRow): PublicUser => ({ id: u.id, email: u.email, name: u.name, role: u.role, phone: u.phone, created_at: u.created_at });

export function userFromToken(auth: string | undefined): UserRow | null {
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (token.length < 20) return null;
  const row = db
    .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1')
    .get(sha256(token), new Date().toISOString()) as UserRow | undefined;
  return row ?? null;
}

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function requireUser(auth: string | undefined, roles?: Role[]): UserRow {
  const u = userFromToken(auth);
  if (!u) throw new HttpError(401, 'Please sign in again.');
  if (roles && !roles.includes(u.role)) throw new HttpError(403, 'Your account cannot do this.');
  return u;
}

/** Admin and demo accounts come from environment variables only: no password lives in the code. */
export async function seedAccounts() {
  const seed = async (email: string | undefined, password: string | undefined, name: string, role: Role) => {
    if (!email || !password || password.length < 8) return;
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (exists) return;
    db.prepare('INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)').run(email.toLowerCase(), name, role, await hashPassword(password));
  };
  await seed(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, 'Sonae admin', 'admin');
  const demo = process.env.DEMO_PASSWORD;
  await seed(process.env.DEMO_MILL_EMAIL, demo, 'Maâsra El Amel', 'mill');
  await seed(process.env.DEMO_FARMER_EMAIL, demo, 'Hédi Ben Ali', 'farmer');
}
