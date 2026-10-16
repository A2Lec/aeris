import type { FastifyPluginAsync } from 'fastify';
import {
  AcceptRequest,
  MissionEvent,
  type LiveMessage,
  type LiveState,
  type MissionState,
} from '@aeris/shared';
import { HttpError, backend, getOr404, onLive, publishLive, updateMission } from '../store';
import { applyEvent } from '../services/events';
import { buildProposal, coverageFor, metricsFor, stabilityFor } from '../services/pipeline';

type IdParams = { Params: { id: string } };

export interface LiveOptions {
  /** Durée max d'un flux temps réel : le client se reconnecte seul (limite des fonctions Vercel). */
  liveMaxMs?: number;
}

function liveOf(st: MissionState): LiveState {
  if (st.status !== 'conduite' || !st.live) throw new HttpError(409, 'Aucune opération en cours');
  return st.live;
}

/** Applique `change` à l'opération en cours, enregistre puis diffuse le nouvel état. */
async function updateLive(id: string, change: (st: MissionState, live: LiveState) => void) {
  const live = await updateMission(id, (st) => {
    const live = liveOf(st);
    change(st, live);
    return live;
  });
  await publishLive(id, live);
  return live;
}

const plugin: FastifyPluginAsync<LiveOptions> = async (app, opts) => {
  /** Injecte un événement (TP indisponible, déplacement, météo, nouvelle zone…). */
  app.post<IdParams>('/missions/:id/events', async (req) =>
    updateLive(req.params.id, (st, live) => applyEvent(st, live, MissionEvent.parse(req.body))),
  );

  /** Recalcule la phase courante en partant des positions réelles (stabilité). */
  app.post<IdParams>('/missions/:id/recompute', async (req) => {
    const st = await getOr404(req.params.id);
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
    await updateLive(req.params.id, (_, current) => {
      // Calcul fait sur une copie : un événement survenu pendant le calcul le rend périmé.
      if (current.events.length !== live.events.length || current.phase !== live.phase) {
        throw new HttpError(409, 'Recalcul périmé : la situation a changé, relancez le calcul');
      }
      current.pendingRecompute = proposal;
    });
    return proposal;
  });

  /** Couverture / trous / chevauchement des positions réelles courantes. */
  app.get<IdParams>('/missions/:id/live/coverage', async (req) => {
    const st = await getOr404(req.params.id);
    const live = liveOf(st);
    return coverageFor(st.mission, live.phase, live.assignments);
  });

  /** L'opérateur valide le recalcul proposé. */
  app.post<IdParams>('/missions/:id/recompute/accept', async (req) =>
    updateLive(req.params.id, (st, live) => {
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
    }),
  );

  /** Le commandement refuse le recalcul proposé : le dispositif en place ne change pas. */
  app.post<IdParams>('/missions/:id/recompute/reject', async (req) =>
    updateLive(req.params.id, (_, live) => {
      live.pendingRecompute = undefined;
    }),
  );

  /** Flux temps réel (SSE) vers le poste : un message { type: 'live', live } à chaque changement. */
  app.get<IdParams>('/missions/:id/live', async (req, reply) => {
    const id = req.params.id;
    const queued: LiveState[] = [];
    let send: (live: LiveState) => void = (live) => queued.push(live);
    // Abonné avant de lire l'état : aucun changement ne peut passer entre les deux.
    const off = await onLive(id, (live) => send(live));
    let stored;
    try {
      stored = await backend.getMission(id);
    } catch (error) {
      await off();
      throw error;
    }

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    });
    const write = (msg: LiveMessage) => res.write(`data: ${JSON.stringify(msg)}\n\n`);
    res.write('retry: 1000\n\n');
    if (!stored) {
      write({ type: 'error', message: 'Mission inconnue' });
      await off();
      res.end();
      return;
    }
    if (stored.state.live) write({ type: 'live', live: stored.state.live });
    send = (live) => write({ type: 'live', live });
    for (const live of queued) send(live);

    const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
    const limit = opts.liveMaxMs ? setTimeout(() => res.end(), opts.liveMaxMs) : undefined;
    res.on('close', () => {
      clearInterval(ping);
      clearTimeout(limit);
      void off();
    });
  });
};

export default plugin;
