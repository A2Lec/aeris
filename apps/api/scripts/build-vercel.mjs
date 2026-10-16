// Produit .vercel/output (Build Output API v3) : le front statique + l'API en une seule fonction.
// Les paquets @aeris/* exportent du TypeScript brut : l'API doit être bundlée pour tourner sous Node.
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(apiDir, '..', '..');
const out = join(root, '.vercel', 'output');
const fn = join(out, 'functions', 'api.func');

rmSync(out, { recursive: true, force: true });

execSync('pnpm --filter @aeris/web build', { cwd: root, stdio: 'inherit' });
cpSync(join(root, 'apps', 'web', 'dist'), join(out, 'static'), { recursive: true });

await build({
  entryPoints: [join(apiDir, 'src', 'vercel.ts')],
  outfile: join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Dépendances CommonJS (fastify…) : `require` n'existe pas en ESM.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  // Accélérateurs natifs optionnels de `ws`, absents par défaut.
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'info',
});

mkdirSync(fn, { recursive: true });
writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify({
    runtime: 'nodejs22.x',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    shouldAddHelpers: false,
    supportsResponseStreaming: true,
    regions: ['cdg1'],
    maxDuration: 300,
  }),
);
writeFileSync(
  join(out, 'config.json'),
  JSON.stringify({
    version: 3,
    routes: [{ handle: 'filesystem' }, { src: '^/api(?:/.*)?$', dest: '/api' }],
  }),
);
