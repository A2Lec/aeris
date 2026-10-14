import { EventEmitter } from 'node:events';
import type { LiveState, MissionState } from '@aeris/shared';

/** Stockage en mémoire : suffisant pour un poste unique pendant le hackathon. */
const missions = new Map<string, MissionState>();
const bus = new EventEmitter();
bus.setMaxListeners(50);

export const store = {
  get: (id: string) => missions.get(id),
  set: (state: MissionState) => void missions.set(state.mission.id, state),
  list: () => [...missions.values()],
};

export function publishLive(missionId: string, live: LiveState): void {
  bus.emit(`live:${missionId}`, live);
}

export function onLive(missionId: string, cb: (live: LiveState) => void): () => void {
  bus.on(`live:${missionId}`, cb);
  return () => bus.off(`live:${missionId}`, cb);
}

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function getOr404(id: string): MissionState {
  const st = missions.get(id);
  if (!st) throw new HttpError(404, 'Mission inconnue');
  return st;
}
