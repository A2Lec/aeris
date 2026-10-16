import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import { initializeDroneCatalog } from './catalogStore';
import catalogRoutes from './routes/catalog';
import liveRoutes, { type LiveOptions } from './routes/live';
import missionsRoutes from './routes/missions';
import proposalsRoutes from './routes/proposals';
import { isSharedBackend } from './store';

/** Construit l'application sans l'écouter (utilisé par server.ts, vercel.ts et les tests). */
export async function buildApp(opts: FastifyServerOptions = {}, live: LiveOptions = {}) {
  const app = Fastify(opts);

  await app.register(cors, { origin: true });

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
  // Stockage partagé : une autre instance a pu ajouter des drones depuis.
  if (isSharedBackend) app.addHook('onRequest', initializeDroneCatalog);

  // Imports statiques : la fonction Vercel est un bundle unique, sans dossier routes/ à lister.
  await app.register(catalogRoutes, { prefix: '/api' });
  await app.register(liveRoutes, { prefix: '/api', ...live });
  await app.register(missionsRoutes, { prefix: '/api' });
  await app.register(proposalsRoutes, { prefix: '/api' });

  return app;
}
