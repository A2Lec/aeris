/**
 * Test d'intégration de bout en bout : le scénario de démo complet, avec chaque réponse
 * validée par les schémas de @aeris/shared. S'il passe, `main` démarre et le front
 * reçoit exactement ce que les contrats annoncent.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  API,
  Catalog,
  CoverageLayers,
  LiveState,
  MissionInput,
  MissionState,
  Proposal,
  WsMessage,
  type MissionEvent,
} from '@aeris/shared';
import { buildApp } from './app';

type App = Awaited<ReturnType<typeof buildApp>>;
let app: App;

async function call<T>(
  schema: z.ZodType<T>,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
  code = 200,
): Promise<T> {
  const res = await app.inject({ method, url, payload: body as object | undefined });
  expect(res.statusCode, `${method} ${url} → ${res.body}`).toBe(code);
  return schema.parse(res.json());
}

beforeAll(async () => {
  // Pas de réseau en CI : la météo tombe en panne, le calcul doit continuer sans elle.
  vi.stubGlobal('fetch', () => Promise.reject(new Error('réseau coupé (test)')));
  app = await buildApp({ logger: false });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

describe('Scénario de démo complet', () => {
  let id = '';
  let proposals: Proposal[] = [];
  let input: MissionInput;

  it('catalogue et mission de démo', async () => {
    const catalog = await call(Catalog, 'GET', API.catalog);
    expect(catalog.drones.length).toBeGreaterThan(0);
    input = await call(MissionInput, 'GET', API.demoMission);
  });

  it('refuse une mission invalide (400)', async () => {
    const res = await app.inject({ method: 'POST', url: API.missions, payload: { name: 'x' } });
    expect(res.statusCode).toBe(400);
  });

  it('crée la mission puis passe au phasage', async () => {
    const st = await call(MissionState, 'POST', API.missions, input, 201);
    expect(st.status).toBe('config');
    id = st.mission.id;
    const ph = await call(MissionState, 'PUT', API.status(id), { status: 'phasage' });
    expect(ph.status).toBe('phasage');
  });

  it('calcule une proposition par stratégie, sur toutes les phases', async () => {
    proposals = await call(z.array(Proposal), 'POST', API.solve(id), { useWeather: true });
    expect(proposals.map((p) => p.strategy).sort()).toEqual([
      'couverture_globale',
      'economie_moyens',
      'priorite',
    ]);
    for (const p of proposals) {
      expect(p.metricsByPhase).toHaveLength(input.phaseCount);
      // Démo autour de Bouconne : communes connues, une entrée par zone prioritaire active.
      expect(p.metricsByPhase[0].communes.length).toBeGreaterThan(0);
      expect(p.metricsByPhase[0].byZone?.length).toBeGreaterThan(0);
      expect(p.assignments.every((a) => a.phase < input.phaseCount)).toBe(true);
      expect(p.status).not.toBe('infaisable');
    }
    const st = await call(MissionState, 'GET', API.mission(id));
    expect(st.status).toBe('propositions');
  }, 60_000);

  it('fournit les géométries de couverture de chaque phase', async () => {
    for (let phase = 0; phase < input.phaseCount; phase++) {
      const layers = await call(CoverageLayers, 'GET', API.coverage(id, proposals[0].id, phase));
      expect(layers.phase).toBe(phase);
      expect(layers.covered.coordinates.length).toBeGreaterThan(0);
      expect(layers.byResource?.length).toBeGreaterThan(0);
    }
  });

  it('recalcule les métriques quand une position est déplacée à la main', async () => {
    const p = proposals[0];
    const moved = p.assignments.map((a, i) =>
      i === 0
        ? { ...a, position: { ...a.position, coordinates: [1.23, 43.66] as [number, number] } }
        : a,
    );
    const edited = await call(Proposal, 'PUT', API.proposal(id, p.id), { assignments: moved });
    expect(edited.label).toMatch(/modifiée/);
    expect(edited.metricsByPhase).toHaveLength(input.phaseCount);
  });

  it('lance la conduite et diffuse l’état par WebSocket', async () => {
    const st = await call(MissionState, 'POST', API.start(id, proposals[1].id));
    expect(st.status).toBe('conduite');
    expect(st.live?.phase).toBe(0);

    const first = new Promise<unknown>((resolve) => {
      void app.injectWS(
        API.liveWs(id),
        {},
        { onInit: (ws) => ws.once('message', (m: unknown) => resolve(JSON.parse(String(m)))) },
      );
    });
    const msg = WsMessage.parse(await first);
    expect(msg.type).toBe('live');
  });

  it('refuse de modifier la configuration pendant la conduite (409)', async () => {
    const res = await app.inject({ method: 'PUT', url: API.mission(id), payload: input });
    expect(res.statusCode).toBe(409);
  });

  it('TP indisponible → recalcul proposé → validation opérateur', async () => {
    const ev: MissionEvent = { type: 'resource_unavailable', resourceId: 'r1' };
    const live = await call(LiveState, 'POST', API.events(id), ev);
    expect(live.assignments.some((a) => a.resourceId === 'r1')).toBe(false);
    expect(live.events).toHaveLength(1);

    await call(CoverageLayers, 'GET', API.liveCoverage(id));

    const recomputed = await call(Proposal, 'POST', API.recompute(id), {});
    expect(recomputed.assignments.some((a) => a.resourceId === 'r1')).toBe(false);
    expect(recomputed.stability?.phase).toBe(0);
    expect(recomputed.stability?.summary.length).toBeGreaterThan(0);
    const accepted = await call(LiveState, 'POST', API.acceptRecompute(id), {
      proposalId: recomputed.id,
    });
    expect(accepted.pendingRecompute).toBeUndefined();
    expect(accepted.assignments.every((a) => a.phase === 0 && a.resourceId !== 'r1')).toBe(true);
  }, 60_000);

  it('un événement survenu après le recalcul le rend périmé : pas de réengagement', async () => {
    const recomputed = await call(Proposal, 'POST', API.recompute(id), {});
    const victim = recomputed.assignments.find((a) => a.phase === 0)!.resourceId;
    const after = await call(LiveState, 'POST', API.events(id), {
      type: 'resource_unavailable',
      resourceId: victim,
    });
    expect(after.pendingRecompute).toBeUndefined();
    const res = await app.inject({
      method: 'POST',
      url: API.acceptRecompute(id),
      payload: { proposalId: recomputed.id },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/périmé/);

    // Le recalcul suivant n'engage pas le TP tombé.
    const again = await call(Proposal, 'POST', API.recompute(id), {});
    expect(again.assignments.some((a) => a.resourceId === victim)).toBe(false);
    const applied = await call(LiveState, 'POST', API.acceptRecompute(id), {
      proposalId: again.id,
    });
    expect(applied.assignments.some((a) => a.resourceId === victim)).toBe(false);
  }, 60_000);

  it('nouvelle zone prioritaire puis changement de phase', async () => {
    const zone = { ...input.priorityZones[0], id: 'z-live', phases: undefined };
    await call(LiveState, 'POST', API.events(id), { type: 'priority_zone_added', zone });
    const live = await call(LiveState, 'POST', API.events(id), { type: 'phase_changed', phase: 1 });
    expect(live.phase).toBe(1);
    expect(live.assignments.every((a) => a.phase === 1)).toBe(true);
  });

  it('rejette un événement mal formé (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: API.events(id),
      payload: { type: 'inconnu' },
    });
    expect(res.statusCode).toBe(400);
  });
});
