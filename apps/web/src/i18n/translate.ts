import { useSonae, type Lang } from '../lib/store';

/**
 * Arabic for the whole interface, without touching every component: a MutationObserver
 * swaps each English text node (and placeholders, titles, aria-labels) for its Arabic
 * translation from ar.json, and puts the English back when the user switches language.
 * React keeps rendering English; whenever it changes a text, the observer translates again.
 * Dynamic sentences are handled by the patterns below (numbers kept as they are).
 */
let AR: Record<string, string> = {};
let TEMPLATES: Array<{ re: RegExp; order: number[]; ar: string }> = [];
let loaded: Promise<void> | null = null;
const esc = (s: string) => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
const loadDict = () =>
  (loaded ??= Promise.all([import('./ar.json'), import('./ar-templates.json')]).then(([a, t]) => {
    AR = a.default as Record<string, string>;
    TEMPLATES = Object.entries(t.default as Record<string, string>)
      .map(([en, ar]) => {
        const order: number[] = [];
        const src = en.split(/(\{\d+\})/).map((part) => {
          const m = part.match(/^\{(\d+)\}$/);
          if (m) {
            order.push(Number(m[1]));
            return '(.*?)';
          }
          return esc(part);
        });
        return { re: new RegExp(`^${src.join('')}$`), order, ar, weight: en.replace(/\{\d+\}/g, '').length };
      })
      .filter((x) => x.weight >= 4)
      .sort((a, b) => b.weight - a.weight);
  }));

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const original = new WeakMap<Text, string>();
const written = new WeakMap<Text, string>();
const attrOriginal = new WeakMap<Element, Record<string, string>>();
const touched = new Set<Text>();
const touchedEls = new Set<Element>();
let lang: Lang = 'en';
let observer: MutationObserver | null = null;

const MONTHS: Record<string, string> = { Jan: 'جانفي', Feb: 'فيفري', Mar: 'مارس', Apr: 'أفريل', May: 'ماي', Jun: 'جوان', Jul: 'جويلية', Aug: 'أوت', Sep: 'سبتمبر', Oct: 'أكتوبر', Nov: 'نوفمبر', Dec: 'ديسمبر' };
const DAYS: Record<string, string> = { Sun: 'الأحد', Mon: 'الاثنين', Tue: 'الثلاثاء', Wed: 'الأربعاء', Thu: 'الخميس', Fri: 'الجمعة', Sat: 'السبت', Sunday: 'الأحد', Monday: 'الاثنين', Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء', Thursday: 'الخميس', Friday: 'الجمعة', Saturday: 'السبت' };

/** Sentences built from numbers and names. */
const PATTERNS: Array<[RegExp, (...m: string[]) => string]> = [
  [/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/, (_, d, n, m) => `${DAYS[d]} ${n} ${MONTHS[m]}`],
  [/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/, (_, n, m) => `${n} ${MONTHS[m]}`],
  [/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/, (_, d) => DAYS[d]!],
  [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/, (_, m) => MONTHS[m]!],
  [/^Day (\d+)$/, (_, n) => `اليوم ${n}`],
  [/^Ponds (\d+)%$/, (_, n) => `الأحواض ${n}%`],
  [/^(\d+) tanker trips$/, (_, n) => `${n} رحلة صهريج`],
  [/^trip (\d+) · ([\d.,]+) km round trip$/, (_, n, k) => `الرحلة ${n} · ${k} كم ذهابًا وإيابًا`],
  [/^([\d.,]+) m³ · (\d+) tankers?$/, (_, v, n) => `${v} م³ · ${n} صهريج`],
  [/^\+(\d[\d.,]*) mm (.+)$/, (_, v, d) => `+${v} مم ${AR[d] ?? d}`],
  [/^(\d[\d,]*) m³ left$/, (_, v) => `بقي ${v} م³`],
  [/^Never: (.+)$/, (_, r) => `أبدًا: ${r}`],
  [/^(\d+) on the road · confirm within (\d+) h or it expires$/, (_, a, h) => `${a} في الطريق · يجب التأكيد خلال ${h} ساعة وإلا تنتهي`],
  [/^Lot #(\d+) · ([\d.,]+) t left$/, (_, n, t) => `دفعة #${n} · بقي ${t} طن`],
  [/^How it works · step (\d+) of (\d+)$/, (_, a, b) => `كيف يعمل · الخطوة ${a} من ${b}`],
  [/^(\d+)\/(\d+) characters, Derja in Latin script$/, (_, a, b) => `${a}/${b} حرفًا، بالدارجة بحروف لاتينية`],
  [/^Choose (.+)$/, (_, p) => `اختر ${p}`],
  [/^Start with (.+)$/, (_, p) => `ابدأ بـ ${p}`],
  [/^Dispatch (\d+) m³$/, (_, n) => `إرسال ${n} م³`],
];

function translateString(raw: string): string | null {
  const key = raw.replace(/\s+/g, ' ').trim();
  if (!key || !/[A-Za-z]/.test(key)) return null;
  const hit = AR[key];
  if (hit) return raw.replace(raw.trim(), hit);
  for (const [re, fn] of PATTERNS) {
    const m = key.match(re);
    if (m) return raw.replace(raw.trim(), fn(...m));
  }
  for (const t of TEMPLATES) {
    const m = key.match(t.re);
    if (!m) continue;
    const values: Record<number, string> = {};
    t.order.forEach((n, i) => {
      const v = m[i + 1] ?? '';
      values[n] = AR[v.trim()] ? v.replace(v.trim(), AR[v.trim()]!) : v;
    });
    return raw.replace(raw.trim(), t.ar.replace(/\{(\d+)\}/g, (_, n) => values[Number(n)] ?? ''));
  }
  return null;
}

const skip = (el: Element | null) => !!el?.closest('script, style, textarea, code, [data-no-translate], .notranslate');

function doText(node: Text) {
  if (skip(node.parentElement)) return;
  const v = node.nodeValue ?? '';
  if (written.get(node) === v) return; // our own Arabic
  const ar = translateString(v);
  if (ar === null) {
    original.delete(node);
    return;
  }
  original.set(node, v);
  written.set(node, ar);
  touched.add(node);
  node.nodeValue = ar;
}

function doAttrs(el: Element) {
  if (skip(el)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const store = attrOriginal.get(el) ?? {};
    if (store[`w:${a}`] === v) continue;
    const ar = translateString(v);
    if (ar === null) continue;
    store[a] = v;
    store[`w:${a}`] = ar;
    attrOriginal.set(el, store);
    touchedEls.add(el);
    el.setAttribute(a, ar);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  doAttrs(el);
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = tw.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else doAttrs(n as Element);
    n = tw.nextNode();
  }
}

function restore() {
  for (const node of touched) {
    const o = original.get(node);
    if (o !== undefined && node.nodeValue === written.get(node)) node.nodeValue = o;
    original.delete(node);
    written.delete(node);
  }
  touched.clear();
  for (const el of touchedEls) {
    const store = attrOriginal.get(el);
    if (!store) continue;
    for (const a of ATTRS) if (store[a] !== undefined && el.getAttribute(a) === store[`w:${a}`]) el.setAttribute(a, store[a]!);
    attrOriginal.delete(el);
  }
  touchedEls.clear();
}

async function apply(next: Lang) {
  lang = next;
  const html = document.documentElement;
  html.lang = next;
  html.dir = next === 'ar' ? 'rtl' : 'ltr';
  if (next === 'en') {
    observer?.disconnect();
    observer = null;
    restore();
    return;
  }
  await loadDict();
  if (lang !== 'ar') return;
  walk(document.body);
  if (!observer) {
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') doText(m.target as Text);
        else if (m.type === 'attributes') doAttrs(m.target as Element);
        else m.addedNodes.forEach(walk);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  }
}

/** Starts the translator and follows the language setting. */
export function startTranslator() {
  apply(useSonae.getState().lang);
  useSonae.subscribe((s, prev) => {
    if (s.lang !== prev.lang) apply(s.lang);
  });
}

/** For code that builds text itself (AI requests): the current language. */
export const currentLang = () => useSonae.getState().lang;
