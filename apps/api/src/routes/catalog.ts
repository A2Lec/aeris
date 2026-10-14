import type { FastifyPluginAsync } from 'fastify';
import { demoMission, drones, pilotRules } from '@aeris/data';
import { fetchWeather } from '@aeris/weather';
import { z } from 'zod';

const plugin: FastifyPluginAsync = async (app) => {
  app.get('/catalog', async () => ({ drones, rules: pilotRules }));

  app.get('/demo-mission', async () => demoMission);

  app.get('/weather', async (req) => {
    const q = z.object({ lat: z.coerce.number(), lng: z.coerce.number() }).parse(req.query);
    return fetchWeather(q.lat, q.lng);
  });
};

export default plugin;
