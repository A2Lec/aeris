import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const app = Fastify({ logger: { level: 'info' } });

await app.register(cors, { origin: true });
await app.register(websocket);

app.setErrorHandler((error, _req, reply) => {
  if (error instanceof Error && error.name === 'ZodError') {
    return reply.code(400).send({ message: 'Requête invalide', issues: (error as any).issues });
  }
  app.log.error(error);
  const status = (error as { statusCode?: number }).statusCode ?? 500;
  return reply
    .code(status)
    .send({ message: error instanceof Error ? error.message : String(error) });
});

// Chaque fichier de routes/ est un plugin Fastify chargé automatiquement :
// ajouter une route = ajouter un fichier, sans toucher à ce fichier-ci.
const routesDir = join(dirname(fileURLToPath(import.meta.url)), 'routes');
for (const file of (await readdir(routesDir)).sort()) {
  if (!/\.(ts|js)$/.test(file) || file.includes('.test.')) continue;
  const mod = await import(pathToFileURL(join(routesDir, file)).href);
  await app.register(mod.default, { prefix: '/api' });
}

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
