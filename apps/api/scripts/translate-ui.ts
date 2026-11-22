/**
 * One-off: translates the website's interface into Arabic.
 *  - apps/web/src/i18n/strings.json   → ar.json            (plain strings)
 *  - apps/web/src/i18n/templates.json → ar-templates.json  (sentences with {0}, {1} placeholders)
 * Strings already translated are kept, so re-running only translates new ones.
 * Run from apps/api: npx tsx scripts/translate-ui.ts
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', '..', 'web', 'src', 'i18n');
const client = new Anthropic();
const Out = z.object({ items: z.array(z.object({ i: z.number(), ar: z.string() })) });

const SYSTEM = `You translate the interface of Sonae, a Tunisian web app for olive mills and farmers, from English into clear Modern Standard Arabic that Tunisian users read easily.
Rules:
- Keep these names in Latin letters: Sonae, Sonae AI, Zitoun, Yui, Sepolia, MetaMask, Open-Meteo, Sourcify, Etherscan, TND, ESP32, Wokwi, PWA, SMS, QR, API.
- Vocabulary: margine = المرجين, grignon / fitoura = الفيتورة, maâsra / olive mill = المعصرة, olive grove = غابة الزيتون, wadi = الوادي, well = البئر, hammam = الحمّام, tanker = الصهريج, pond = الحوض, passport = الجواز, pack = الباقة, season = الموسم, farmer = الفلاح, mill owner = صاحب المعصرة, admin = المشرف.
- Keep units and symbols as they are (m³, ha, mm, kg, %, °C, km, t), keep numbers in Western digits, keep the leading/trailing punctuation (· … : ? !), and keep any emoji or symbol.
- Short UI labels stay short. Do not add explanations. If a string is not human text (code, a CSS value, an identifier), return it unchanged.
- Placeholders like {0}, {1} stand for values inserted later (numbers, names, dates): keep every placeholder exactly once, placed where it reads naturally in Arabic.
- Text in Tunisian Derja written in Latin letters (e.g. "ma fammech", "ghodwa") stays as it is.
Return every item with its index i.`;

const code = (s: string) => /[;\[\]]|var\(|=>|^[a-z_$][\w$]*\.[\w$]|^\(|^[a-z-]+\(|color-mix|oklab|px\b/.test(s);

async function batch(items: string[], offset: number) {
  const list = items.map((s, k) => `${offset + k}\t${s}`).join('\n');
  const res = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'low', format: zodOutputFormat(Out) },
    messages: [{ role: 'user', content: `Translate each line (index TAB text):\n${list}` }],
  });
  if (!res.parsed_output) throw new Error(`batch ${offset}: no output (${res.stop_reason})`);
  return res.parsed_output.items;
}

async function run(input: string, output: string, check: (en: string, ar: string) => boolean) {
  const strings: string[] = JSON.parse(readFileSync(join(dir, input), 'utf8'));
  const outFile = join(dir, output);
  const done: Record<string, string> = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
  const todo = strings.filter((s) => !done[s] && !code(s));
  console.log(`${input}: ${todo.length} to translate (${Object.keys(done).length} already done)`);
  const SIZE = 80;
  const chunks: Array<[string[], number]> = [];
  for (let k = 0; k < todo.length; k += SIZE) chunks.push([todo.slice(k, k + SIZE), k]);
  let n = 0;
  for (let k = 0; k < chunks.length; k += 4) {
    const results = await Promise.all(chunks.slice(k, k + 4).map(([items, off]) => batch(items, off)));
    for (const items of results) {
      for (const { i, ar } of items) {
        const en = todo[i];
        if (en && ar.trim() && check(en, ar)) {
          done[en] = ar.trim();
          n++;
        }
      }
    }
    writeFileSync(outFile, JSON.stringify(done, null, 1));
    console.log(`  translated ${n}/${todo.length}`);
  }
}

const placeholders = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join(',');
await run('strings.json', 'ar.json', () => true);
await run('templates.json', 'ar-templates.json', (en, ar) => placeholders(en) === placeholders(ar));
