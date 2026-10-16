import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from './app';

/** Une app Fastify par instance, réutilisée d'une invocation à l'autre. */
const ready = buildApp({ logger: { level: 'info' } }).then(async (app) => {
  await app.ready();
  return app;
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // SPIKE (étape 0) : sonde SSE temporaire, à retirer avant l'étape 4.
  if (req.url?.startsWith('/api/_spike/sse')) return spikeSse(req, res);
  const app = await ready;
  app.server.emit('request', req, res);
}

function spikeSse(req: IncomingMessage, res: ServerResponse) {
  const started = Date.now();
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  });
  res.write(
    `data: ${JSON.stringify({ url: req.url, started: new Date(started).toISOString() })}\n\n`,
  );
  const tick = setInterval(() => {
    res.write(
      `data: ${JSON.stringify({ elapsedS: Math.round((Date.now() - started) / 1000) })}\n\n`,
    );
  }, 5000);
  req.on('close', () => clearInterval(tick));
}
