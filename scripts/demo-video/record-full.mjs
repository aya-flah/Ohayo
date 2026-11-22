// Full tour (~7 min): every feature, every actor, captions with the narration, real Sepolia transactions.
// Usage: node record-full.mjs [scene ...]
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CLIPS = join(here, 'clips-full');
mkdirSync(CLIPS, { recursive: true });
const SITE = 'http://localhost:5173';
const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const W = 1280;
const H = 720;
const readEnv = (f) => Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]));
const env = readEnv('D:/hackathon/Sonae/apps/api/.env');
const chainEnv = readEnv('D:/hackathon/Sonae/contracts/.env');
const marksFile = join(here, 'marks-full.json');
const marks = existsSync(marksFile) ? JSON.parse(readFileSync(marksFile, 'utf8')) : {};
const stateFile = join(here, 'state-full.json');
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};

// Demo wallet: signs with the TEST key from contracts/.env (never printed).
const req = createRequire('D:/hackathon/Sonae/package.json');
const { createWalletClient, http } = req('viem');
const { privateKeyToAccount } = req('viem/accounts');
const { sepolia } = req('viem/chains');
const pk = chainEnv.DEPLOYER_PRIVATE_KEY.startsWith('0x') ? chainEnv.DEPLOYER_PRIVATE_KEY : `0x${chainEnv.DEPLOYER_PRIVATE_KEY}`;
const account = privateKeyToAccount(pk);
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-webgl', '--hide-scrollbars', '--force-color-profile=srgb'],
});

const CURSOR = readFileSync(join(here, 'record.mjs'), 'utf8').match(/const CURSOR = `([\s\S]*?)`;/)[1];

const PROVIDER = `
(() => {
  const ADDR = '${account.address}';
  const listeners = {};
  const confirmBox = (label) => new Promise((resolve) => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;right:24px;top:96px;width:330px;z-index:2147483600;border-radius:20px;padding:16px 18px;background:rgba(14,22,36,.96);border:1px solid rgba(255,255,255,.16);box-shadow:0 20px 60px rgba(0,0,0,.5);color:#f8fafc;font:14px/1.45 "Plus Jakarta Sans",system-ui,sans-serif;opacity:0;transform:translateY(-10px);transition:all .25s ease';
    d.innerHTML = '<div style="display:flex;align-items:center;gap:10px"><span style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#f6851b,#e2761b);display:grid;place-items:center;font-weight:800">W</span><b>Demo wallet · Sepolia</b></div><div style="margin-top:10px;color:#cbd5e1">' + label + '</div><div style="margin-top:6px;font-size:12px;color:#94a3b8">' + ADDR.slice(0,6) + '…' + ADDR.slice(-4) + ' · test ETH only</div><div id="dw-btn" style="margin-top:12px;text-align:center;border-radius:999px;padding:9px;background:#38bdf8;color:#04121f;font-weight:800">Confirm</div>';
    document.documentElement.appendChild(d);
    requestAnimationFrame(() => { d.style.opacity = '1'; d.style.transform = 'none'; });
    setTimeout(() => { const b = d.querySelector('#dw-btn'); b.style.background = '#10b981'; b.textContent = 'Confirmed'; }, 1300);
    setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 300); resolve(); }, 2000);
  });
  window.ethereum = {
    isMetaMask: true,
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ADDR];
      if (method === 'eth_chainId') return '0xaa36a7';
      if (method === 'net_version') return '11155111';
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
      if (method === 'wallet_requestPermissions' || method === 'wallet_getPermissions') return [{ parentCapability: 'eth_accounts' }];
      if (method === 'eth_sendTransaction') {
        await confirmBox('Approve this transaction on the Sonae contract');
        return window.__walletSend(params[0]);
      }
      return window.__rpc(method, params ?? []);
    },
    on(ev, fn) { (listeners[ev] ??= []).push(fn); return this; },
    removeListener(ev, fn) { listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn); return this; },
  };
})();`;

const CAPTION = `
window.__caption = (text) => {
  let c = document.getElementById('demo-caption');
  if (!c) {
    c = document.createElement('div');
    c.id = 'demo-caption';
    c.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(12px);max-width:980px;width:max-content;z-index:2147483500;padding:12px 22px;border-radius:18px;background:rgba(6,11,20,.86);border:1px solid rgba(255,255,255,.14);box-shadow:0 12px 40px rgba(0,0,0,.45);backdrop-filter:blur(10px);color:#f8fafc;font:600 19px/1.4 "Plus Jakarta Sans",system-ui,sans-serif;text-align:center;opacity:0;transition:opacity .35s ease, transform .35s ease;pointer-events:none';
    document.documentElement.appendChild(c);
  }
  if (!text) { c.style.opacity = '0'; c.style.transform = 'translateX(-50%) translateY(12px)'; return; }
  c.style.opacity = '0';
  setTimeout(() => { c.textContent = text; c.style.opacity = '1'; c.style.transform = 'translateX(-50%)'; }, 180);
};`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function moveTo(page, x, y, steps = 22) {
  await page.mouse.move(x, y, { steps });
}
async function click(page, locator, { pause = 320, after = 500, timeout = 15000 } = {}) {
  const l = (typeof locator === 'string' ? page.locator(locator) : locator).first();
  await l.waitFor({ state: 'visible', timeout });
  await l.scrollIntoViewIfNeeded({ timeout });
  const b = await l.boundingBox();
  await moveTo(page, b.x + b.width / 2, b.y + b.height / 2);
  await sleep(pause);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
  await sleep(after);
}
async function type(page, selector, text, delay = 55) {
  await click(page, page.locator(selector), { after: 150 });
  // select what is there and type over it, so number fields never go through an empty value
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text, { delay });
}
const scroll = async (page, dy, ms = 900) => {
  await page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), dy);
  await sleep(ms);
};
const toTop = async (page) => {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(900);
};
async function setRange(page, selector, value) {
  await page.locator(selector).first().evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
const cap = (page, text) => page.evaluate((t) => window.__caption?.(t), text);
async function login(page, email, password) {
  await page.goto(`${SITE}/login`);
  await page.locator('#email').waitFor();
  await sleep(600);
  await type(page, '#email', email, 30);
  await type(page, '#password', password, 22);
  await click(page, page.locator('form button.btn-primary'), { after: 1500 });
}

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
        const d = (k === 0 ? next - t0 : next - f.t) / 1000;
        lines.push(`file '${String(f.i).padStart(6, '0')}.jpg'`, `duration ${Math.max(0.001, d).toFixed(4)}`);
      });
      lines.push(`file '${String(frames.at(-1).i).padStart(6, '0')}.jpg'`);
      writeFileSync(join(dir, 'list.txt'), lines.join(String.fromCharCode(10)));
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', join(CLIPS, `${name}.mp4`)]);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function scene(name, fn, { intro = false, wallet: withWallet = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: 'dark', locale: 'en-GB' });
  await ctx.addInitScript(CURSOR);
  await ctx.addInitScript(CAPTION);
  if (!intro) await ctx.addInitScript(() => { try { sessionStorage.setItem('sonae:intro', '1'); } catch {} });
  if (withWallet) {
    await ctx.exposeFunction('__walletSend', async (tx) => wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n }));
    await ctx.exposeFunction('__rpc', async (method, params) => {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    });
    await ctx.addInitScript(PROVIDER);
  }
  const page = await ctx.newPage();
  const t0 = Date.now();
  const capt = await startCapture(page, name);
  const m = { marks: {}, waits: [] };
  const mark = (k) => (m.marks[k] = (Date.now() - t0) / 1000);
  let ws = null;
  const wait = {
    start: () => (ws = (Date.now() - t0) / 1000),
    end: () => { if (ws !== null) m.waits.push([ws, (Date.now() - t0) / 1000]); ws = null; },
  };
  try {
    await fn(page, mark, wait);
  } catch (e) {
    console.error(`scene ${name} failed:`, e.message.split('\n')[0]);
  }
  m.end = (Date.now() - t0) / 1000;
  await sleep(150);
  await capt.stop(t0);
  await ctx.close();
  marks[name] = m;
  writeFileSync(marksFile, JSON.stringify(marks, null, 1));
  console.log(`✓ ${name}  ${m.end.toFixed(1)}s  start ${m.marks.start ?? '-'}  waits ${JSON.stringify(m.waits.map(([a, b]) => +(b - a).toFixed(1)))}`);
}

async function title(name, params, ms = 3200) {
  await scene(name, async (page, mark) => {
    await page.goto(pathToFileURL(join(here, 'title.html')).href + '?' + new URLSearchParams(params).toString());
    mark('start');
    await sleep(ms);
  });
}

/* ── Scenes ────────────────────────────────────────────────────────── */

const SCENES = {
  f00: () => title('f00', { brand: '1', title: 'Sonae Zitoun', sub: 'The full tour: every feature, every actor. Kizuna 2026, Tunisia.' }, 4000),
  f01: () => title('f01', { num: 'The problem', title: 'Every winter, olive mills are left with two wastes', sub: 'Margine, a dark water that pollutes wadis and wells when dumped, and fitoura, the pomace. Sonae plans what happens to both, every day, and proves it.', kanji: '油', tone: '#c08a52' }, 5200),

  t1: () => title('t1', { num: '01 · The core service', title: 'One decision a day', sub: 'The 7-day plan: where each tanker of margine can go, and when.', kanji: '備', tone: '#c08a52', actor: 'Mill owner' }),
  plan: () =>
    scene('plan', async (page, mark) => {
      await page.goto(`${SITE}/`);
      await page.getByRole('button', { name: 'Play the week' }).waitFor();
      await sleep(1500);
      mark('start');
      await cap(page, 'Three mills are pressing and a storm is coming on Wednesday.');
      await moveTo(page, 420, 230);
      await sleep(2600);
      await cap(page, 'Play the week: the 3D region behind the page follows the plan.');
      await click(page, page.getByRole('button', { name: 'Play the week' }), { after: 5000 });
      await click(page, page.getByRole('button', { name: 'Pause' }), { after: 400 });
      await click(page, page.getByRole('tab', { name: /Tomorrow/ }), { after: 900 });
      await cap(page, 'Every tanker trip has a reason: fullest pond first, nearest allowed grove.');
      await scroll(page, 420, 900);
      await click(page, page.locator('main button[aria-expanded]').first(), { after: 2600 });
      await cap(page, 'Ponds tonight: what is left in each mill’s pond, and what doing nothing would spill.');
      await sleep(2600);
      await scroll(page, 360, 900);
      await cap(page, 'Farmers and drivers get an SMS in Derja, on any phone.');
      await click(page, page.getByRole('radio', { name: 'Driver' }), { after: 1800 });
      await click(page, page.getByRole('radio', { name: 'Farmer' }), { after: 1400 });
      await cap(page, 'Groves near a well, the wadi or on a slope never receive margine.');
      await scroll(page, 420, 2600);
      await toTop(page);
      await cap(page, 'What if the storm gets heavier? Add 20 mm on Thursday.');
      await click(page, page.getByRole('button', { name: 'Add rain' }).first(), { after: 600 });
      await page.locator('#storm-day').selectOption({ index: 3 });
      await setRange(page, '#storm-mm', 20);
      await sleep(700);
      await click(page, page.getByRole('dialog').getByRole('button', { name: 'Add rain' }), { after: 1500 });
      await cap(page, 'Thursday becomes 44 mm, spreading pauses, and still no pond spills.');
      await sleep(2800);
      await click(page, page.locator('button.chip', { hasText: 'thursday' }), { after: 800 });
      await cap(page, 'Live forecast: the same plan with the real Sfax weather from today.');
      await click(page, page.getByRole('radio', { name: 'Live forecast' }), { after: 3200 });
      await cap(page, 'My mill: a manager enters his own pond, tankers and groves.');
      await click(page, page.getByRole('radio', { name: 'My mill' }), { after: 1600 });
      await click(page, page.getByRole('button', { name: 'Edit your mill' }), { after: 900 });
      await page.locator('#mm-town').selectOption('Mahdia');
      await sleep(500);
      await type(page, '#mm-cap', '1200', 80);
      await scroll(page, 0, 300);
      await click(page, page.getByRole('button', { name: 'Save and plan' }), { after: 2600 });
      await cap(page, 'The plan now uses his numbers and the real forecast for Mahdia.');
      await sleep(3000);
      await cap(page, null);
    }, { intro: true }),

  t2: () => title('t2', { num: '02 · Digital twin', title: 'The olive region, live in 3D', sub: 'Mills, ponds, groves, tankers, the wadi and the drinking well.', kanji: '双', tone: '#38bdf8' }),
  twin: () =>
    scene('twin', async (page, mark) => {
      await page.goto(`${SITE}/twin`);
      await page.getByRole('button', { name: 'Play the week' }).waitFor();
      await sleep(3200);
      mark('start');
      await cap(page, 'Drag to look around. Red borders: groves that can never receive margine.');
      await moveTo(page, 640, 400);
      await page.mouse.down();
      await page.mouse.move(820, 380, { steps: 40 });
      await page.mouse.up();
      await sleep(1800);
      await cap(page, 'Play the week: tankers drive, ponds go down, groves darken.');
      await click(page, page.getByRole('button', { name: 'Play the week' }), { after: 6500 });
      await cap(page, 'When it rains, every tanker stops: that rule protects the wadis.');
      await click(page, page.getByRole('button', { name: 'Make it rain' }), { after: 4000 });
      await click(page, page.getByRole('button', { name: 'Stop the rain' }), { after: 1500 });
      await cap(page, null);
    }),

  t3: () => title('t3', { num: '03 · How it works', title: 'From waste to water, fertiliser and fuel', sub: 'Nine steps in 3D: margine to the soil, fitoura to the well’s engine.', kanji: '工', tone: '#a3c35a' }),
  process: () =>
    scene('process', async (page, mark) => {
      await page.goto(`${SITE}/process`);
      await page.locator('ol button').first().waitFor();
      await sleep(3000);
      mark('start');
      const say = {
        Press: 'The decanter separates oil, margine and fitoura.',
        Pond: 'Margine waits in a lined pond; a lab sample is tested.',
        Tanker: 'On a dry day, a tanker loads 15 m³ for an approved grove.',
        Spread: 'A thin film between the olive rows: at most 10 m³ per hectare a day.',
        Soil: 'Microbes break it down; potassium reaches the roots. Never into water.',
        Dry: 'Fitoura dries in the sun, from 50% water to about 10%.',
        Gas: 'Pellets, then a gasifier turns them into a burnable gas.',
        Engine: 'The gas runs the well’s pump engine: 60 to 70% less diesel.',
        Circle: 'The full circle: oil sold, soil fed, water pumped, every load traced.',
      };
      await cap(page, say.Press);
      await sleep(2600);
      for (const step of ['Pond', 'Tanker', 'Spread', 'Soil', 'Dry', 'Gas', 'Engine', 'Circle']) {
        await click(page, page.locator('ol button', { hasText: step }), { after: 200 });
        await cap(page, say[step]);
        await sleep(2900);
      }
      await cap(page, null);
    }),

  t4: () => title('t4', { num: '04 · Farmer tools', title: 'Check my grove', sub: 'Your exact place, the real forecast, the days you can receive margine.', kanji: '診', tone: '#a3c35a', actor: 'Farmer' }),
  grove: () =>
    scene('grove', async (page, mark) => {
      await page.goto(`${SITE}/check`);
      await page.getByRole('button', { name: 'Check my grove' }).waitFor();
      await sleep(1400);
      mark('start');
      await cap(page, 'Not a simulation: the farmer enters his own grove.');
      await type(page, '#area', '12', 90);
      await click(page, page.getByRole('button', { name: 'Check my grove' }), { after: 1800 });
      await cap(page, 'Seven days of real forecast for Agareb, with the m³ allowed each day.');
      await scroll(page, 330, 3200);
      await toTop(page);
      await cap(page, 'A grove 60 m from a drinking-water well? Never.');
      await type(page, '#well', '60', 90);
      await sleep(2600);
      await cap(page, null);
    }),

  t5: () => title('t5', { num: '05 · AI · lab reader', title: 'A lab report, read in seconds', sub: 'Photo, scan or PDF, in French, Arabic or English. Sonae turns it into a safe dose.', kanji: '読', tone: '#38bdf8' }),
  lab: () =>
    scene('lab', async (page, mark, wait) => {
      await page.goto(`${SITE}/check`);
      await page.getByRole('radio', { name: 'Lab report' }).waitFor();
      await sleep(1300);
      mark('start');
      await click(page, page.getByRole('radio', { name: 'Lab report' }), { after: 900 });
      await cap(page, 'A real lab bulletin, in French, with mixed units.');
      await click(page, page.getByRole('button', { name: 'Try a sample report' }), { after: 1600 });
      await click(page, page.getByRole('button', { name: 'Read the report' }), { after: 200 });
      await cap(page, 'The lab reader AI reads it and converts the units itself.');
      wait.start();
      await page.getByText("Sonae's advice").waitFor({ timeout: 90000 });
      wait.end();
      await cap(page, 'Rich in potassium, so Sonae lowers the dose to 33 m³ per hectare.');
      await scroll(page, 380, 3800);
      await cap(page, 'One click puts this reading on the blockchain passport.');
      await sleep(2400);
      await cap(page, null);
    }),

  t6: () => title('t6', { num: '06 · AI · Ask Sonae', title: 'Ask in Derja, Arabic, French or English', sub: 'It answers with the planner and the real weather, never with guesses.', kanji: '問', tone: '#38bdf8' }),
  ask: () =>
    scene('ask', async (page, mark, wait) => {
      await page.goto(`${SITE}/check`);
      await page.getByRole('radio', { name: 'Ask Sonae' }).waitFor();
      await sleep(1300);
      mark('start');
      await click(page, page.getByRole('radio', { name: 'Ask Sonae' }), { after: 900 });
      await cap(page, 'A farmer near Agareb asks when the mill can send margine.');
      await click(page, page.locator('button.chip', { hasText: 'Agareb' }), { after: 200 });
      wait.start();
      await page.getByText(/used:/).first().waitFor({ timeout: 120000 });
      wait.end();
      await cap(page, 'It called the grove check and the real forecast, then explained.');
      await sleep(4200);
      await cap(page, 'Now in Derja: “what do we do with the margine if it rains tomorrow?”');
      await type(page, '#ask', 'Chnoua n3amel bel margine ki tsob chta ghodwa fi Sfax?', 30);
      await click(page, page.getByRole('button', { name: 'Ask', exact: true }), { after: 200 });
      wait.start();
      await page.getByText(/used:/).nth(1).waitFor({ timeout: 120000 }).catch(() => {});
      await sleep(400);
      wait.end();
      await cap(page, 'It answers in Derja, with the real rain for Sfax.');
      await sleep(4800);
      await cap(page, null);
    }),

  t7: () => title('t7', { num: '07 · Packs', title: 'Simple prices, paid by who gains', sub: 'Mills pay about half a dinar per m³. Farmers: free, or 35 TND per hectare.', kanji: '価', tone: '#f59e0b' }),
  pricing: () =>
    scene('pricing', async (page, mark) => {
      await page.goto(`${SITE}/pricing`);
      await page.getByRole('radio', { name: 'Farmer' }).waitFor();
      await sleep(1300);
      mark('start');
      await cap(page, 'Mill packs: Essentiel, Pro for most mills, Coopérative for large ones.');
      await setRange(page, '#amount', 3500);
      await sleep(1800);
      await setRange(page, '#amount', 1500);
      await sleep(1800);
      await cap(page, 'Farmers: Voisin is free; Grove plans the dose for 35 TND per hectare.');
      await click(page, page.getByRole('radio', { name: 'Farmer' }), { after: 1200 });
      await setRange(page, '#amount', 25);
      await sleep(2400);
      await cap(page, null);
    }),

  t8: () => title('t8', { num: '08 · Farmer account', title: 'Sign up, describe the land, get a plan', sub: 'A new farmer joins in a minute. The AI plans his season around exact numbers.', kanji: '畑', tone: '#a3c35a', actor: 'Farmer' }),
  signup: () =>
    scene('signup', async (page, mark, wait) => {
      const email = `salma.${Date.now().toString(36)}@sonae.demo`;
      state.testFarmer = email;
      writeFileSync(stateFile, JSON.stringify(state));
      await page.goto(`${SITE}/signup`);
      await page.locator('#email').waitFor();
      await sleep(1200);
      mark('start');
      await cap(page, 'Sign up as a farmer. Admin accounts can’t be created here.');
      await click(page, page.locator('button[aria-pressed]', { hasText: 'Farmer' }), { after: 600 });
      await type(page, '#name', 'Salma Trabelsi', 45);
      await type(page, '#email', email, 22);
      await type(page, '#password', `demo-${Math.random().toString(36).slice(2, 12)}`, 22);
      await click(page, page.getByRole('button', { name: /Create my/ }), { after: 1500 });
      await page.locator('#fname').waitFor({ timeout: 20000 });
      await cap(page, 'Her farm: area, trees, slope, distances to the well and the wadi.');
      await type(page, '#fname', 'Ferme Trabelsi', 40);
      await type(page, '#area', '8', 90);
      await type(page, '#trees', '900', 70);
      await click(page, page.getByRole('button', { name: 'Save my farm' }), { after: 1400 });
      await cap(page, 'One button: Sonae computes the numbers, then Sonae AI writes her plan.');
      await click(page, page.getByRole('button', { name: /Generate my season plan/ }), { after: 200 });
      wait.start();
      await page.getByText('What the season costs and brings').waitFor({ timeout: 120000 });
      wait.end();
      await cap(page, 'How much margine her trees need, how many loads, what she saves.');
      await sleep(3800);
      await scroll(page, 560, 2600);
      await cap(page, 'Phases from November to February, each with actions and weather.');
      await scroll(page, 520, 1200);
      const ph = page.locator('button[aria-pressed]');
      if ((await ph.count()) > 1) await click(page, ph.nth(1), { after: 2600 });
      await cap(page, null);
    }),

  t9: () => title('t9', { num: '09 · Mill owner account', title: 'A whole season, generated live', sub: 'Costs, income, tankers, hectares, phases, risks and a checklist, from one button.', kanji: '計', tone: '#c08a52', actor: 'Mill owner' }),
  mill: () =>
    scene('mill', async (page, mark, wait) => {
      await page.goto(`${SITE}/login`);
      await sleep(1000);
      mark('start');
      await cap(page, 'The mill owner signs in.');
      await login(page, env.DEMO_MILL_EMAIL, env.DEMO_PASSWORD);
      await page.getByRole('button', { name: /Generate my season plan/ }).waitFor({ timeout: 20000 });
      await cap(page, 'His mill: 2,400 t of olives, 1,800 m³ of margine, 950 t of fitoura. Pack: Pro.');
      await sleep(3000);
      await click(page, page.getByRole('button', { name: /Generate my season plan/ }), { after: 200 });
      await cap(page, 'Sonae computes trips, hectares, safe days and every dinar; the AI writes the plan.');
      wait.start();
      await page.getByText('What the season costs and brings').waitFor({ timeout: 120000 });
      wait.end();
      await sleep(3200);
      await cap(page, 'Costs and income: the fitoura sold as fuel more than pays for the season.');
      await scroll(page, 520, 3600);
      await cap(page, 'The season, phase by phase: tap a phase to see what to do.');
      await scroll(page, 560, 1400);
      const ph = page.locator('button[aria-pressed]');
      if ((await ph.count()) > 2) {
        await click(page, ph.nth(1), { after: 2200 });
        await click(page, ph.nth(2), { after: 2200 });
      }
      await cap(page, 'Risks with how to avoid them, and a checklist to tick.');
      await scroll(page, 560, 1200);
      await click(page, page.locator('button[aria-expanded]').nth(1), { after: 1800 }).catch(() => {});
      const boxes = page.locator('input[type=checkbox]');
      if ((await boxes.count()) > 1) {
        await click(page, boxes.nth(0), { after: 500 });
        await click(page, boxes.nth(1), { after: 900 });
      }
      await scroll(page, 520, 2000);
      await cap(page, null);
    }),

  t10: () => title('t10', { num: '10 · Admin', title: 'The whole picture, at a glance', sub: 'Users, packs, revenue, volumes under plan, AI spending. Suspend an account in one click.', kanji: '管', tone: '#38bdf8', actor: 'Admin' }),
  admin: () =>
    scene('admin', async (page, mark) => {
      await page.goto(`${SITE}/login`);
      await sleep(1000);
      mark('start');
      await cap(page, 'The admin signs in.');
      await login(page, env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
      await page.getByText('Season revenue').waitFor({ timeout: 20000 });
      await cap(page, 'Mill owners, farmers, season revenue, margine and hectares under plan.');
      await sleep(3200);
      await scroll(page, 380, 1200);
      await cap(page, 'Packs and subscribers, and how much the AI has cost against its cap.');
      await sleep(2400);
      await click(page, page.locator('button.chip', { hasText: 'farmers' }), { after: 1400 });
      if (state.testFarmer) {
        const row = page.locator('li', { hasText: state.testFarmer });
        if (await row.count()) {
          await cap(page, 'Suspend an account: its sessions end at once. Then reactivate it.');
          await click(page, row.getByRole('button', { name: 'Suspend' }), { after: 1600 });
          await click(page, page.locator('li', { hasText: state.testFarmer }).getByRole('button', { name: 'Reactivate' }), { after: 1400 });
        }
      }
      await cap(page, null);
    }),

  t11: () => title('t11', { num: '11 · Blockchain · Yui on Sepolia', title: 'The margine passport', sub: 'Dispatch, confirm, certify, verify: real transactions, caps enforced by the contract.', kanji: '結', tone: '#10b981' }),
  yui: () =>
    scene('yui', async (page, mark, wait) => {
      await page.goto(`${SITE}/yui`);
      await page.getByText('Groves approved by the regulator').waitFor({ timeout: 30000 });
      await sleep(3000);
      mark('start');
      await cap(page, 'With no wallet at all, anyone can read the live contract.');
      await sleep(2600);
      await scroll(page, 330, 1200);
      await cap(page, 'Connect the wallet: it is the regulator, the mill and the tanker meter.');
      await click(page, page.getByRole('button', { name: 'Connect MetaMask' }), { after: 2600 });
      await scroll(page, 420, 1200);
      await cap(page, 'The contract refuses any load above the grove’s legal cap.');
      await page.locator('#grove').selectOption('1');
      await type(page, '#m3', '700', 90);
      await sleep(2400);
      await type(page, '#m3', '15', 90);
      await cap(page, 'Dispatch 15 m³ to Hédi’s grove, with the lab reading’s fingerprint.');
      await click(page, page.getByRole('button', { name: /^Dispatch \d+ m³/ }), { after: 200 });
      wait.start();
      await page.getByText('Dispatch: done.').waitFor({ timeout: 180000 });
      wait.end();
      await cap(page, 'The load is on the road; Sonae’s fee stays locked until delivery.');
      await scroll(page, 380, 2600);
      await cap(page, 'The farmer, or the tanker’s meter, confirms the delivery.');
      await click(page, page.getByRole('button', { name: 'Confirm' }).first(), { after: 200 });
      wait.start();
      await page.getByText(/Confirm load #\d+: done\./).waitFor({ timeout: 180000 });
      wait.end();
      await sleep(1600);
      await cap(page, 'Every load traced, none lost: the mill can certify a batch of oil.');
      await click(page, page.getByRole('button', { name: 'Certify this batch' }), { after: 200 });
      wait.start();
      await page.getByText('Certify batch: done.').waitFor({ timeout: 180000 });
      wait.end();
      await sleep(2500);
      const first = await page.locator('ul li', { hasText: /^#\d+ · .* L · / }).first().textContent().catch(() => null);
      const id = first?.match(/^#(\d+)/)?.[1] ?? '1';
      await cap(page, 'The Zero-Spill certificate: anyone checks it, no account, no middleman.');
      await type(page, '#verify', id, 120);
      await sleep(3800);
      await cap(page, null);
    }, { wallet: true }),

  t12: () => title('t12', { num: '12 · Proof on real weather', title: 'A whole season, replayed', sub: 'Sfax, winter 2025-26, day by day.', kanji: '再', tone: '#ff5a5f' }),
  replay: () =>
    scene('replay', async (page, mark) => {
      await page.goto(`${SITE}/replay`);
      await page.getByText('The ponds, day by day').waitFor({ timeout: 30000 });
      await sleep(1200);
      mark('start');
      await cap(page, 'Without Sonae: 7,522 m³ spilled into the wadis on 78 days. With Sonae: none.');
      await sleep(3800);
      await cap(page, 'Even with three times the rain, the plan holds.');
      await click(page, page.getByRole('radio', { name: /Wet winter/ }), { after: 2800 });
      await scroll(page, 520, 2600);
      await cap(page, null);
    }),

  t13: () => title('t13', { num: '13 · For everyone', title: 'English and Arabic, one tap', sub: 'The whole site right to left. The AI answers and plans in Arabic too.', kanji: 'ع', tone: '#f59e0b' }),
  arabic: () =>
    scene('arabic', async (page, mark) => {
      await page.goto(`${SITE}/`);
      await page.getByRole('button', { name: 'التبديل إلى العربية' }).waitFor();
      await sleep(1300);
      mark('start');
      await cap(page, 'One tap: the whole site in Arabic, right to left.');
      await click(page, page.getByRole('button', { name: 'التبديل إلى العربية' }), { after: 2800 });
      await click(page, page.locator('header a[href="/twin"]'), { after: 3000 });
      await click(page, page.locator('header a[href="/check"]'), { after: 2600 });
      await click(page, page.locator('header a[href="/yui"]'), { after: 2800 });
      await cap(page, null);
    }),

  f99: () => title('f99', { brand: '1', title: 'Prepared, nothing to fear.', sub: 'Free fertiliser for farmers, cheap fuel for hammams and kilns, proof of clean oil for exporters.' }, 4800),
};

const wanted = process.argv.slice(2);
for (const [name, fn] of Object.entries(SCENES)) {
  if (wanted.length && !wanted.includes(name)) continue;
  await fn();
}
await browser.close();
