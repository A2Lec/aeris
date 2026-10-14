import { create } from 'zustand';
import type { Catalog, MissionState } from '@aeris/shared';
import { api } from '../api/client';

/**
 * État global minimal (mission + catalogue). Chaque fonctionnalité garde son propre
 * store dans features/<nom>/store.ts pour éviter les conflits de merge.
 */
interface MissionStore {
  state?: MissionState;
  catalog?: Catalog;
  error?: string;
  busy: boolean;
  setState: (s: MissionState) => void;
  setCatalog: (catalog: Catalog) => void;
  refresh: () => Promise<void>;
  /** Exécute une action API avec gestion du chargement et des erreurs. */
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
}

export const useMissionStore = create<MissionStore>((set, get) => ({
  busy: false,
  setState: (state) => set({ state }),
  setCatalog: (catalog) => set({ catalog }),
  refresh: async () => {
    const id = get().state?.mission.id;
    if (id) set({ state: await api.getMission(id) });
  },
  run: async (fn) => {
    set({ busy: true, error: undefined });
    try {
      return await fn();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return undefined;
    } finally {
      set({ busy: false });
    }
  },
}));

void api
  .catalog()
  .then((catalog) => useMissionStore.setState({ catalog }))
  .catch(() => useMissionStore.setState({ error: 'API injoignable (lancer pnpm dev)' }));
