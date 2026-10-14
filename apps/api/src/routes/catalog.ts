import type { FastifyPluginAsync } from 'fastify';
import { demoMission, pilotRules } from '@aeris/data';
import { NewDroneModel } from '@aeris/shared';
import { fetchWeather } from '@aeris/weather';
import { z } from 'zod';
import { addDrone, getDrones } from '../catalogStore';

const plugin: FastifyPluginAsync = async (app) => {
  app.get('/catalog', async () => ({ drones: getDrones(), rules: pilotRules }));

  app.post('/catalog/drones', async (req, reply) => {
    const input = NewDroneModel.parse(req.body);
    return reply.code(201).send(await addDrone(input));
  });

  app.get('/demo-mission', async () => demoMission);

  app.get('/weather', async (req) => {
    const q = z.object({ lat: z.coerce.number(), lng: z.coerce.number() }).parse(req.query);
    return fetchWeather(q.lat, q.lng);
  });
};

export default plugin;
