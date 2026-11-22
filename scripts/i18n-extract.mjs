// Collects the English text shown in the website (JSX text and quoted UI strings) into
// apps/web/src/i18n/strings.json, so it can be translated. Run: node scripts/i18n-extract.mjs
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [join(root, 'apps/web/src'), join(root, 'packages/shared/src/zitoun.ts'), join(root, 'packages/engine/src/zitoun.ts')];
const files = [];
const walk = (p) => {
  if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
  else if (/\.(tsx|ts)$/.test(p) && !p.includes('i18n')) files.push(p);
};
dirs.forEach(walk);

const out = new Set();
const decode = (s) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&ldquo;|&rdquo;/g, '"');
const looksLikeCode = (s) => {
  const t = s.trim();
  if (!/[A-Za-z]{2}/.test(t)) return true;
  if (/^(https?:|\/|\.\/|#|var\(|rgb|M\d|data:|@)/.test(t)) return true;
  if (/=>|\${|className|import |export |\bconst\b|\breturn\b/.test(t)) return true;
  if (/^[a-z][a-zA-Z0-9]*$/.test(t) && !/^(free|done|on|off|no|yes)$/.test(t)) return true; // identifiers
  if (/^[a-z0-9-]+(\/[a-z0-9-]+)+$/.test(t)) return true; // paths
  const tokens = t.split(/\s+/);
  const cssish = tokens.filter((x) => /^[!a-z0-9:\-\[\]\/().%_#,]+$/.test(x) && /[-:\[]/.test(x));
  if (cssish.length && cssish.length >= tokens.length * 0.6) return true; // Tailwind classes
  if (/^[A-Z0-9_]+$/.test(t)) return true; // constants
  if (/^(image|application|text)\/[a-z+.-]+$/.test(t)) return true;
  return false;
};

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // JSX text between tags
  for (const m of src.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) {
    const s = decode(m[1]).replace(/\s+/g, ' ').trim();
    if (s && !looksLikeCode(s) && s.length < 400) out.add(s);
  }
  // JSX text next to {expressions}: "… </b> m³ of margine to olive groves, <span>"
  for (const m of src.matchAll(/[>}]([^<>{}]*[A-Za-z]{3}[^<>{}]*)[<{]/g)) {
    const s = decode(m[1]).replace(/\s+/g, ' ').trim();
    if (s && !looksLikeCode(s) && s.length < 400 && /\s/.test(s) && !/[;=]|\)\s*$|^\(|&&|\|\|/.test(s)) out.add(s);
  }
  // Quoted strings ('…', "…") without interpolation
  for (const m of src.matchAll(/(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    const s = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').trim();
    if (s.length >= 2 && s.length < 500 && !looksLikeCode(s) && /[A-Za-z]/.test(s) && (/\s/.test(s) || /^[A-Z][a-z]/.test(s))) out.add(s);
  }
  // Static template literals
  for (const m of src.matchAll(/`([^`$]*)`/g)) {
    const s = m[1].replace(/\s+/g, ' ').trim();
    if (s.length >= 3 && !looksLikeCode(s) && /\s/.test(s) && /[A-Za-z]/.test(s)) out.add(s);
  }
}
// Template literals with \${…}: kept as templates with {0}, {1}… placeholders
const templates = new Set();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/`((?:[^`\\]|\\.)*\$\{(?:[^`\\]|\\.)*)`/g)) {
    let body = m[1];
    if (body.length > 400 || body.includes('\n')) continue;
    let k = 0;
    let t = '';
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '$' && body[i + 1] === '{') {
        let depth = 1;
        let j = i + 2;
        for (; j < body.length && depth; j++) {
          if (body[j] === '{') depth++;
          else if (body[j] === '}') depth--;
        }
        t += `{${k++}}`;
        i = j - 1;
      } else t += body[i];
    }
    const words = t.replace(/\{\d+\}/g, ' ').trim();
    if (!/[A-Za-z]{3}.*\s.*[A-Za-z]{2}|[A-Za-z]{4}/.test(words)) continue;
    if (looksLikeCode(words) || /[;=]|var\(|px|rem|^[a-z-]+$/.test(words) || /^[{}\d\s,./:#%-]*$/.test(words)) continue;
    templates.add(t.replace(/\s+/g, ' ').trim());
  }
}
writeFileSync(join(root, 'apps/web/src/i18n/templates.json'), JSON.stringify([...templates].sort(), null, 1));
console.log(`${templates.size} templates`);
const list = [...out].sort();
const dir = join(root, 'apps/web/src/i18n');
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'strings.json'), JSON.stringify(list, null, 1));
console.log(`${list.length} strings from ${files.length} files`);
