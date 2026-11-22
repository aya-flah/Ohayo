// Records the Sonae demo, one clip per scene, plus animated title cards.
// Usage: node record.mjs [sceneName ...]   (no args = everything)
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CLIPS = join(here, 'clips');
mkdirSync(CLIPS, { recursive: true });
const SITE = 'http://localhost:5173';
const W = 1280;
const H = 720;
const env = Object.fromEntries(
  readFileSync('D:/hackathon/Sonae/apps/api/.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1)]),
);
const marksFile = join(here, 'marks.json');
const marks = existsSync(marksFile) ? JSON.parse(readFileSync(marksFile, 'utf8')) : {};

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-webgl', '--hide-scrollbars', '--force-color-profile=srgb'],
});

const CURSOR = `
(() => {
  const add = () => {
    if (document.getElementById('demo-cursor')) return;
    const c = document.createElement('div');
    c.id = 'demo-cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 0 0 3px rgba(56,189,248,.55),0 6px 18px rgba(0,0,0,.45);pointer-events:none;z-index:2147483647;transition:transform .12s ease-out;transform:translate(-100px,-100px)';
    document.documentElement.appendChild(c);
    let x = -100, y = -100;
    addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }, true);
    addEventListener('mousedown', () => {
      c.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(.75)';
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:2px solid #38bdf8;pointer-events:none;z-index:2147483646;transition:transform .5s ease-out,opacity .5s ease-out';
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(3.2)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
    addEventListener('mouseup', () => { c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mouse = { x: W / 2, y: H / 2 };

async function moveTo(page, x, y, steps = 22) {
  await page.mouse.move(x, y, { steps });
  mouse = { x, y };
}
async function click(page, locator, { pause = 350, after = 500 } = {}) {
  const l = typeof locator === 'string' ? page.locator(locator).first() : locator.first();
  await l.scrollIntoViewIfNeeded();
  const b = await l.boundingBox();
  if (!b) throw new Error('no box for ' + locator);
  await moveTo(page, b.x + b.width / 2, b.y + b.height / 2);
  await sleep(pause);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
  await sleep(after);
}
async function type(page, selector, text, delay = 55) {
  await click(page, page.locator(selector), { after: 150 });
  await page.locator(selector).first().fill('');
  await page.keyboard.type(text, { delay });
}
async function scroll(page, dy, ms = 900) {
  await page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), dy);
  await sleep(ms);
}
async function setRange(page, selector, value) {
  await page.locator(selector).first().evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function login(page, email, password) {
  await page.goto(`${SITE}/login`);
  await page.locator('#email').waitFor();
  await sleep(700);
  await type(page, '#email', email, 35);
  await type(page, '#password', password, 25);
  await click(page, page.locator('form button.btn-primary'), { after: 1500 });
}

/** Frames straight from Chrome (CDP screencast), encoded with the system ffmpeg using real frame timings. */
async function startCapture(page, name) {
  const dir = join(CLIPS, `${name}-frames`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let stopped = false;
  cdp.on('Page.screencastFrame', async (f) => {
    if (stopped) return;
    const i = frames.length;
    try { writeFileSync(join(dir, `${String(i).padStart(6, '0')}.jpg`), Buffer.from(f.data, 'base64')); } catch { return; }
    frames.push({ i, t: f.metadata.timestamp * 1000 });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  return {
    async stop(t0) {
      stopped = true;
      try { await cdp.send('Page.stopScreencast'); } catch {}
      if (!frames.length) return;
      const lines = [];
      frames.forEach((f, k) => {
        const next = frames[k + 1]?.t ?? f.t + 400;
        // the first frame covers the time since recording started, so marks line up
        const dur = (k === 0 ? next - t0 : next - f.t) / 1000;
        lines.push(`file '${String(f.i).padStart(6, '0')}.jpg'`, `duration ${Math.max(0.001, dur).toFixed(4)}`);
      });
      lines.push(`file '${String(frames.at(-1).i).padStart(6, '0')}.jpg'`);
      writeFileSync(join(dir, 'list.txt'), lines.join(String.fromCharCode(10)));
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', join(CLIPS, `${name}.mp4`)]);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function scene(name, fn, { intro = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: 'dark', locale: 'en-GB' });
  await ctx.addInitScript(CURSOR);
  if (!intro) await ctx.addInitScript(() => { try { sessionStorage.setItem('sonae:intro', '1'); } catch {} });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const cap = await startCapture(page, name);
  const m = { start: 0, marks: {} };
  const mark = (k) => (m.marks[k] = (Date.now() - t0) / 1000);
  page.mark = mark;
  try {
    await fn(page, mark, m);
  } catch (e) {
    console.error(`scene ${name} failed:`, e.message);
  }
  m.end = (Date.now() - t0) / 1000;
  await sleep(150);
  await cap.stop(t0);
  await ctx.close();
  marks[name] = m;
  writeFileSync(marksFile, JSON.stringify(marks, null, 1));
  console.log(`✓ ${name}  ${m.end.toFixed(1)}s  marks ${JSON.stringify(m.marks)}`);
}

async function title(name, params, ms = 3000) {
  await scene(name, async (page, mark) => {
    const url = pathToFileURL(join(here, 'title.html')).href + '?' + new URLSearchParams(params).toString();
    await page.goto(url);
    mark('start');
    await sleep(ms);
  });
}

/* ── Scenes ────────────────────────────────────────────────────────── */

const SCENES = {
  t00: () => title('t00', { brand: '1', title: 'Sonae Zitoun', sub: 'Olive-mill waste, planned and proven. Kizuna 2026, Tunisia.' }, 3600),

  t01: () => title('t01', { num: '01 · The core service', title: 'One decision a day', sub: 'Three mills are pressing and a storm is coming. Where can each tanker of margine go, and when?', kanji: '備', tone: '#c08a52', actor: 'Mill owner' }),
  plan: () =>
    scene('plan', async (page, mark) => {
      await page.goto(`${SITE}/`);
      await page.getByRole('button', { name: 'Play the week' }).waitFor();
      await sleep(1600);
      mark('start');
      await moveTo(page, 640, 260);
      await sleep(900);
      await click(page, page.getByRole('button', { name: 'Play the week' }), { after: 5200 });
      await click(page, page.getByRole('button', { name: 'Pause' }), { after: 600 });
      await click(page, page.getByRole('tab', { name: /Tomorrow/ }), { after: 1100 });
      await scroll(page, 420, 1000);
      await click(page, page.locator('main button[aria-expanded]').first(), { after: 1600 });
      await scroll(page, 380, 1000);
      await click(page, page.getByRole('radio', { name: 'Driver' }), { after: 1500 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await sleep(1100);
      await click(page, page.getByRole('button', { name: 'Add rain' }).first(), { after: 700 });
      await page.locator('#storm-day').selectOption({ index: 3 });
      await sleep(400);
      await setRange(page, '#storm-mm', 20);
      await sleep(600);
      await click(page, page.getByRole('dialog').getByRole('button', { name: 'Add rain' }), { after: 2600 });
      await moveTo(page, 300, 520);
      await sleep(1500);
    }, { intro: true }),

  t02: () => title('t02', { num: '02 · Digital twin', title: 'The olive region, live in 3D', sub: 'Every pond, tanker and grove. Make it rain and watch the tankers stop.', kanji: '双', tone: '#38bdf8' }),
  twin: () =>
    scene('twin', async (page, mark) => {
      await page.goto(`${SITE}/twin`);
      await page.getByRole('button', { name: 'Play the week' }).waitFor();
      await sleep(3200);
      mark('start');
      await click(page, page.getByRole('button', { name: 'Play the week' }), { after: 5500 });
      await click(page, page.getByRole('button', { name: 'Make it rain' }), { after: 3500 });
      await click(page, page.getByRole('button', { name: 'Stop the rain' }), { after: 1200 });
    }),

  t03: () => title('t03', { num: '03 · How it works', title: 'From waste to water, fertiliser and fuel', sub: 'Margine feeds the soil. Fitoura becomes gas for the well’s engine.', kanji: '工', tone: '#a3c35a' }),
  process: () =>
    scene('process', async (page, mark) => {
      await page.goto(`${SITE}/process`);
      await page.getByRole('button', { name: /Press/ }).first().waitFor();
      await sleep(3000);
      mark('start');
      await sleep(1500);
      for (const step of ['Spread', 'Soil', 'Dry', 'Gas', 'Engine']) {
        await click(page, page.locator('ol button', { hasText: step }), { after: 2900 });
      }
    }),

  t04: () => title('t04', { num: '04 · For farmers', title: 'Check my grove, read my lab report', sub: 'Real forecast for your exact place. The lab reader AI turns a report into a safe dose.', kanji: '診', tone: '#a3c35a', actor: 'Farmer' }),
  check: () =>
    scene('check', async (page, mark) => {
      await page.goto(`${SITE}/check`);
      await page.getByRole('button', { name: 'Check my grove' }).waitFor();
      await sleep(1500);
      mark('start');
      await type(page, '#area', '12', 90);
      await click(page, page.getByRole('button', { name: 'Check my grove' }), { after: 2200 });
      await scroll(page, 360, 2400);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await sleep(800);
      await click(page, page.getByRole('radio', { name: 'Lab report' }), { after: 900 });
      await click(page, page.getByRole('button', { name: 'Try a sample report' }), { after: 900 });
      await click(page, page.getByRole('button', { name: 'Read the report' }), { after: 300 });
      mark('aiStart');
      await page.getByText("Sonae's advice").waitFor({ timeout: 60000 });
      mark('aiEnd');
      await sleep(600);
      await scroll(page, 380, 3200);
    }),

  t05: () => title('t05', { num: '05 · Mill owner account', title: 'A season plan, generated live', sub: 'Sign in, pick a pack, press one button: costs, phases, risks and a checklist.', kanji: '計', tone: '#c08a52', actor: 'Mill owner' }),
  mill: () =>
    scene('mill', async (page, mark) => {
      await page.goto(`${SITE}/login`);
      await sleep(1200);
      mark('start');
      await login(page, env.DEMO_MILL_EMAIL, env.DEMO_PASSWORD);
      await page.getByRole('button', { name: /Generate my season plan/ }).waitFor({ timeout: 20000 });
      await sleep(1200);
      await click(page, page.getByRole('link', { name: 'Packs' }), { after: 1600 });
      await setRange(page, '#amount', 1800);
      await sleep(1300);
      await scroll(page, 260, 1400);
      await page.goBack();
      await page.getByRole('button', { name: /Generate my season plan/ }).waitFor();
      await sleep(900);
      await click(page, page.getByRole('button', { name: /Generate my season plan/ }), { after: 200 });
      mark('aiStart');
      await page.getByText('What the season costs and brings').waitFor({ timeout: 120000 });
      mark('aiEnd');
      await sleep(3600);
      await scroll(page, 520, 2600);
      await scroll(page, 560, 1600);
      const phases = page.locator('button[aria-pressed]');
      if ((await phases.count()) > 2) await click(page, phases.nth(1), { after: 2200 });
      await scroll(page, 560, 1300);
      const boxes = page.locator('input[type=checkbox]');
      if ((await boxes.count()) > 1) {
        await click(page, boxes.nth(0), { after: 500 });
        await click(page, boxes.nth(1), { after: 900 });
      }
    }),

  t06: () => title('t06', { num: '06 · Farmer account', title: 'A plan for his own land', sub: 'How much margine his trees need, how many loads, and what he saves on fertiliser.', kanji: '畑', tone: '#a3c35a', actor: 'Farmer' }),
  farmer: () =>
    scene('farmer', async (page, mark) => {
      await page.goto(`${SITE}/login`);
      await sleep(1000);
      mark('start');
      await login(page, env.DEMO_FARMER_EMAIL, env.DEMO_PASSWORD);
      await page.getByRole('button', { name: /Generate my season plan|Fill in your farm first/ }).waitFor({ timeout: 20000 });
      await sleep(800);
      if (await page.locator('#fname').count()) {
        await type(page, '#fname', 'Ferme Ben Ali', 45);
        await type(page, '#area', '12', 90);
        await click(page, page.getByRole('button', { name: 'Save my farm' }), { after: 1500 });
      }
      await click(page, page.getByRole('button', { name: /Generate my season plan/ }), { after: 200 });
      mark('aiStart');
      await page.getByText('What the season costs and brings').waitFor({ timeout: 120000 });
      mark('aiEnd');
      await sleep(3800);
      await scroll(page, 560, 2600);
    }),

  t07: () => title('t07', { num: '07 · Admin', title: 'The whole picture, at a glance', sub: 'Users by role, packs, season revenue, volumes under plan and AI spending.', kanji: '管', tone: '#38bdf8', actor: 'Admin' }),
  admin: () =>
    scene('admin', async (page, mark) => {
      await page.goto(`${SITE}/login`);
      await sleep(1000);
      mark('start');
      await login(page, env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
      await page.getByText('Season revenue').waitFor({ timeout: 20000 });
      await sleep(2500);
      await scroll(page, 380, 1500);
      await click(page, page.locator('button.chip', { hasText: 'mills' }), { after: 1400 });
      await click(page, page.locator('button.chip', { hasText: 'farmers' }), { after: 1400 });
    }),

  t08: () => title('t08', { num: '08 · Yui on Sepolia', title: 'The margine passport', sub: 'Every load traced from mill to grove, caps enforced on chain, clean-oil certificates anyone can verify.', kanji: '結', tone: '#10b981' }),
  yui: () =>
    scene('yui', async (page, mark) => {
      await page.goto(`${SITE}/yui`);
      await page.getByText('Groves approved by the regulator').waitFor({ timeout: 30000 });
      await sleep(3000);
      mark('start');
      await sleep(1800);
      await scroll(page, 520, 2200);
      await scroll(page, 520, 2200);
    }),

  t09: () => title('t09', { num: '09 · Proof on real weather', title: 'A whole season, replayed', sub: 'Sfax, winter 2025-26: 7,522 m³ spilled into the wadis without Sonae. None with it.', kanji: '再', tone: '#ff5a5f' }),
  replay: () =>
    scene('replay', async (page, mark) => {
      await page.goto(`${SITE}/replay`);
      await page.getByText('The ponds, day by day').waitFor({ timeout: 30000 });
      await sleep(1200);
      mark('start');
      await sleep(2600);
      await click(page, page.getByRole('radio', { name: /Wet winter/ }), { after: 2600 });
    }),

  t10: () => title('t10', { num: '10 · For everyone', title: 'English and Arabic, one tap', sub: 'The whole site, right to left. The AI answers in Arabic too.', kanji: 'ع', tone: '#f59e0b' }),
  arabic: () =>
    scene('arabic', async (page, mark) => {
      await page.goto(`${SITE}/`);
      await page.getByRole('button', { name: 'التبديل إلى العربية' }).waitFor();
      await sleep(1400);
      mark('start');
      await click(page, page.getByRole('button', { name: 'التبديل إلى العربية' }), { after: 2600 });
      await click(page, page.locator('header a[href="/check"]'), { after: 2400 });
      await click(page, page.locator('header a[href="/process"]'), { after: 2600 });
    }),

  t11: () => title('t11', { brand: '1', title: 'Prepared, nothing to fear.', sub: 'Sonae: less pollution, less fertiliser, less diesel, and proof for every load.' }, 4200),
};

const wanted = process.argv.slice(2);
for (const [name, fn] of Object.entries(SCENES)) {
  if (wanted.length && !wanted.includes(name)) continue;
  await fn();
}
await browser.close();
