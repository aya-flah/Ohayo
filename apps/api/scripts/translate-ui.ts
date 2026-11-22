/**
 * Translates the website's interface into Arabic or Japanese.
 *  - apps/web/src/i18n/strings.json   → <lang>.json            (plain strings)
 *  - apps/web/src/i18n/templates.json → <lang>-templates.json  (sentences with {0}, {1} placeholders)
 * Strings already translated are kept, so re-running only translates new ones.
 * Run from apps/api: npx tsx scripts/translate-ui.ts ar   (or: ja)
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
const LANG = (process.argv[2] ?? 'ar') as 'ar' | 'ja';
if (!['ar', 'ja'].includes(LANG)) throw new Error('Usage: translate-ui.ts ar|ja');
const Out = z.object({ items: z.array(z.object({ i: z.number(), t: z.string() })) });

const SYSTEM_AR = `You translate the interface of Sonae, a Tunisian web app for olive mills and farmers, from English into clear Modern Standard Arabic that Tunisian users read easily.
Rules:
- Keep these names in Latin letters: Sonae, Sonae AI, Zitoun, Yui, Sepolia, MetaMask, Open-Meteo, Sourcify, Etherscan, TND, ESP32, Wokwi, PWA, SMS, QR, API.
- Vocabulary: margine = المرجين, grignon / fitoura = الفيتورة, maâsra / olive mill = المعصرة, olive grove = غابة الزيتون, wadi = الوادي, well = البئر, hammam = الحمّام, tanker = الصهريج, pond = الحوض, passport = الجواز, pack = الباقة, season = الموسم, farmer = الفلاح, mill owner = صاحب المعصرة, admin = المشرف.
- Keep units and symbols as they are (m³, ha, mm, kg, %, °C, km, t), keep numbers in Western digits, keep the leading/trailing punctuation (· … : ? !), and keep any emoji or symbol.
- Short UI labels stay short. Do not add explanations. If a string is not human text (code, a CSS value, an identifier), return it unchanged.
- Placeholders like {0}, {1} stand for values inserted later (numbers, names, dates): keep every placeholder exactly once, placed where it reads naturally in Arabic.
- Text in Tunisian Derja written in Latin letters (e.g. "ma fammech", "ghodwa") stays as it is.
Return every item with its index i and its translation t.`;

const SYSTEM_JA = `You translate the interface of Sonae, a Tunisian web app for olive mills and farmers, from English into natural, concise Japanese for a Japanese audience (jury members and visitors). Use polite but compact UI Japanese (です・ます only in full sentences; labels and buttons stay short, e.g. 保存, 次へ).
Rules:
- Keep these names in Latin letters: Sonae, Sonae AI, Zitoun, Yui, Sepolia, MetaMask, Open-Meteo, Sourcify, Etherscan, TND, ESP32, Wokwi, PWA, SMS, QR, API, Ethereum.
- Vocabulary: margine = マルジン（オリーブ搾油廃水）on first mention in long text, otherwise マルジン; grignon / fitoura = オリーブ搾りかす (フィトゥーラ when the word fitoura itself is used); maâsra / olive mill = 搾油所; olive grove = オリーブ園; wadi = ワジ（涸れ川）; well = 井戸; hammam = ハマム（公衆浴場）; tanker = タンクローリー; pond = 貯留池; passport = パスポート; pack = パック; season = シーズン; farmer = 農家; mill owner = 搾油所オーナー; admin = 管理者; Derja = チュニジア方言（デルジャ）; spreading = 散布; potash/potassium = カリウム.
- Keep units and symbols as they are (m³, ha, mm, kg, %, °C, km, t), keep numbers in Western digits, keep the leading/trailing punctuation (· … : ? !) and any emoji or symbol. Tunisian place names (Sfax, Agareb, Sousse…) may be written in katakana (スファックス, アガレブ, スース).
- Short UI labels stay short. Do not add explanations. If a string is not human text (code, a CSS value, an identifier), return it unchanged.
- Placeholders like {0}, {1} stand for values inserted later (numbers, names, dates): keep every placeholder exactly once, placed where it reads naturally in Japanese.
- Text in Tunisian Derja written in Latin letters (e.g. "ma fammech", "ghodwa") stays as it is.
Return every item with its index i and its translation t.`;
const SYSTEM = LANG === 'ja' ? SYSTEM_JA : SYSTEM_AR;

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
      for (const { i, t } of items) {
        const en = todo[i];
        if (en && t.trim() && check(en, t)) {
          done[en] = t.trim();
          n++;
        }
      }
    }
    writeFileSync(outFile, JSON.stringify(done, null, 1));
    console.log(`  translated ${n}/${todo.length}`);
  }
}

const placeholders = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join(',');
await run('strings.json', `${LANG}.json`, () => true);
await run('templates.json', `${LANG}-templates.json`, (en, out) => placeholders(en) === placeholders(out));
