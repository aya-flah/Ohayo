import { create } from 'zustand';

/** App-wide preferences. The olive plan itself lives in lib/zitoun.ts. */
export type ThemeChoice = 'system' | 'light' | 'dark';
export type Lang = 'en' | 'ar' | 'ja';

interface Persisted {
  theme: ThemeChoice;
  lang: Lang;
}

interface SonaeState extends Persisted {
  setTheme: (t: ThemeChoice) => void;
  setLang: (l: Lang) => void;
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

const initial = load();

export const useSonae = create<SonaeState>((set, get) => {
  const persist = () => {
    try {
      const { theme, lang } = get();
      localStorage.setItem(KEY, JSON.stringify({ theme, lang }));
    } catch {
      /* private mode: the app still works, it just forgets */
    }
  };
  return {
    theme: initial.theme ?? 'dark',
    lang: initial.lang ?? 'en',
    setTheme: (theme) => {
      set({ theme });
      persist();
    },
    setLang: (lang) => {
      set({ lang });
      persist();
    },
  };
});
