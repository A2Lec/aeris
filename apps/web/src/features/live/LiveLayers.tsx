import { useEffect, useState } from 'react';
import { useMapEvents } from 'react-leaflet';
import type { CoverageLayers } from '@aeris/shared';
import { api } from '../../api/client';
import { useMissionStore } from '../../app/missionStore';
import { FlyToFocus, useFocusStore } from '../../components/focus';
import { AssignmentsLayer } from '../../map/layers/AssignmentsLayer';
import { CoverageLayer } from '../../map/layers/CoverageLayer';
import { MissionLayers } from '../../map/layers/MissionLayers';
import { useLiveStore } from './store';
import { liveZone } from './zone';

/** En mode « nouvelle zone », un clic sur la carte pose la zone et l'envoie à l'API. */
function PlaceZoneOnClick() {
  const { state, run, refresh } = useMissionStore();
  const { zoneLevel, setZoneLevel } = useLiveStore();
  const map = useMapEvents({
    click: (e) => {
      if (!zoneLevel || !state) return;
      const zone = liveZone(
        [e.latlng.lng, e.latlng.lat],
        zoneLevel,
        state.mission.priorityZones.length + 1,
      );
      setZoneLevel(undefined);
      void run(async () => {
        await api.sendEvent(state.mission.id, { type: 'priority_zone_added', zone });
        await refresh();
      });
    },
  });
  useEffect(() => {
    map.getContainer().style.cursor = zoneLevel ? 'crosshair' : '';
  }, [map, zoneLevel]);
  return null;
}

/**
 * Couches de la conduite : couverture réelle (route `live/coverage`), positions courantes
 * (glisser = événement resource_moved), recalcul proposé en pointillés.
 */
export function LiveLayers() {
  const { state, run } = useMissionStore();
  const { live } = useLiveStore();
  const focusId = useFocusStore((s) => s.focusId);
  const [coverage, setCoverage] = useState<CoverageLayers>();
  const missionId = state?.mission.id;
  // Recharger la couverture quand les positions, la phase ou les zones changent.
  const version =
    live &&
    `${live.phase}-${JSON.stringify(live.assignments.map((a) => a.position.coordinates))}-${state?.mission.priorityZones.length}`;

  useEffect(() => {
    if (!missionId || !version) return;
    let cancelled = false;
    api
      .liveCoverage(missionId)
      .then((c) => !cancelled && setCoverage(c))
      .catch(() => undefined); // la carte reste utilisable sans couverture
    return () => {
      cancelled = true;
    };
  }, [missionId, version]);

  if (!state || !live) return null;
  const { mission } = state;
  const focused = live.assignments.find((a) => a.resourceId === focusId);

  return (
    <>
      <MissionLayers mission={mission} phase={live.phase} />
      {coverage && <CoverageLayer layers={coverage} />}
      <AssignmentsLayer
        mission={mission}
        assignments={live.assignments}
        focusedId={focusId}
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
      <PlaceZoneOnClick />
      <FlyToFocus position={focused?.position.coordinates} />
    </>
  );
}
