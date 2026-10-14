import { useEffect, useState } from 'react';
import type { CoverageLayers } from '@aeris/shared';
import { api } from '../../api/client';
import { FlyToFocus, useFocusStore } from '../../components/focus';
import { AssignmentsLayer } from '../../map/layers/AssignmentsLayer';
import { CoverageLayer } from '../../map/layers/CoverageLayer';
import { MissionLayers } from '../../map/layers/MissionLayers';
import { applyMoves, movedOriginals } from './draft';
import { useSelection } from './selection';
import { useScenarioStore } from './store';

/**
 * Couches de l'étape « Propositions » : couverture de la proposition affichée (route
 * `coverage`), positions déplaçables sans recalcul, ancienne position en pointillés.
 */
export function ScenarioLayers() {
  const { state, selected, phase, moves, pending, inPhase } = useSelection();
  const move = useScenarioStore((s) => s.move);
  const focusId = useFocusStore((s) => s.focusId);
  const [coverage, setCoverage] = useState<CoverageLayers>();
  const missionId = state?.mission.id;
  // Recharger quand la proposition change de contenu (retouche recalculée).
  const version = selected && `${selected.id}-${selected.label}-${selected.assignments.length}`;

  useEffect(() => {
    setCoverage(undefined);
    if (!missionId || !selected) return;
    let cancelled = false;
    api
      .coverage(missionId, selected.id, phase)
      .then((c) => !cancelled && setCoverage(c))
      .catch(() => undefined); // la carte reste utilisable sans couverture
    return () => {
      cancelled = true;
    };
  }, [missionId, version, phase]);

  if (!state) return null;
  const shown = applyMoves(inPhase, moves);
  const focused = shown.find((a) => a.resourceId === focusId);

  return (
    <>
      <MissionLayers mission={state.mission} phase={phase} />
      {/* Couverture masquée tant que des déplacements ne sont pas recalculés : elle serait fausse. */}
      {coverage && pending === 0 && <CoverageLayer layers={coverage} />}
      {selected && (
        <>
          <AssignmentsLayer
            mission={state.mission}
            assignments={movedOriginals(inPhase, moves)}
            ghost
          />
          <AssignmentsLayer
            mission={state.mission}
            assignments={shown}
            focusedId={focusId}
            onMove={(resourceId, lngLat) => move(selected.id, resourceId, phase, lngLat)}
          />
        </>
      )}
      <FlyToFocus position={focused?.position.coordinates} />
    </>
  );
}
