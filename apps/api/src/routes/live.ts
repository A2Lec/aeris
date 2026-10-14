import type { FastifyPluginAsync } from 'fastify';
import { AcceptRequest, MissionEvent, type LiveState, type MissionState } from '@aeris/shared';
import { HttpError, getOr404, onLive, publishLive, store } from '../store';
import { applyEvent } from '../services/events';
import { buildProposal, coverageFor, metricsFor, stabilityFor } from '../services/pipeline';

type IdParams = { Params: { id: string } };

function liveOf(st: MissionState): LiveState {
  if (st.status !== 'conduite' || !st.live) throw new HttpError(409, 'Aucune opération en cours');
  return st.live;
}

const plugin: FastifyPluginAsync = async (app) => {
  /** Injecte un événement (TP indisponible, déplacement, météo, nouvelle zone…). */
  app.post<IdParams>('/missions/:id/events', async (req) => {
    const st = getOr404(req.params.id);
    const live = liveOf(st);
    applyEvent(st, live, MissionEvent.parse(req.body));
    publishLive(st.mission.id, live);
    return live;
  });

  /** Recalcule la phase courante en partant des positions réelles (stabilité). */
  app.post<IdParams>('/missions/:id/recompute', async (req) => {
    const st = getOr404(req.params.id);
    const live = liveOf(st);
    const selected = st.proposals.find((p) => p.id === live.proposalId);
    const proposal = await buildProposal(st.mission, selected?.strategy ?? 'priorite', {
      weather: live.weather,
      previous: live.assignments,
      phases: [live.phase],
    });
    // Ce qui change par rapport aux positions réelles : l'opérateur valide en connaissance de cause.
    proposal.stability = stabilityFor(
      st.mission,
      live.phase,
      live.assignments,
      proposal.assignments,
    );
    live.pendingRecompute = proposal;
    publishLive(st.mission.id, live);
    return proposal;
  });

  /** Couverture / trous / chevauchement des positions réelles courantes. */
  app.get<IdParams>('/missions/:id/live/coverage', async (req) => {
    const st = getOr404(req.params.id);
    const live = liveOf(st);
    return coverageFor(st.mission, live.phase, live.assignments);
  });

  /** L'opérateur valide le recalcul proposé. */
  app.post<IdParams>('/missions/:id/recompute/accept', async (req) => {
    const st = getOr404(req.params.id);
    const live = liveOf(st);
    const { proposalId } = AcceptRequest.parse(req.body);
    const pending = live.pendingRecompute;
    if (!pending || pending.id !== proposalId) {
      // Retiré par un événement survenu depuis (voir applyEvent) : il faut recalculer.
      throw new HttpError(409, 'Recalcul périmé : la situation a changé, relancez le calcul');
    }
    // Garde-fou : jamais de couple indisponible dans le dispositif appliqué.
    const available = new Set(st.mission.resources.filter((r) => r.available).map((r) => r.id));
    live.assignments = pending.assignments.filter(
      (a) => a.phase === live.phase && available.has(a.resourceId),
    );
    live.metrics = metricsFor(st.mission, live.phase, live.assignments);
    live.pendingRecompute = undefined;
    publishLive(st.mission.id, live);
    return live;
  });

  /** Le commandement refuse le recalcul proposé : le dispositif en place ne change pas. */
  app.post<IdParams>('/missions/:id/recompute/reject', async (req) => {
    const st = getOr404(req.params.id);
    const live = liveOf(st);
    live.pendingRecompute = undefined;
    publishLive(st.mission.id, live);
    return live;
  });

  /** Flux temps réel vers le poste : un message { type: 'live', live } à chaque changement. */
  app.get<IdParams>('/missions/:id/live', { websocket: true }, (socket, req) => {
    const st = store.get(req.params.id);
    if (!st) {
      socket.send(JSON.stringify({ type: 'error', message: 'Mission inconnue' }));
      socket.close();
      return;
    }
    if (st.live) socket.send(JSON.stringify({ type: 'live', live: st.live }));
    const off = onLive(req.params.id, (live) =>
      socket.send(JSON.stringify({ type: 'live', live })),
    );
    socket.on('close', off);
  });
};

export default plugin;
