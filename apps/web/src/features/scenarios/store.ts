import { create } from 'zustand';
import { moveKey } from './draft';

interface ScenarioStore {
  selectedId?: string;
  phase: number;
  /** Fenêtre de choix réduite : la carte passe au premier plan pour retoucher les positions. */
  minimized: boolean;
  /** Positions déplacées sur la carte, en attente de recalcul (clé : moveKey). */
  draft?: { proposalId: string; moves: Record<string, [number, number]> };
  select: (id: string) => void;
  setPhase: (phase: number) => void;
  setMinimized: (minimized: boolean) => void;
  /** Un déplacement sur une autre proposition repart d'un brouillon vide. */
  move: (proposalId: string, resourceId: string, phase: number, lngLat: [number, number]) => void;
  clearDraft: () => void;
}

export const useScenarioStore = create<ScenarioStore>((set) => ({
  phase: 0,
  minimized: false,
  select: (selectedId) => set({ selectedId }),
  setPhase: (phase) => set({ phase }),
  setMinimized: (minimized) => set({ minimized }),
  move: (proposalId, resourceId, phase, lngLat) =>
    set(({ draft }) => ({
      draft: {
        proposalId,
        moves: {
          ...(draft?.proposalId === proposalId ? draft.moves : {}),
          [moveKey(resourceId, phase)]: lngLat,
        },
      },
    })),
  clearDraft: () => set({ draft: undefined }),
}));
