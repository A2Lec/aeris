import { Fragment } from 'react';
import { Circle, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { Assignment, Mission } from '@aeris/shared';
import { resourceColor } from '../colors';

interface Props {
  mission: Mission;
  assignments: Assignment[];
  /** Pointillés (recalcul proposé, non validé). */
  ghost?: boolean;
  /** Si fourni, les positions sont déplaçables à la souris. */
  onMove?: (resourceId: string, lngLat: [number, number]) => void;
}

/** Un cercle de portée + un marqueur par couple drone-télépilote. */
export function AssignmentsLayer({ mission, assignments, ghost, onMove }: Props) {
  const ids = mission.resources.map((r) => r.id);
  return (
    <>
      {assignments.map((a) => {
        const res = mission.resources.find((r) => r.id === a.resourceId);
        const pilot = mission.pilots.find((p) => p.id === res?.pilotId);
        const color = resourceColor(a.resourceId, ids);
        const [lng, lat] = a.position.coordinates;
        const icon = L.divIcon({
          className: 'drone-icon',
          html: `<span style="background:${color}">${a.resourceId}</span>`,
          iconSize: [34, 20],
        });
        return (
          <Fragment key={`${ghost ? 'g' : 'a'}-${a.resourceId}-${a.phase}`}>
            <Circle
              center={[lat, lng]}
              radius={a.radiusM}
              pathOptions={{
                color,
                weight: ghost ? 2 : 1.5,
                dashArray: ghost ? '4 6' : undefined,
                fillOpacity: ghost ? 0.03 : 0.12,
              }}
            />
            {!ghost && (
              <Marker
                position={[lat, lng]}
                icon={icon}
                draggable={!!onMove}
                eventHandlers={{
                  dragend: (e) => {
                    const p = (e.target as L.Marker).getLatLng();
                    onMove?.(a.resourceId, [p.lng, p.lat]);
                  },
                }}
              >
                <Tooltip>
                  {a.resourceId} · {pilot?.name} ({pilot?.level}) · {res?.droneModelId}
                  <br />
                  Rayon {a.radiusM / 1000} km · {a.altitude.minM}–{a.altitude.maxM} m/sol
                </Tooltip>
              </Marker>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
