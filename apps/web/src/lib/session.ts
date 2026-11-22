import { create } from 'zustand';
import { API_URL, ApiError } from './api';

export type Role = 'admin' | 'mill' | 'farmer';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  phone: string | null;
  created_at: string;
}

export interface MillProfile {
  name: string;
  town: string;
  olivesT: number;
  margineM3: number;
  grignonT: number;
  pondM3: number;
  trucks: number;
  truckM3: number;
  seasonDays: number;
}

export interface FarmProfile {
  name: string;
  town: string;
  areaHa: number;
  trees: number;
  slopePct: number;
  distWellM: number;
  distWadiM: number;
  irrigated: boolean;
  fertiliserTND: number;
}

export interface Pack {
  id: string;
  role: 'mill' | 'farmer';
  name: string;
  priceTND: number;
  perUnitTND: number;
  unit: string;
  included: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

export interface Me {
  user: User;
  mill: MillProfile | null;
  farm: FarmProfile | null;
  subscription: { pack_id: string; status: string; started_at: string } | null;
  plans: Array<{ id: number; kind: string; created_at: string; headline: string }>;
}

export interface CostLine {
  label: string;
  tnd: number;
  kind: 'cost' | 'income' | 'saving';
  note: string;
}

export interface Facts {
  kind: 'mill' | 'farmer';
  pack: { id: string; name: string };
  totals: Record<string, number>;
  weather: { seasonDays: number; safeDays: number; months: Array<{ month: string; rainMm: number; days: number; blocked: number }>; source: string };
  money: { lines: CostLine[]; costTND: number; incomeTND: number; netTND: number; currentFertiliserTND?: number; newFertiliserTND?: number };
  pond?: { perDayM3: number; autonomyDays: number; capacityM3: number };
  capacity?: { dailyM3: number; neededPerSafeDayM3: number; enough: boolean };
  eligibility?: { allowed: boolean; reason: string | null };
  farmersGetK2oKg?: number;
  profile: MillProfile | FarmProfile;
}

export interface AiPlan {
  headline: string;
  summary: string;
  phases: Array<{ name: string; start: string; end: string; focus: string; share: number; weather: string; actions: string[] }>;
  risks: Array<{ title: string; level: 'low' | 'medium' | 'high'; mitigation: string }>;
  checklist: Array<{ when: string; task: string }>;
  tips: string[];
}

export interface SeasonPlan {
  id: number;
  created_at: string;
  facts: Facts;
  ai: AiPlan;
}

const KEY = 'sonae:session';
function load(): { token: string; user: User } | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as { token: string; user: User }) : null;
  } catch {
    return null;
  }
}

interface SessionStore {
  token: string | null;
  user: User | null;
  set: (token: string, user: User) => void;
  clear: () => void;
}

export const useSession = create<SessionStore>((set) => {
  const s = load();
  return {
    token: s?.token ?? null,
    user: s?.user ?? null,
    set: (token, user) => {
      set({ token, user });
      try {
        localStorage.setItem(KEY, JSON.stringify({ token, user }));
      } catch {
        /* private mode: signed in for this tab only */
      }
    },
    clear: () => {
      set({ token: null, user: null });
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* nothing stored */
      }
    },
  };
});

export async function call<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const token = useSession.getState().token;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(`Can't reach the Sonae server at ${API_URL}. Start it with "npm run dev:api".`);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401 && token) useSession.getState().clear();
  if (!res.ok) throw new ApiError(json.error ?? `The server answered ${res.status}.`);
  return json as T;
}

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', mill: 'Mill owner', farmer: 'Farmer' };

export function packPrice(p: Pack, amount: number): number {
  if (p.role === 'mill') return Math.round(p.priceTND + Math.max(0, amount - p.included) * p.perUnitTND);
  return Math.round(p.priceTND + amount * p.perUnitTND);
}
