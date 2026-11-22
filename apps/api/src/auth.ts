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
export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, expires);
  await db.run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString());
  return token;
}

export async function endSession(token: string) {
  await db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

export type PublicUser = Pick<UserRow, 'id' | 'email' | 'name' | 'role' | 'phone' | 'created_at'>;

export const publicUser = (u: UserRow): PublicUser => ({ id: u.id, email: u.email, name: u.name, role: u.role, phone: u.phone, created_at: u.created_at });

export async function userFromToken(auth: string | undefined): Promise<UserRow | null> {
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (token.length < 20) return null;
  const row = await db.get<UserRow>('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1', sha256(token), new Date().toISOString());
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

export async function requireUser(auth: string | undefined, roles?: Role[]): Promise<UserRow> {
  const u = await userFromToken(auth);
  if (!u) throw new HttpError(401, 'Please sign in again.');
  if (roles && !roles.includes(u.role)) throw new HttpError(403, 'Your account cannot do this.');
  return u;
}

/** Admin and demo accounts come from environment variables only: no password lives in the code. */
export async function seedAccounts() {
  const seed = async (email: string | undefined, password: string | undefined, name: string, role: Role) => {
    if (!email || !password || password.length < 8) return;
    const exists = await db.get('SELECT id FROM users WHERE email = ?', email.toLowerCase());
    if (exists) return;
    await db.run('INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)', email.toLowerCase(), name, role, await hashPassword(password));
  };
  await seed(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, 'Sonae admin', 'admin');
  const demo = process.env.DEMO_PASSWORD;
  await seed(process.env.DEMO_MILL_EMAIL, process.env.DEMO_MILL_PASSWORD || demo, 'Maâsra El Amel', 'mill');
  await seed(process.env.DEMO_FARMER_EMAIL, process.env.DEMO_FARMER_PASSWORD || demo, 'Hédi Ben Ali', 'farmer');
}
