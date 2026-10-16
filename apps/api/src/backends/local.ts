import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LiveState } from '@aeris/shared';
import type { Backend, StoredMission } from '../store';

/** Missions en mémoire (un seul processus : `pnpm dev`, tests), catalogue dans un fichier JSON. */
export function localBackend(): Backend {
  const missions = new Map<string, StoredMission>();
  const bus = new EventEmitter();
  bus.setMaxListeners(50);

  const catalogPath = () =>
    process.env.AERIS_DRONE_CATALOG_PATH ??
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'drone-catalog.json');

  const loadCustomDrones = async (): Promise<unknown> => {
    try {
      return JSON.parse(await readFile(catalogPath(), 'utf8')) as unknown;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
  };

  return {
    async getMission(id) {
      const stored = missions.get(id);
      return stored && structuredClone(stored);
    },
    async listMissions() {
      return [...missions.values()].map((stored) => structuredClone(stored.state));
    },
    async putMission(state, version) {
      const id = state.mission.id;
      if ((missions.get(id)?.version ?? 0) !== version) return false;
      missions.set(id, { state: structuredClone(state), version: version + 1 });
      return true;
    },
    async publishLive(missionId, live) {
      bus.emit(`live:${missionId}`, structuredClone(live));
    },
    async subscribeLive(missionId, cb: (live: LiveState) => void) {
      bus.on(`live:${missionId}`, cb);
      return async () => void bus.off(`live:${missionId}`, cb);
    },
    loadCustomDrones,
    async addCustomDrone(drone) {
      const saved = await loadCustomDrones();
      const current = Array.isArray(saved) ? saved : [];
      if (current.some((d: { id?: unknown }) => d.id === drone.id)) return false;
      const path = catalogPath();
      const temporaryPath = `${path}.${randomUUID()}.tmp`;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(temporaryPath, JSON.stringify([...current, drone], null, 2), 'utf8');
      await rename(temporaryPath, path);
      return true;
    },
  };
}
