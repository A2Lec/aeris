import { useMissionStore } from '../../app/missionStore';
import { useScenarioStore } from './store';

/** Proposition affichée, brouillon de déplacements et phase : partagés par les deux panneaux. */
export function useSelection() {
  const state = useMissionStore((s) => s.state);
  const { selectedId, phase, draft } = useScenarioStore();
  const proposals = state?.proposals ?? [];
  const selected = proposals.find((p) => p.id === selectedId) ?? proposals[0];
  const moves = draft && draft.proposalId === selected?.id ? draft.moves : {};
  return {
    state,
    proposals,
    selected,
    phase,
    moves,
    pending: Object.keys(moves).length,
    inPhase: selected?.assignments.filter((a) => a.phase === phase) ?? [],
  };
}
