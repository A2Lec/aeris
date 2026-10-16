/**
 * Faux backend en mémoire pour travailler le front sans API (`pnpm dev:mock`).
 * Les réponses viennent de mocks/snapshot.json, capturé sur la vraie API (`pnpm mocks`)
 * et validé par les schémas de @aeris/shared (mocks.test.ts).
 * Le comportement est volontairement simpliste : seules les formes de données font foi.
 */
import type {
  CoverageLayers,
  LiveState,
  MissionInput,
  MissionState,
  NewDroneModel,
  Proposal,
} from '@aeris/shared';
import snapshot from './mocks/snapshot.json';
import type { Api } from './client';

const snap = snapshot as unknown as {
  catalog: Awaited<ReturnType<Api['catalog']>>;
  demoMission: MissionInput;
  created: MissionState;
  proposals: Proposal[];
  coverage: CoverageLayers;
  started: MissionState;
  recompute: Proposal;
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const delay = <T>(v: T): Promise<T> => new Promise((r) => setTimeout(() => r(clone(v)), 150));

let state: MissionState = clone(snap.created);
let catalog = clone(snap.catalog);
const listeners = new Set<(live: LiveState) => void>();

function mockDroneId(name: string): string {
  const base =
    name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'drone';
  let id = base;
  for (let suffix = 2; catalog.drones.some((drone) => drone.id === id); suffix++)
    id = `${base}-${suffix}`;
  return id;
}

function liveOrThrow(): LiveState {
  if (state.status !== 'conduite' || !state.live) throw new Error('Aucune opération en cours');
  return state.live;
}

function publish(): void {
  if (state.live) for (const cb of listeners) cb(clone(state.live));
}

/** Remplace le flux temps réel (SSE) en mode mock. Renvoie la fonction de désabonnement. */
export function subscribeMockLive(cb: (live: LiveState) => void): () => void {
  listeners.add(cb);
  if (state.live) cb(clone(state.live));
  return () => listeners.delete(cb);
}

export const mockApi: Api = {
  catalog: () => delay(catalog),
  addDrone: (input: NewDroneModel) => {
    const drone = {
      ...clone(input),
      id: mockDroneId(input.name),
      enduranceMin: 30,
      minTempC: -10,
      maxTempC: 40,
    };
    catalog = { ...catalog, drones: [...catalog.drones, drone] };
    return delay(drone);
  },
  demoMission: () => delay(snap.demoMission),
  createMission: (input) => {
    state = {
      mission: { ...clone(input), id: crypto.randomUUID() } as MissionState['mission'],
      status: 'config',
      proposals: [],
    };
    return delay(state);
  },
  getMission: () => delay(state),
  updateMission: (_id, input) => {
    state.mission = { ...clone(input), id: state.mission.id } as MissionState['mission'];
    state.proposals = [];
    return delay(state);
  },
  setStatus: (_id, status) => {
    state.status = status;
    return delay(state);
  },
  solve: (_id, strategies) => {
    const ps = snap.proposals.filter((p) => !strategies || strategies.includes(p.strategy));
    state.proposals = [...state.proposals, ...clone(ps)];
    state.status = 'propositions';
    return delay(ps);
  },
  editProposal: (_id, pid, assignments) => {
    const p = state.proposals.find((x) => x.id === pid);
    if (!p) return Promise.reject(new Error('Proposition inconnue'));
    p.assignments = assignments;
    if (!p.label.endsWith('(modifiée)')) p.label += ' (modifiée)';
    return delay(p);
  },
  deleteProposal: (_id, pid) => {
    state.proposals = state.proposals.filter((p) => p.id !== pid);
    return delay(state);
  },
  coverage: (_id, _pid, phase) => delay({ ...snap.coverage, phase }),
  liveCoverage: () => delay({ ...snap.coverage, phase: state.live?.phase ?? 0 }),
  start: (_id, pid) => {
    const p = state.proposals.find((x) => x.id === pid) ?? snap.proposals[0];
    state.status = 'conduite';
    state.selectedProposalId = p.id;
    state.live = {
      ...clone(snap.started.live!),
      proposalId: p.id,
      assignments: p.assignments.filter((a) => a.phase === 0),
    };
    publish();
    return delay(state);
  },
  sendEvent: (_id, event) => {
    const live = liveOrThrow();
    if (event.type === 'resource_unavailable')
      live.assignments = live.assignments.filter((a) => a.resourceId !== event.resourceId);
    if (event.type === 'resource_moved')
      live.assignments = live.assignments.map((a) =>
        a.resourceId === event.resourceId ? { ...a, position: event.position } : a,
      );
    if (event.type === 'weather_update') live.weather = event.weather;
    if (event.type === 'priority_zone_added')
      state.mission.priorityZones = [...state.mission.priorityZones, event.zone];
    if (event.type === 'phase_changed') {
      live.phase = Math.min(event.phase, state.mission.phaseCount - 1);
      const p = state.proposals.find((x) => x.id === live.proposalId);
      live.assignments = (p?.assignments ?? []).filter((a) => a.phase === live.phase);
    }
    live.events.push({ at: new Date().toISOString(), event });
    live.pendingRecompute = undefined; // comme l'API : un événement périme le recalcul
    publish();
    return delay(live);
  },
  recompute: () => {
    const live = liveOrThrow();
    live.pendingRecompute = clone(snap.recompute);
    publish();
    return delay(live.pendingRecompute);
  },
  acceptRecompute: (_id, proposalId) => {
    const live = liveOrThrow();
    if (live.pendingRecompute?.id !== proposalId)
      return Promise.reject(
        new Error('Recalcul périmé : la situation a changé, relancez le calcul'),
      );
    live.assignments = live.pendingRecompute.assignments.filter((a) => a.phase === live.phase);
    live.pendingRecompute = undefined;
    publish();
    return delay(live);
  },
  rejectRecompute: () => {
    const live = liveOrThrow();
    live.pendingRecompute = undefined;
    publish();
    return delay(live);
  },
  // Pas de réseau en mock : météo calme marquée comme valeur par défaut.
  weather: () =>
    delay({
      windMs: 3.5,
      gustMs: 6,
      precipitationMm: 0,
      temperatureC: 18,
      isDay: true,
      fetchedAt: new Date().toISOString(),
      source: 'repli' as const,
    }),
};
