import type { LiveState, MissionState } from '@aeris/shared';
import { localBackend } from './backends/local';
import { redisBackend } from './backends/redis';

export interface StoredMission {
  state: MissionState;
  /** Incrémentée à chaque écriture : sert à détecter une écriture concurrente. */
  version: number;
}

/** Stockage de l'état : chaque lecture rend une copie, rien n'est partagé par référence. */
export interface Backend {
  getMission(id: string): Promise<StoredMission | undefined>;
  listMissions(): Promise<MissionState[]>;
  /** Écrit la mission si sa version stockée vaut toujours `version` (0 : création). */
  putMission(state: MissionState, version: number): Promise<boolean>;
  publishLive(missionId: string, live: LiveState): Promise<void>;
  /** Renvoie la fonction de désabonnement. */
  subscribeLive(missionId: string, cb: (live: LiveState) => void): Promise<() => Promise<void>>;
  /** Drones ajoutés au catalogue, non validés. */
  loadCustomDrones(): Promise<unknown>;
  /** Ajoute un drone ; `false` si son identifiant est déjà pris. */
  addCustomDrone(drone: unknown & { id: string }): Promise<boolean>;
}

const redisUrl = process.env.REDIS_URL ?? process.env.KV_URL;
/** Redis dès qu'il est configuré (Vercel : état partagé entre instances), sinon mémoire + fichier. */
export const backend: Backend = redisUrl ? redisBackend(redisUrl) : localBackend();
export const isSharedBackend = redisUrl !== undefined;

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getOr404(id: string): Promise<MissionState> {
  const stored = await backend.getMission(id);
  if (!stored) throw new HttpError(404, 'Mission inconnue');
  return stored.state;
}

export async function createMission(state: MissionState): Promise<void> {
  if (!(await backend.putMission(state, 0))) throw new HttpError(409, 'Mission déjà existante');
}

/**
 * Applique `mutate` à l'état le plus récent puis l'enregistre ; si une autre requête a écrit
 * entre-temps, recommence sur son état. `mutate` peut donc être rejouée : elle ne modifie que
 * `st` et reste courte (les calculs longs se font avant, sur une copie).
 */
export async function updateMission<T>(id: string, mutate: (st: MissionState) => T): Promise<T> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const stored = await backend.getMission(id);
    if (!stored) throw new HttpError(404, 'Mission inconnue');
    const result = mutate(stored.state);
    if (await backend.putMission(stored.state, stored.version)) return result;
  }
  throw new HttpError(503, 'Mission modifiée en continu, réessayez');
}

export const listMissions = () => backend.listMissions();
export const publishLive = (missionId: string, live: LiveState) =>
  backend.publishLive(missionId, live);
export const onLive = (missionId: string, cb: (live: LiveState) => void) =>
  backend.subscribeLive(missionId, cb);
