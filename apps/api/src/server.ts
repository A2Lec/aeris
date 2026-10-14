import { buildApp } from './app';

const app = await buildApp({ logger: { level: 'info' } });
const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
