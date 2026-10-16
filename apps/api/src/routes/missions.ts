import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { MissionInput, StatusRequest, type MissionState } from '@aeris/shared';
import { HttpError, createMission, getOr404, listMissions, updateMission } from '../store';

type IdParams = { Params: { id: string } };

const plugin: FastifyPluginAsync = async (app) => {
  app.get('/missions', async () => listMissions());

  app.post('/missions', async (req, reply) => {
    const input = MissionInput.parse(req.body);
    const state: MissionState = {
      mission: { ...input, id: randomUUID() },
      status: 'config',
      proposals: [],
    };
    await createMission(state);
    return reply.code(201).send(state);
  });

  app.get<IdParams>('/missions/:id', async (req) => getOr404(req.params.id));

  /** Remplace la configuration (interdit pendant la conduite). Invalide les propositions. */
  app.put<IdParams>('/missions/:id', async (req) => {
    return updateMission(req.params.id, (st) => {
      if (st.status === 'conduite') throw new HttpError(409, 'Opération en cours');
      st.mission = { ...MissionInput.parse(req.body), id: st.mission.id };
      st.proposals = [];
      st.selectedProposalId = undefined;
      if (st.status === 'propositions') st.status = 'phasage';
      return st;
    });
  });

  /** Navigation entre étapes de préparation (la conduite se lance via /start). */
  app.put<IdParams>('/missions/:id/status', async (req) => {
    return updateMission(req.params.id, (st) => {
      const { status } = StatusRequest.parse(req.body);
      if (status === 'conduite') throw new HttpError(400, 'Utiliser /proposals/:pid/start');
      if (st.status === 'conduite') throw new HttpError(409, 'Opération en cours');
      st.status = status;
      return st;
    });
  });
};

export default plugin;
