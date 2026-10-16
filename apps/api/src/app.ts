import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { initializeDroneCatalog } from './catalogStore';
import catalogRoutes from './routes/catalog';
import liveRoutes from './routes/live';
import missionsRoutes from './routes/missions';
import proposalsRoutes from './routes/proposals';

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

  // Imports statiques : la fonction Vercel est un bundle unique, sans dossier routes/ à lister.
  for (const routes of [catalogRoutes, liveRoutes, missionsRoutes, proposalsRoutes]) {
    await app.register(routes, { prefix: '/api' });
  }

  return app;
}
