import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ProposalEditRequest, SolveRequest } from '@aeris/shared';
import { HttpError, getOr404, publishLive } from '../store';
import { buildProposal, coverageFor, metricsFor, tryWeather } from '../services/pipeline';

type IdParams = { Params: { id: string } };
type PidParams = { Params: { id: string; pid: string } };

const plugin: FastifyPluginAsync = async (app) => {
  /** Lance une proposition par stratégie, en parallèle. */
  app.post<IdParams>('/missions/:id/solve', async (req) => {
    const st = getOr404(req.params.id);
    if (st.status === 'conduite') throw new HttpError(409, 'Opération en cours');
    const body = SolveRequest.parse(req.body ?? {});
    const weather = body.useWeather ? await tryWeather(st.mission) : undefined;
    const proposals = await Promise.all(
      body.strategies.map((s) => buildProposal(st.mission, s, { weather })),
    );
    st.proposals = [...st.proposals, ...proposals];
    st.status = 'propositions';
    return proposals;
  });

  /** Positions retouchées à la main par l'opérateur : on recalcule les métriques. */
  app.put<PidParams>('/missions/:id/proposals/:pid', async (req) => {
    const st = getOr404(req.params.id);
    const proposal = st.proposals.find((p) => p.id === req.params.pid);
    if (!proposal) throw new HttpError(404, 'Proposition inconnue');
    const { assignments } = ProposalEditRequest.parse(req.body);
    proposal.assignments = assignments;
    proposal.metricsByPhase = proposal.metricsByPhase.map((_, phase) =>
      metricsFor(
        st.mission,
        phase,
        assignments.filter((a) => a.phase === phase),
      ),
    );
    proposal.label = proposal.label.endsWith('(modifiée)')
      ? proposal.label
      : `${proposal.label} (modifiée)`;
    return proposal;
  });

  /** Couverture / trous / chevauchement d'une phase, pour la carte. */
  app.get<PidParams>('/missions/:id/proposals/:pid/coverage', async (req) => {
    const st = getOr404(req.params.id);
    const proposal = st.proposals.find((p) => p.id === req.params.pid);
    if (!proposal) throw new HttpError(404, 'Proposition inconnue');
    const { phase } = z
      .object({
        phase: z.coerce
          .number()
          .int()
          .min(0)
          .max(st.mission.phaseCount - 1)
          .default(0),
      })
      .parse(req.query);
    return coverageFor(st.mission, phase, proposal.assignments);
  });

  app.delete<PidParams>('/missions/:id/proposals/:pid', async (req) => {
    const st = getOr404(req.params.id);
    st.proposals = st.proposals.filter((p) => p.id !== req.params.pid);
    return st;
  });

  /** Valide une proposition et lance la conduite des opérations (phase 1). */
  app.post<PidParams>('/missions/:id/proposals/:pid/start', async (req) => {
    const st = getOr404(req.params.id);
    const proposal = st.proposals.find((p) => p.id === req.params.pid);
    if (!proposal) throw new HttpError(404, 'Proposition inconnue');
    const assignments = proposal.assignments.filter((a) => a.phase === 0);
    st.selectedProposalId = proposal.id;
    st.status = 'conduite';
    st.live = {
      phase: 0,
      proposalId: proposal.id,
      assignments,
      metrics: metricsFor(st.mission, 0, assignments),
      events: [],
      weather: await tryWeather(st.mission),
    };
    publishLive(st.mission.id, st.live);
    return st;
  });
};

export default plugin;
