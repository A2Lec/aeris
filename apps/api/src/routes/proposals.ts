import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ProposalEditRequest, SolveRequest, type MissionState } from '@aeris/shared';
import { HttpError, getOr404, publishLive, updateMission } from '../store';
import {
  buildProposal,
  coverageFor,
  metricsFor,
  sizeMission,
  tryWeather,
} from '../services/pipeline';

type IdParams = { Params: { id: string } };
type PidParams = { Params: { id: string; pid: string } };

function proposalOr404(st: MissionState, pid: string) {
  const proposal = st.proposals.find((p) => p.id === pid);
  if (!proposal) throw new HttpError(404, 'Proposition inconnue');
  return proposal;
}

const plugin: FastifyPluginAsync = async (app) => {
  /** Lance une proposition par stratégie, en parallèle. */
  app.post<IdParams>('/missions/:id/solve', async (req) => {
    const st = await getOr404(req.params.id);
    if (st.status === 'conduite') throw new HttpError(409, 'Opération en cours');
    const body = SolveRequest.parse(req.body ?? {});
    const weather = body.useWeather ? await tryWeather(st.mission) : undefined;
    // Planification sans moyens : la flotte est d'abord dimensionnée par le solveur.
    const sizing = sizeMission(st.mission, weather);
    const proposals = await Promise.all(
      body.strategies.map((s) => buildProposal(sizing.mission, s, { weather })),
    );
    for (const p of proposals) p.diagnostics = [...sizing.diagnostics, ...p.diagnostics];
    // Calcul fait sur une copie : on n'enregistre que s'il porte encore sur la configuration en place.
    const solvedFor = JSON.stringify(st.mission);
    return updateMission(req.params.id, (cur) => {
      if (cur.status === 'conduite') throw new HttpError(409, 'Opération en cours');
      if (JSON.stringify(cur.mission) !== solvedFor) {
        throw new HttpError(409, 'Configuration modifiée pendant le calcul : relancez le calcul');
      }
      cur.mission = sizing.mission;
      cur.proposals = [...cur.proposals, ...proposals];
      cur.status = 'propositions';
      return proposals;
    });
  });

  /** Positions retouchées à la main par l'opérateur : on recalcule les métriques. */
  app.put<PidParams>('/missions/:id/proposals/:pid', async (req) =>
    updateMission(req.params.id, (st) => {
      const proposal = proposalOr404(st, req.params.pid);
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
    }),
  );

  /** Couverture / trous / chevauchement d'une phase, pour la carte. */
  app.get<PidParams>('/missions/:id/proposals/:pid/coverage', async (req) => {
    const st = await getOr404(req.params.id);
    const proposal = proposalOr404(st, req.params.pid);
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

  app.delete<PidParams>('/missions/:id/proposals/:pid', async (req) =>
    updateMission(req.params.id, (st) => {
      st.proposals = st.proposals.filter((p) => p.id !== req.params.pid);
      return st;
    }),
  );

  /** Valide une proposition et lance la conduite des opérations (phase 1). */
  app.post<PidParams>('/missions/:id/proposals/:pid/start', async (req) => {
    const snapshot = await getOr404(req.params.id);
    proposalOr404(snapshot, req.params.pid);
    const weather = await tryWeather(snapshot.mission);
    const st = await updateMission(req.params.id, (st) => {
      const proposal = proposalOr404(st, req.params.pid);
      const assignments = proposal.assignments.filter((a) => a.phase === 0);
      st.selectedProposalId = proposal.id;
      st.status = 'conduite';
      st.live = {
        phase: 0,
        proposalId: proposal.id,
        assignments,
        metrics: metricsFor(st.mission, 0, assignments),
        events: [],
        weather,
      };
      return st;
    });
    await publishLive(st.mission.id, st.live!);
    return st;
  });
};

export default plugin;
