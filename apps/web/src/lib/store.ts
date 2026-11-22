import { create } from 'zustand';

/** App-wide preferences. The olive plan itself lives in lib/zitoun.ts. */
export type ThemeChoice = 'system' | 'light' | 'dark';

interface Persisted {
  theme: ThemeChoice;
}

interface SonaeState extends Persisted {
  setTheme: (t: ThemeChoice) => void;
}

const KEY = 'sonae:v1';

function load(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

export const useSonae = create<SonaeState>((set) => ({
  theme: load().theme ?? 'dark',
  setTheme: (theme) => {
    set({ theme });
    try {
      localStorage.setItem(KEY, JSON.stringify({ theme }));
    } catch {
      /* private mode: the app still works, it just forgets */
    }
  },
}));
