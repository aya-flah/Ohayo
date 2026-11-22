// Cuts the recorded clips into a single montage (≤ 3 min) with transitions between scenes.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const C = join(here, 'clips');
const SEG = join(here, 'segs');
mkdirSync(SEG, { recursive: true });
const marks = JSON.parse(readFileSync(join(here, 'marks.json'), 'utf8'));
const OUT = process.argv[2] ?? 'D:/hackathon/Sonae/docs/video/Sonae_Zitoun_Demo.mp4';
mkdirSync(dirname(OUT), { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

const m = (name, k) => marks[name].marks[k] ?? 0;
const end = (name) => dur(join(C, `${name}.mp4`)) - 0.35;

/** Each scene: list of [from, to, speed] pieces from its clip. */
const TITLE = 2.7;
const scenes = [
  ['t00', [[0, 3.6, 1]]],
  ['t01', [[0, TITLE, 1]]],
  ['plan', [[m('plan', 'start'), end('plan'), 1.12]]],
  ['t02', [[0, TITLE, 1]]],
  ['twin', [[m('twin', 'start'), end('twin'), 1.05]]],
  ['t03', [[0, TITLE, 1]]],
  ['process', [[m('process', 'start') + 1, end('process'), 1.3]]],
  ['t04', [[0, TITLE, 1]]],
  ['check', [[m('check', 'start'), m('check', 'aiStart') + 0.8, 1.15], [m('check', 'aiStart') + 0.8, m('check', 'aiEnd'), 3], [m('check', 'aiEnd'), end('check'), 1.1]]],
  ['t05', [[0, TITLE, 1]]],
  ['mill', [[m('mill', 'start'), m('mill', 'aiStart') + 1.2, 1.25], [m('mill', 'aiStart') + 1.2, m('mill', 'aiEnd'), 8], [m('mill', 'aiEnd'), end('mill'), 1.12]]],
  ['t06', [[0, TITLE, 1]]],
  ['farmer', [[m('farmer', 'start'), m('farmer', 'aiStart') + 1, 1.35], [m('farmer', 'aiStart') + 1, m('farmer', 'aiEnd'), 9], [m('farmer', 'aiEnd'), end('farmer'), 1.1]]],
  ['t07', [[0, TITLE, 1]]],
  ['admin', [[m('admin', 'start'), end('admin'), 1.3]]],
  ['t08', [[0, TITLE, 1]]],
  ['yui', [[m('yui', 'start'), end('yui'), 1.1]]],
  ['t09', [[0, TITLE, 1]]],
  ['replay', [[m('replay', 'start'), end('replay'), 1]]],
  ['t10', [[0, TITLE, 1]]],
  ['arabic', [[m('arabic', 'start'), end('arabic'), 1.05]]],
  ['t11', [[0, 4.2, 1]]],
];

// 1. Render every scene to a normalised segment.
const segs = [];
for (const [name, pieces] of scenes) {
  const src = join(C, `${name}.mp4`);
  const parts = pieces.map(([a, b, s], i) => `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=(PTS-STARTPTS)/${s},fps=30[p${i}]`);
  const concat = pieces.length > 1 ? `${pieces.map((_, i) => `[p${i}]`).join('')}concat=n=${pieces.length}:v=1:a=0[c]` : null;
  const last = concat ? '[c]' : '[p0]';
  const out = join(SEG, `${name}.mp4`);
  ff(['-i', src, '-filter_complex', [...parts, concat, `${last}format=yuv420p,setsar=1[v]`].filter(Boolean).join(';'), '-map', '[v]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-r', '30', out]);
  segs.push({ name, file: out, d: dur(out) });
}

// 2. Chain them with transitions. Title → scene: soft; scene → title: a wipe.
const T = 0.55;
const INTO_SCENE = ['fade', 'smoothleft', 'circleopen', 'fadeblack', 'smoothup', 'radial', 'fade', 'slideleft', 'circleopen', 'smoothleft'];
const INTO_TITLE = ['fadeblack', 'wipeleft', 'fadeblack', 'smoothdown', 'fadeblack', 'wiperight', 'fadeblack', 'slideright', 'fadeblack', 'smoothright', 'fadeblack'];
let filter = '';
let prev = '[0:v]';
let offset = segs[0].d - T;
let a = 0;
let b = 0;
for (let i = 1; i < segs.length; i++) {
  const intoTitle = segs[i].name.startsWith('t');
  const tr = intoTitle ? INTO_TITLE[b++ % INTO_TITLE.length] : INTO_SCENE[a++ % INTO_SCENE.length];
  const label = i === segs.length - 1 ? '[out]' : `[x${i}]`;
  filter += `${prev}[${i}:v]xfade=transition=${tr}:duration=${T}:offset=${offset.toFixed(3)}${label};`;
  prev = label;
  offset += segs[i].d - T;
}
const total = offset + T;
filter += `[out]fade=t=out:st=${(total - 0.8).toFixed(2)}:d=0.8,format=yuv420p[v]`;
ff([...segs.flatMap((s) => ['-i', s.file]), '-filter_complex', filter, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-r', '30', '-movflags', '+faststart', OUT]);
console.log(segs.map((s) => `${s.name} ${s.d.toFixed(1)}s`).join(' | '));
console.log(`montage ${dur(OUT).toFixed(1)}s → ${OUT}`);
