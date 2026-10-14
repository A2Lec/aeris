import { useMissionStore } from '../../app/missionStore';
import { AssignmentsLayer } from '../../map/layers/AssignmentsLayer';
import { MissionLayers } from '../../map/layers/MissionLayers';
import { applyMoves, movedOriginals } from './draft';
import { useScenarioStore } from './store';

/**
 * Couches de l'étape « Propositions ». Les positions se déplacent à la souris sans
 * recalcul : le brouillon est appliqué sur demande depuis le panneau (ScenariosPanel).
 * L'ancienne position d'un couple déplacé reste visible en pointillés.
 */
export function ScenarioLayers() {
  const { state } = useMissionStore();
  const { selectedId, phase, draft, move } = useScenarioStore();
  if (!state) return null;
  const selected = state.proposals.find((p) => p.id === selectedId) ?? state.proposals[0];
  const inPhase = selected?.assignments.filter((a) => a.phase === phase) ?? [];
  const moves = draft && draft.proposalId === selected?.id ? draft.moves : {};

  return (
    <>
      <MissionLayers mission={state.mission} phase={phase} />
      {selected && (
        <>
          <AssignmentsLayer
            mission={state.mission}
            assignments={movedOriginals(inPhase, moves)}
            ghost
          />
          <AssignmentsLayer
            mission={state.mission}
            assignments={applyMoves(inPhase, moves)}
            onMove={(resourceId, lngLat) => move(selected.id, resourceId, phase, lngLat)}
          />
        </>
      )}
    </>
  );
}
