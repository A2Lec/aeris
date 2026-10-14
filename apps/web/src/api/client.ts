import {
  API,
  type Assignment,
  type Catalog,
  type CoverageLayers,
  type LiveState,
  type MissionEvent,
  type MissionInput,
  type MissionState,
  type MissionStatus,
  type NewDroneModel,
  type Proposal,
  type Strategy,
  type Weather,
} from '@aeris/shared';
import { mockApi } from './mock';

async function http<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `Erreur ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Client typé de l'API : une méthode par route (voir API dans @aeris/shared). */
const httpApi = {
  catalog: () => http<Catalog>('GET', API.catalog),
  addDrone: (drone: NewDroneModel) =>
    http<Catalog['drones'][number]>('POST', API.catalogDrones, drone),
  demoMission: () => http<MissionInput>('GET', API.demoMission),
  createMission: (input: MissionInput) => http<MissionState>('POST', API.missions, input),
  getMission: (id: string) => http<MissionState>('GET', API.mission(id)),
  updateMission: (id: string, input: MissionInput) =>
    http<MissionState>('PUT', API.mission(id), input),
  setStatus: (id: string, status: MissionStatus) =>
    http<MissionState>('PUT', API.status(id), { status }),
  solve: (id: string, strategies?: Strategy[], useWeather = true) =>
    http<Proposal[]>('POST', API.solve(id), { strategies, useWeather }),
  editProposal: (id: string, pid: string, assignments: Assignment[]) =>
    http<Proposal>('PUT', API.proposal(id, pid), { assignments }),
  deleteProposal: (id: string, pid: string) => http<MissionState>('DELETE', API.proposal(id, pid)),
  start: (id: string, pid: string) => http<MissionState>('POST', API.start(id, pid)),
  coverage: (id: string, pid: string, phase: number) =>
    http<CoverageLayers>('GET', API.coverage(id, pid, phase)),
  liveCoverage: (id: string) => http<CoverageLayers>('GET', API.liveCoverage(id)),
  sendEvent: (id: string, event: MissionEvent) => http<LiveState>('POST', API.events(id), event),
  recompute: (id: string) => http<Proposal>('POST', API.recompute(id), {}),
  acceptRecompute: (id: string, proposalId: string) =>
    http<LiveState>('POST', API.acceptRecompute(id), { proposalId }),
  rejectRecompute: (id: string) => http<LiveState>('POST', API.rejectRecompute(id), {}),
  /** Météo réelle (Open-Meteo via l'API, avec cache et repli hors ligne). */
  weather: (lat: number, lng: number) => http<Weather>('GET', API.weather(lat, lng)),
};

export type Api = typeof httpApi;

/** `pnpm dev:mock` (VITE_MOCK=1) : faux backend en mémoire, voir mock.ts. */
export const isMock = import.meta.env.VITE_MOCK === '1';

export const api: Api = isMock ? mockApi : httpApi;

export function liveSocketUrl(missionId: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}${API.liveWs(missionId)}`;
}
