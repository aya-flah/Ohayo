// Short full tour: every feature in ≤ 3 minutes. Each scene gets a time budget; its own speed is
// chosen to fit (never slower than 1.25×), AI and blockchain waits are squeezed to ~1 s, and title
// cards play at double speed.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const C = join(here, 'clips-full');
const SEG = join(here, 'segs-short');
mkdirSync(SEG, { recursive: true });
const marks = JSON.parse(readFileSync(join(here, 'marks-full.json'), 'utf8'));
const OUT = 'D:/hackathon/Sonae/docs/video/Sonae_Zitoun_Tour_3min.mp4';
const LIMIT = 179;
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

const ORDER = ['f00', 'f01', 't1', 'plan', 't2', 'twin', 't3', 'process', 't4', 'grove', 't5', 'lab', 't6', 'ask', 't7', 'pricing', 't8', 'signup', 't9', 'mill', 't10', 'admin', 't11', 'yui', 't12', 'replay', 't13', 'arabic', 'f99'];
const isTitle = (n) => /^(t\d+|f\d+)$/.test(n);
// Seconds of screen time per feature (the core plan, AI and blockchain get the most).
const BUDGET = { plan: 24, twin: 11, process: 15, grove: 8, lab: 10, ask: 13, pricing: 5.5, signup: 14, mill: 16, admin: 9, yui: 20, replay: 7.5, arabic: 7.5 };
const TITLE = { f00: [4, 1.4], f01: [3.2, 1.0], f99: [4.8, 1.5] }; // [source seconds, speed]
const WAIT = 1.0;

/** Pieces [from, to, speed] for one clip. */
function pieces(name, scale) {
  const m = marks[name];
  const end = dur(join(C, `${name}.mp4`)) - 0.35;
  if (isTitle(name)) {
    const [len, sp] = TITLE[name] ?? [3.0, 1.75];
    return [[0, Math.min(end, len), sp]];
  }
  const start = m.marks.start ?? 0;
  const waits = (m.waits ?? []).map(([a, b]) => [a + 0.6, b]).filter(([a, b]) => b - a > 0.3);
  const normal = [];
  let t = start;
  for (const [a, b] of waits) {
    if (a > t) normal.push([t, a]);
    t = b;
  }
  if (end > t) normal.push([t, end]);
  const normalLen = normal.reduce((s, [a, b]) => s + b - a, 0);
  const room = BUDGET[name] * scale - waits.length * WAIT;
  const speed = Math.min(3, Math.max(1.25, normalLen / Math.max(1, room)));
  const out = [];
  t = start;
  for (const [a, b] of waits) {
    if (a > t) out.push([t, a, speed]);
    out.push([a, b, (b - a) / WAIT]);
    t = b;
  }
  if (end > t) out.push([t, end, speed]);
  return out;
}
const length = (ps) => ps.reduce((s, [a, b, sp]) => s + (b - a) / sp, 0);

const T = 0.45;
let scale = 1;
for (; scale > 0.6; scale -= 0.01) {
  const total = ORDER.reduce((s, n) => s + length(pieces(n, scale)), 0) - T * (ORDER.length - 1);
  if (total <= LIMIT) break;
}
console.log(`budget scale ×${scale.toFixed(2)}`);

const segs = [];
for (const name of ORDER) {
  const ps = pieces(name, scale);
  const parts = ps.map(([a, b, s], i) => `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=(PTS-STARTPTS)/${s.toFixed(4)},fps=30[p${i}]`);
  const concat = ps.length > 1 ? `${ps.map((_, i) => `[p${i}]`).join('')}concat=n=${ps.length}:v=1:a=0[c]` : null;
  const out = join(SEG, `${name}.mp4`);
  ff(['-i', join(C, `${name}.mp4`), '-filter_complex', [...parts, concat, `${concat ? '[c]' : '[p0]'}format=yuv420p,setsar=1[v]`].filter(Boolean).join(';'), '-map', '[v]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-r', '30', out]);
  segs.push({ name, file: out, d: dur(out), speed: isTitle(name) ? null : ps.find((p) => p[2] < 3.01)?.[2] });
}

const INTO_SCENE = ['fade', 'smoothleft', 'circleopen', 'smoothup', 'radial', 'slideleft', 'fadeblack', 'smoothleft', 'circleopen', 'smoothup', 'slideleft', 'radial', 'fade', 'smoothleft'];
const INTO_TITLE = ['fadeblack', 'wipeleft', 'fadeblack', 'smoothdown', 'fadeblack', 'wiperight', 'fadeblack', 'slideright', 'fadeblack', 'smoothright', 'fadeblack', 'wipeleft', 'fadeblack', 'smoothdown', 'fadeblack'];
let filter = '';
let prev = '[0:v]';
let offset = segs[0].d - T;
let a = 0;
let b = 0;
for (let i = 1; i < segs.length; i++) {
  const tr = isTitle(segs[i].name) ? INTO_TITLE[b++ % INTO_TITLE.length] : INTO_SCENE[a++ % INTO_SCENE.length];
  const label = i === segs.length - 1 ? '[out]' : `[x${i}]`;
  filter += `${prev}[${i}:v]xfade=transition=${tr}:duration=${T}:offset=${offset.toFixed(3)}${label};`;
  prev = label;
  offset += segs[i].d - T;
}
const total = offset + T;
filter += `[out]fade=t=out:st=${(total - 0.8).toFixed(2)}:d=0.8,format=yuv420p[v]`;
ff([...segs.flatMap((s) => ['-i', s.file]), '-filter_complex', filter, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-r', '30', '-movflags', '+faststart', OUT]);
console.log(segs.map((s) => `${s.name} ${s.d.toFixed(1)}${s.speed ? `@${s.speed.toFixed(2)}x` : ''}`).join(' | '));
console.log(`tour ${dur(OUT).toFixed(1)}s → ${OUT}`);
