import { useSonae, type Lang } from '../lib/store';

/**
 * Arabic and Japanese for the whole interface, without touching every component: a MutationObserver
 * swaps each English text node (and placeholders, titles, aria-labels) for its translation
 * from ar.json / ja.json, and puts the English back when the user switches language.
 * React keeps rendering English; whenever it changes a text, the observer translates again.
 * Dynamic sentences are handled by the patterns below (numbers kept as they are).
 */
type Foreign = Exclude<Lang, 'en'>;
let AR: Record<string, string> = {};
let TEMPLATES: Array<{ re: RegExp; order: number[]; ar: string }> = [];
const DICTS: Partial<Record<Foreign, { words: Record<string, string>; templates: typeof TEMPLATES }>> = {};
const loading: Partial<Record<Foreign, Promise<void>>> = {};
const esc = (s: string) => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
const SOURCES: Record<Foreign, () => Promise<[{ default: unknown }, { default: unknown }]>> = {
  ar: () => Promise.all([import('./ar.json'), import('./ar-templates.json')]),
  ja: () => Promise.all([import('./ja.json'), import('./ja-templates.json')]),
};
/** Loads one language's words and sentence patterns (once), then makes it the active dictionary. */
const loadDict = (l: Foreign) =>
  (loading[l] ??= SOURCES[l]().then(([a, t]) => {
    const words = a.default as Record<string, string>;
    const templates = Object.entries(t.default as Record<string, string>)
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
    DICTS[l] = { words, templates };
  })).then(() => {
    AR = DICTS[l]!.words;
    TEMPLATES = DICTS[l]!.templates;
  });

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const original = new WeakMap<Text, string>();
const written = new WeakMap<Text, string>();
const attrOriginal = new WeakMap<Element, Record<string, string>>();
const touched = new Set<Text>();
const touchedEls = new Set<Element>();
let lang: Lang = 'en';
let observer: MutationObserver | null = null;

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHS: Record<Foreign, Record<string, string>> = {
  ar: { Jan: 'جانفي', Feb: 'فيفري', Mar: 'مارس', Apr: 'أفريل', May: 'ماي', Jun: 'جوان', Jul: 'جويلية', Aug: 'أوت', Sep: 'سبتمبر', Oct: 'أكتوبر', Nov: 'نوفمبر', Dec: 'ديسمبر' },
  ja: Object.fromEntries(MON.map((m, i) => [m, `${i + 1}月`])),
};
const DAYS: Record<Foreign, Record<string, string>> = {
  ar: { Sun: 'الأحد', Mon: 'الاثنين', Tue: 'الثلاثاء', Wed: 'الأربعاء', Thu: 'الخميس', Fri: 'الجمعة', Sat: 'السبت', Sunday: 'الأحد', Monday: 'الاثنين', Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء', Thursday: 'الخميس', Friday: 'الجمعة', Saturday: 'السبت' },
  ja: { Sun: '日', Mon: '月', Tue: '火', Wed: '水', Thu: '木', Fri: '金', Sat: '土', Sunday: '日曜日', Monday: '月曜日', Tuesday: '火曜日', Wednesday: '水曜日', Thursday: '木曜日', Friday: '金曜日', Saturday: '土曜日' },
};

/** Sentences built from numbers and names, per language. */
type Pattern = [RegExp, (...m: string[]) => string];
const D = '(Sun|Mon|Tue|Wed|Thu|Fri|Sat)';
const M = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
const PATTERNS: Record<Foreign, Pattern[]> = {
  ar: [
    [new RegExp(`^${D} (\\d{1,2}) ${M}$`), (_, d, n, m) => `${DAYS.ar[d!]} ${n} ${MONTHS.ar[m!]}`],
    [new RegExp(`^(\\d{1,2}) ${M}$`), (_, n, m) => `${n} ${MONTHS.ar[m!]}`],
    [/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/, (_, d) => DAYS.ar[d!]!],
    [new RegExp(`^${M}$`), (_, m) => MONTHS.ar[m!]!],
    [/^Day (\d+)$/, (_, n) => `اليوم ${n}`],
    [/^Ponds (\d+)%$/, (_, n) => `الأحواض ${n}%`],
    [/^(\d+) tanker trips$/, (_, n) => `${n} رحلة صهريج`],
    [/^trip (\d+) · ([\d.,]+) km round trip$/, (_, n, k) => `الرحلة ${n} · ${k} كم ذهابًا وإيابًا`],
    [/^([\d.,]+) m³ · (\d+) tankers?$/, (_, v, n) => `${v} م³ · ${n} صهريج`],
    [/^\+(\d[\d.,]*) mm (.+)$/, (_, v, d) => `+${v} مم ${AR[d!] ?? d}`],
    [/^(\d[\d,]*) m³ left$/, (_, v) => `بقي ${v} م³`],
    [/^Never: (.+)$/, (_, r) => `أبدًا: ${r}`],
    [/^(\d+) on the road · confirm within (\d+) h or it expires$/, (_, a, h) => `${a} في الطريق · يجب التأكيد خلال ${h} ساعة وإلا تنتهي`],
    [/^Lot #(\d+) · ([\d.,]+) t left$/, (_, n, t) => `دفعة #${n} · بقي ${t} طن`],
    [/^How it works · step (\d+) of (\d+)$/, (_, a, b) => `كيف يعمل · الخطوة ${a} من ${b}`],
    [/^Step (\d+) of (\d+)$/, (_, a, b) => `الخطوة ${a} من ${b}`],
    [/^(\d+)\/(\d+) characters, Derja in Latin script$/, (_, a, b) => `${a}/${b} حرفًا، بالدارجة بحروف لاتينية`],
    [/^Choose (.+)$/, (_, p) => `اختر ${p}`],
    [/^Start with (.+)$/, (_, p) => `ابدأ بـ ${p}`],
    [/^Dispatch (\d+) m³$/, (_, n) => `إرسال ${n} م³`],
    [new RegExp(`^(\\d{1,2}) ${M}, (\\d{2}:\\d{2})$`), (_, n, m, t) => `${n} ${MONTHS.ar[m!]}، ${t}`],
    [/^(.+) pond$/, (_, n) => `حوض ${n}`],
  ],
  ja: [
    [new RegExp(`^${D} (\\d{1,2}) ${M}$`), (_, d, n, m) => `${MONTHS.ja[m!]}${n}日(${DAYS.ja[d!]})`],
    [new RegExp(`^(\\d{1,2}) ${M}$`), (_, n, m) => `${MONTHS.ja[m!]}${n}日`],
    [/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/, (_, d) => DAYS.ja[d!]!],
    [new RegExp(`^${M}$`), (_, m) => MONTHS.ja[m!]!],
    [/^Day (\d+)$/, (_, n) => `${n}日目`],
    [/^Ponds (\d+)%$/, (_, n) => `貯留池 ${n}%`],
    [/^(\d+) tanker trips$/, (_, n) => `タンクローリー ${n}便`],
    [/^trip (\d+) · ([\d.,]+) km round trip$/, (_, n, k) => `${n}便目 · 往復 ${k} km`],
    [/^([\d.,]+) m³ · (\d+) tankers?$/, (_, v, n) => `${v} m³ · タンクローリー ${n}台`],
    [/^\+(\d[\d.,]*) mm (.+)$/, (_, v, d) => `+${v} mm ${AR[d!] ?? d}`],
    [/^(\d[\d,]*) m³ left$/, (_, v) => `残り ${v} m³`],
    [/^Never: (.+)$/, (_, r) => `不可: ${r}`],
    [/^(\d+) on the road · confirm within (\d+) h or it expires$/, (_, a, h) => `${a}件 輸送中 · ${h}時間以内に確認しないと失効`],
    [/^Lot #(\d+) · ([\d.,]+) t left$/, (_, n, t) => `ロット #${n} · 残り ${t} t`],
    [/^How it works · step (\d+) of (\d+)$/, (_, a, b) => `仕組み · ステップ ${a}/${b}`],
    [/^Step (\d+) of (\d+)$/, (_, a, b) => `ステップ ${a}/${b}`],
    [/^(\d+)\/(\d+) characters, Derja in Latin script$/, (_, a, b) => `${a}/${b} 文字（ラテン文字のデルジャ）`],
    [/^Choose (.+)$/, (_, p) => `${p}を選択`],
    [/^Start with (.+)$/, (_, p) => `${p}で始める`],
    [/^Dispatch (\d+) m³$/, (_, n) => `${n} m³ を出荷`],
    [new RegExp(`^(\\d{1,2}) ${M}, (\\d{2}:\\d{2})$`), (_, n, m, t) => `${MONTHS.ja[m!]}${n}日 ${t}`],
    [/^(.+) pond$/, (_, n) => `${n} 貯留池`],
  ],
};

function translateString(raw: string): string | null {
  const key = raw.replace(/\s+/g, ' ').trim();
  if (!key || !/[A-Za-z]/.test(key)) return null;
  const hit = AR[key];
  if (hit) return raw.replace(raw.trim(), hit);
  for (const [re, fn] of PATTERNS[lang === 'en' ? 'ar' : lang]) {
    const m = key.match(re);
    if (m) return raw.replace(raw.trim(), fn(...m));
  }
  for (const t of TEMPLATES) {
    const m = key.match(t.re);
    if (!m) continue;
    const values: Record<number, string> = {};
    t.order.forEach((n, i) => {
      const v = m[i + 1] ?? '';
      const k = v.trim();
      // A value inside a sentence can be a word ("rain") or a date ("22 Nov, 08:50").
      const pattern = AR[k] ? null : PATTERNS[lang === 'en' ? 'ar' : lang].find(([re]) => re.test(k));
      values[n] = AR[k] ? v.replace(k, AR[k]!) : pattern ? v.replace(k, pattern[1](...k.match(pattern[0])!)) : v;
    });
    return raw.replace(raw.trim(), t.ar.replace(/\{(\d+)\}/g, (_, n) => values[Number(n)] ?? ''));
  }
  return null;
}

const skip = (el: Element | null) => !!el?.closest('script, style, textarea, code, [data-no-translate], .notranslate');

function doText(node: Text) {
  if (skip(node.parentElement)) return;
  const v = node.nodeValue ?? '';
  if (written.get(node) === v) return; // our own translation
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
  // Stop watching while the English is put back, so the old dictionary can't re-translate it.
  observer?.disconnect();
  observer?.takeRecords();
  observer = null;
  restore();
  if (next === 'en') return;
  await loadDict(next);
  if (lang !== next) return;
  walk(document.body);
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') doText(m.target as Text);
      else if (m.type === 'attributes') doAttrs(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
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
