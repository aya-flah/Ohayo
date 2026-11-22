import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * One SQLite file (Node's built-in driver: no server, no native build). Users, sessions,
 * mill and farm profiles, pack subscriptions and generated season plans. The schema is plain
 * SQL, so moving to Postgres later is a connection-string change, not a rewrite.
 */
const here = dirname(fileURLToPath(import.meta.url));
const FILE = process.env.DB_FILE ?? join(here, '..', 'data', 'sonae.db');
mkdirSync(dirname(FILE), { recursive: true });

export const db = new DatabaseSync(FILE);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'mill', 'farmer')),
  phone TEXT,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mills (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  town TEXT NOT NULL,
  olives_t REAL NOT NULL,
  margine_m3 REAL NOT NULL,
  grignon_t REAL NOT NULL,
  pond_m3 REAL NOT NULL,
  trucks INTEGER NOT NULL,
  truck_m3 REAL NOT NULL,
  season_days INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS farms (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  town TEXT NOT NULL,
  area_ha REAL NOT NULL,
  trees INTEGER NOT NULL,
  slope_pct REAL NOT NULL,
  dist_well_m REAL NOT NULL,
  dist_wadi_m REAL NOT NULL,
  irrigated INTEGER NOT NULL,
  fertiliser_tnd REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export type Role = 'admin' | 'mill' | 'farmer';

export interface UserRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  phone: string | null;
  password_hash: string;
  active: number;
  created_at: string;
}
