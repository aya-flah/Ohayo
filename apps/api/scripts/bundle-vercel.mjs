// Bundles the API (and the shared TypeScript packages it imports) into one ESM file that
// Vercel runs as a Node function: api/index.mjs at the repository root.
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

await build({
  entryPoints: [join(root, 'apps/api/src/vercel.ts')],
  outfile: join(root, 'api/index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: false,
  legalComments: 'none',
  // Some CommonJS dependencies call require() for Node built-ins.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
