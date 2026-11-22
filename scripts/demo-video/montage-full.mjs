// Full-tour montage: ≤ 7 minutes, waits (AI, blockchain) sped up, transitions between every scene.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const C = join(here, 'clips-full');
const SEG = join(here, 'segs-full');
mkdirSync(SEG, { recursive: true });
const marks = JSON.parse(readFileSync(join(here, 'marks-full.json'), 'utf8'));
const OUT = 'D:/hackathon/Sonae/docs/video/Sonae_Zitoun_Full_Tour.mp4';
const LIMIT = 418;
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

const ORDER = ['f00', 'f01', 't1', 'plan', 't2', 'twin', 't3', 'process', 't4', 'grove', 't5', 'lab', 't6', 'ask', 't7', 'pricing', 't8', 'signup', 't9', 'mill', 't10', 'admin', 't11', 'yui', 't12', 'replay', 't13', 'arabic', 'f99'];
const isTitle = (n) => /^(t\d+|f\d+)$/.test(n);
const TITLE_LEN = { f00: 4, f01: 5.2, f99: 4.8 };

/** Pieces of a scene: normal parts at `speed`, waits squeezed to about 2.2 s each. */
function pieces(name, speed) {
  const m = marks[name];
  const end = dur(join(C, `${name}.mp4`)) - 0.35;
  if (isTitle(name)) return [[0, Math.min(end, TITLE_LEN[name] ?? 3.1), 1]];
  const out = [];
  let t = m.marks.start ?? 0;
  for (const [a, b] of m.waits ?? []) {
    const a2 = a + 0.9;
    if (a2 > t) out.push([t, a2, speed]);
    const len = b - a2;
    if (len > 0.3) out.push([a2, b, Math.max(1, len / 2.2)]);
    t = b;
  }
  if (end > t) out.push([t, end, speed]);
  return out;
}
const length = (ps) => ps.reduce((s, [a, b, sp]) => s + (b - a) / sp, 0);

// Pick one speed for the content so the whole film fits under the limit.
const T = 0.6;
let speed = 1.0;
for (; speed < 1.6; speed += 0.02) {
  const total = ORDER.reduce((s, n) => s + length(pieces(n, speed)), 0) - T * (ORDER.length - 1);
  if (total <= LIMIT) break;
}
console.log(`content speed ×${speed.toFixed(2)}`);

const segs = [];
for (const name of ORDER) {
  const ps = pieces(name, speed);
  const parts = ps.map(([a, b, s], i) => `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=(PTS-STARTPTS)/${s.toFixed(4)},fps=30[p${i}]`);
  const concat = ps.length > 1 ? `${ps.map((_, i) => `[p${i}]`).join('')}concat=n=${ps.length}:v=1:a=0[c]` : null;
  const out = join(SEG, `${name}.mp4`);
  ff(['-i', join(C, `${name}.mp4`), '-filter_complex', [...parts, concat, `${concat ? '[c]' : '[p0]'}format=yuv420p,setsar=1[v]`].filter(Boolean).join(';'), '-map', '[v]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-r', '30', out]);
  segs.push({ name, file: out, d: dur(out) });
}

// Transitions: a calm fade into titles, a lively move into scenes.
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
filter += `[out]fade=t=out:st=${(total - 0.9).toFixed(2)}:d=0.9,format=yuv420p[v]`;
ff([...segs.flatMap((s) => ['-i', s.file]), '-filter_complex', filter, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-r', '30', '-movflags', '+faststart', OUT]);
console.log(segs.map((s) => `${s.name} ${s.d.toFixed(1)}`).join(' | '));
console.log(`full tour ${dur(OUT).toFixed(1)}s → ${OUT}`);
