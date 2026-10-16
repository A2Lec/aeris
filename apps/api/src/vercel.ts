import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from './app';
import { isSharedBackend } from './store';

// Sans Redis, chaque instance aurait ses propres missions : on refuse de démarrer.
if (!isSharedBackend) throw new Error('REDIS_URL manquant : stockage partagé requis sur Vercel');

/** Une app Fastify par instance, réutilisée d'une invocation à l'autre. */
const ready = buildApp(
  { logger: { level: 'info' } },
  // Fonction limitée à 300 s : le flux temps réel est clos avant, le client se reconnecte.
  { liveMaxMs: 280_000 },
).then(async (app) => {
  await app.ready();
  return app;
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await ready;
  app.server.emit('request', req, res);
}
