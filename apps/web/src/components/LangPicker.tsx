import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useSonae, type Lang } from '../lib/store';
import { tap } from '../lib/device';
import { EASE } from './ui';

/** Each language named in its own script, so anyone can find theirs. */
const LANGS: Array<{ id: Lang; short: string; name: string; font?: string }> = [
  { id: 'en', short: 'EN', name: 'English' },
  { id: 'ar', short: 'ع', name: 'العربية', font: '"Noto Sans Arabic Variable", sans-serif' },
  { id: 'ja', short: '日', name: '日本語', font: '"Zen Kaku Gothic New", sans-serif' },
];
const LABEL: Record<Lang, string> = { en: 'Language', ar: 'اللغة', ja: '言語' };

/** Round header button that opens a small menu: English, العربية, 日本語. */
export function LangPicker({ size = 48, tone = 'ink' }: { size?: number; tone?: 'ink' | 'white' }) {
  const lang = useSonae((s) => s.lang);
  const setLang = useSonae((s) => s.setLang);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = LANGS.find((l) => l.id === lang) ?? LANGS[0]!;

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative" data-no-translate>
      <button
        onClick={() => {
          tap();
          setOpen((o) => !o);
        }}
        className={`glass glass-soft grid place-items-center rounded-full transition-transform duration-200 active:scale-90 ${tone === 'white' ? 'text-white' : 'text-ink'}`}
        style={{ width: size, height: size }}
        aria-label={`${LABEL[lang]}: ${current.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={LABEL[lang]}
      >
        <span className={current.id === 'en' ? 'text-[13px] font-extrabold' : 'text-[18px] font-bold'} style={{ fontFamily: current.font }}>
          {current.short}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.15, ease: EASE } }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            className="glass glass-edge glass-strong absolute end-0 top-[calc(100%+8px)] z-50 min-w-[168px] origin-top rounded-[18px] p-1.5"
          >
            {LANGS.map((l) => {
              const active = l.id === lang;
              return (
                <li key={l.id}>
                  <button
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      tap();
                      setLang(l.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2.5 text-start text-[15px] font-semibold transition-colors ${active ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-[color-mix(in_oklab,var(--ink)_7%,transparent)] hover:text-ink'}`}
                    lang={l.id}
                  >
                    <span style={{ fontFamily: l.font }}>{l.name}</span>
                    {active && <span className="h-2 w-2 rounded-full bg-[var(--water)]" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
