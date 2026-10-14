import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initializeDroneCatalog } from './catalogStore';

/** Construit l'application sans l'écouter (utilisé par server.ts et les tests). */
export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);

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

  await initializeDroneCatalog();

  // Chaque fichier de routes/ est un plugin Fastify chargé automatiquement :
  // ajouter une route = ajouter un fichier, sans toucher à ce fichier-ci.
  const routesDir = join(dirname(fileURLToPath(import.meta.url)), 'routes');
  for (const file of (await readdir(routesDir)).sort()) {
    if (!/\.(ts|js)$/.test(file) || file.includes('.test.')) continue;
    const mod = await import(pathToFileURL(join(routesDir, file)).href);
    await app.register(mod.default, { prefix: '/api' });
  }

  return app;
}
