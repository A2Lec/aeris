import { api } from '../../api/client';
import { useMissionStore } from '../../app/missionStore';
import { AssignmentsLayer } from '../../map/layers/AssignmentsLayer';
import { MissionLayers } from '../../map/layers/MissionLayers';
import { useLiveStore } from './store';

/** Positions réelles (déplaçables = événement resource_moved) + recalcul proposé en pointillés. */
export function LiveLayers() {
  const { state, run } = useMissionStore();
  const { live } = useLiveStore();
  if (!state || !live) return null;
  const { mission } = state;

  return (
    <>
      <MissionLayers mission={mission} phase={live.phase} />
      <AssignmentsLayer
        mission={mission}
        assignments={live.assignments}
        onMove={(resourceId, lngLat) =>
          run(() =>
            api.sendEvent(mission.id, {
              type: 'resource_moved',
              resourceId,
              position: { type: 'Point', coordinates: lngLat },
            }),
          )
        }
      />
      {live.pendingRecompute && (
        <AssignmentsLayer
          mission={mission}
          assignments={live.pendingRecompute.assignments.filter((a) => a.phase === live.phase)}
          ghost
        />
      )}
    </>
  );
}
