import { useEffect } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import type { Mission } from '@aeris/shared';
import { CONSTRAINT_COLORS, PRIORITY_COLORS } from '../colors';

const geo = (g: unknown) => g as GeoJsonObject;

/** Zone de travail, zones prioritaires (actives pour la phase) et zones contraintes. */
export function MissionLayers({ mission, phase }: { mission: Mission; phase?: number }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.geoJSON(geo(mission.workArea)).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
  }, [map, mission.id]);

  const zones = mission.priorityZones.filter(
    (z) => phase === undefined || !z.phases?.length || z.phases.includes(phase),
  );

  return (
    <>
      <GeoJSON
        key={`wa-${mission.id}-${JSON.stringify(mission.workArea.coordinates).length}`}
        data={geo(mission.workArea)}
        style={{ color: '#0b1f3a', weight: 3, fill: false, dashArray: '6 4' }}
      />
      {mission.constraintZones.map((c) => (
        <GeoJSON
          key={`c-${c.id}`}
          data={geo(c.geometry)}
          style={{ color: CONSTRAINT_COLORS[c.kind], weight: 1, fillOpacity: 0.25 }}
          onEachFeature={(_, layer) => layer.bindTooltip(c.name)}
        />
      ))}
      {zones.map((z) => (
        <GeoJSON
          key={`z-${z.id}-${phase ?? 'all'}`}
          data={geo(z.geometry)}
          style={{ color: PRIORITY_COLORS[z.level], weight: 2, fillOpacity: 0.3 }}
          onEachFeature={(_, layer) =>
            layer.bindTooltip(`${z.name} — priorité ${z.level}${z.action ? ` (${z.action})` : ''}`)
          }
        />
      ))}
    </>
  );
}
