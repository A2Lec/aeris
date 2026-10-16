/**
 * Test d'intégration de bout en bout : le scénario de démo complet, avec chaque réponse
 * validée par les schémas de @aeris/shared. S'il passe, `main` démarre et le front
 * reçoit exactement ce que les contrats annoncent.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  API,
  Catalog,
  CoverageLayers,
  DroneModel,
  LiveState,
  MissionInput,
  MissionState,
  Proposal,
  LiveMessage,
  type MissionEvent,
} from '@aeris/shared';
import { buildApp } from './app';
import { initializeDroneCatalog } from './catalogStore';

type App = Awaited<ReturnType<typeof buildApp>>;
/** Le vrai fetch, avant que les tests ne coupent le réseau. */
const nodeFetch = globalThis.fetch;

/** Ouvre un flux SSE et le lit message par message (champ data, en JSON). */
async function openStream(url: string) {
  const abort = new AbortController();
  const res = await nodeFetch(url, { signal: abort.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    contentType: res.headers.get('content-type'),
    async next(): Promise<unknown> {
      for (;;) {
        const end = buffer.indexOf('\n\n');
        if (end >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = block
            .split('\n')
            .filter((line) => line.startsWith('data: '))
            .map((line) => line.slice(6))
            .join('\n');
          if (data) return JSON.parse(data);
          continue;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error('Flux terminé');
        buffer += decoder.decode(value, { stream: true });
      }
    },
    close: () => abort.abort(),
  };
}
let app: App;
let catalogDir = '';
let previousCatalogPath: string | undefined;

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
  previousCatalogPath = process.env.AERIS_DRONE_CATALOG_PATH;
  catalogDir = await mkdtemp(join(tmpdir(), 'aeris-catalog-test-'));
  process.env.AERIS_DRONE_CATALOG_PATH = join(catalogDir, 'drone-catalog.json');
  // Ferme aussi les flux SSE encore ouverts à la fin des tests.
  app = await buildApp({ logger: false, forceCloseConnections: true });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  if (previousCatalogPath === undefined) delete process.env.AERIS_DRONE_CATALOG_PATH;
  else process.env.AERIS_DRONE_CATALOG_PATH = previousCatalogPath;
  await rm(catalogDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('Scénario de démo complet', () => {
  let id = '';
  let proposals: Proposal[] = [];
  let input: MissionInput;

  it('catalogue et mission de démo', async () => {
    const catalog = await call(Catalog, 'GET', API.catalog);
    expect(catalog.drones).toHaveLength(3);
    expect(catalog.drones).toMatchObject([
      {
        id: 'matrice-4t',
        enduranceMin: 49,
        maxWindMs: 12,
        rainOk: true,
        minTempC: -20,
        maxTempC: 50,
        zoomX: 112,
        thermal: true,
        night: true,
      },
      {
        id: 'mavic-3e',
        enduranceMin: 45,
        maxWindMs: 12,
        rainOk: false,
        minTempC: -10,
        maxTempC: 40,
        zoomX: 56,
        thermal: false,
        night: false,
      },
      {
        id: 'mini-5',
        enduranceMin: 36,
        maxWindMs: 12,
        rainOk: false,
        minTempC: -10,
        maxTempC: 40,
        zoomX: 4,
        thermal: false,
        night: false,
      },
    ]);
    input = await call(MissionInput, 'GET', API.demoMission);
  });

  it('ajoute un drone et le conserve après le rechargement du catalogue', async () => {
    const added = await call(
      DroneModel,
      'POST',
      API.catalogDrones,
      {
        name: 'Drone de test',
        maxWindMs: 9,
        rainOk: false,
        zoomX: 12,
        thermal: true,
        night: true,
      },
      201,
    );
    expect(added.id).toBe('drone-de-test');
    expect(added).toMatchObject({ enduranceMin: 30, minTempC: -10, maxTempC: 40 });

    await initializeDroneCatalog();
    const catalog = await call(Catalog, 'GET', API.catalog);
    expect(catalog.drones.find((drone) => drone.id === added.id)).toEqual(added);

    const invalid = await app.inject({
      method: 'POST',
      url: API.catalogDrones,
      payload: { name: 'Drone invalide', maxWindMs: -1 },
    });
    expect(invalid.statusCode).toBe(400);
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

  it('lance la conduite et diffuse l’état par flux SSE', async () => {
    const st = await call(MissionState, 'POST', API.start(id, proposals[1].id));
    expect(st.status).toBe('conduite');
    expect(st.live?.phase).toBe(0);

    // Un flux ne se termine pas : il faut un vrai serveur (inject attend la fin de la réponse).
    const base = await app.listen({ port: 0, host: '127.0.0.1' });
    const events = await openStream(`${base}${API.liveStream(id)}`);
    expect(events.contentType).toMatch(/^text\/event-stream/);
    const first = LiveMessage.parse(await events.next());
    expect(first.type).toBe('live');

    // Un changement d'état est poussé à l'abonné.
    await call(LiveState, 'POST', API.rejectRecompute(id), {});
    const pushed = LiveMessage.parse(await events.next());
    expect(pushed.type).toBe('live');
    events.close();

    // Mission inconnue : message d'erreur puis fin du flux, comme l'ancien WebSocket.
    const unknown = await openStream(`${base}${API.liveStream('inconnue')}`);
    expect(LiveMessage.parse(await unknown.next())).toEqual({
      type: 'error',
      message: 'Mission inconnue',
    });
    await expect(unknown.next()).rejects.toThrow('Flux terminé');
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

  it('le commandement peut rejeter un recalcul', async () => {
    await call(Proposal, 'POST', API.recompute(id), {});
    const before = await call(LiveState, 'POST', API.rejectRecompute(id), {});
    expect(before.pendingRecompute).toBeUndefined();
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

describe('Changement de phase par mauvais temps', () => {
  it('les drones interdits par la météo restent au sol', async () => {
    const input = await call(MissionInput, 'GET', API.demoMission);
    const id = (await call(MissionState, 'POST', API.missions, input, 201)).mission.id;
    const [p] = await call(z.array(Proposal), 'POST', API.solve(id), {
      strategies: ['priorite'],
      useWeather: false,
    });
    await call(MissionState, 'POST', API.start(id, p.id));
    await call(LiveState, 'POST', API.events(id), {
      type: 'weather_update',
      weather: {
        windMs: 11,
        gustMs: 14,
        precipitationMm: 0.4,
        temperatureC: 12,
        isDay: true,
        fetchedAt: new Date().toISOString(),
        source: 'manuel',
      },
    });
    const live = await call(LiveState, 'POST', API.events(id), { type: 'phase_changed', phase: 1 });
    expect(live.phase).toBe(1);
    // Rafales de 14 m/s : aucun drone du catalogue (12 m/s max) ne doit repartir.
    expect(live.assignments).toHaveLength(0);
  }, 60_000);
});

describe('Planification sans moyens', () => {
  it('le solveur dimensionne la flotte puis propose les dispositifs', async () => {
    const demo = await call(MissionInput, 'GET', API.demoMission);
    const input = { ...demo, pilots: [], resources: [], maxDrones: 6 };
    const id = (await call(MissionState, 'POST', API.missions, input, 201)).mission.id;
    const proposals = await call(z.array(Proposal), 'POST', API.solve(id), { useWeather: false });
    const st = await call(MissionState, 'GET', API.mission(id));
    // Un télépilote par drone, au plus le plafond de l'arrêté.
    expect(st.mission.resources.length).toBeGreaterThan(0);
    expect(st.mission.resources.length).toBeLessThanOrEqual(6);
    expect(st.mission.pilots).toHaveLength(st.mission.resources.length);
    for (const p of proposals) {
      expect(p.status).not.toBe('infaisable');
      expect(p.assignments.length).toBeGreaterThan(0);
      expect(p.diagnostics[0]).toMatch(/^Dimensionnement : \d+ drone/);
    }
  }, 120_000);
});
