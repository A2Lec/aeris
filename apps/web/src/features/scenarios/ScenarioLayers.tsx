import { useMissionStore } from '../../app/missionStore';
import { AssignmentsLayer } from '../../map/layers/AssignmentsLayer';
import { MissionLayers } from '../../map/layers/MissionLayers';
import { api } from '../../api/client';
import { useScenarioStore } from './store';

/** Couches de l'étape « Propositions » : positions déplaçables (recalcul des métriques). */
export function ScenarioLayers() {
  const { state, setState, run } = useMissionStore();
  const { selectedId, phase } = useScenarioStore();
  if (!state) return null;
  const selected = state.proposals.find((p) => p.id === selectedId) ?? state.proposals[0];

  const onMove = (resourceId: string, lngLat: [number, number]) =>
    selected &&
    run(async () => {
      const assignments = selected.assignments.map((a) =>
        a.resourceId === resourceId && a.phase === phase
          ? { ...a, position: { type: 'Point' as const, coordinates: lngLat } }
          : a,
      );
      await api.editProposal(state.mission.id, selected.id, assignments);
      setState(await api.getMission(state.mission.id));
    });

  return (
    <>
      <MissionLayers mission={state.mission} phase={phase} />
      {selected && (
        <AssignmentsLayer
          mission={state.mission}
          assignments={selected.assignments.filter((a) => a.phase === phase)}
          onMove={onMove}
        />
      )}
    </>
  );
}
