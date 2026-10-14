import { useEffect } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import { PolygonGeom } from '@aeris/shared';
import { useMissionStore } from '../../app/missionStore';
import { useConfigEditorStore } from '../../features/config/store';
import { WORK_AREA_STYLE } from '../colors';

const geo = (value: unknown) => value as GeoJsonObject;

export function MissionSetupLayer() {
  const map = useMap();
  const drawMode = useConfigEditorStore((store) => store.drawMode);
  const workArea = useConfigEditorStore((store) => store.setupWorkArea);
  const setDrawMode = useConfigEditorStore((store) => store.setDrawMode);
  const setWorkArea = useConfigEditorStore((store) => store.setSetupWorkArea);

  useEffect(() => {
    const onCreate: L.PM.CreateEventHandler = (event) => {
      if (!(event.layer instanceof L.Polygon)) {
        map.removeLayer(event.layer);
        setDrawMode('idle');
        useMissionStore.setState({ error: 'La zone de travail doit être un polygone.' });
        return;
      }
      const result = PolygonGeom.safeParse(event.layer.toGeoJSON().geometry);
      map.removeLayer(event.layer);
      setDrawMode('idle');
      if (!result.success) {
        useConfigEditorStore.setState({ setupWorkArea: undefined });
        useMissionStore.setState({ error: 'La zone de travail doit être un polygone valide.' });
        return;
      }
      useMissionStore.setState({ error: undefined });
      setWorkArea(result.data);
      const bounds = L.geoJSON(result.data).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
    };

    map.on('pm:create', onCreate);
    map.pm.disableDraw();
    if (drawMode === 'setupWorkArea') {
      map.pm.enableDraw('Polygon', {
        allowSelfIntersection: false,
        snappable: true,
        snapDistance: 20,
      });
    }
    return () => {
      map.off('pm:create', onCreate);
      map.pm.disableDraw();
    };
  }, [drawMode, map, setDrawMode, setWorkArea]);

  useEffect(() => {
    if (!workArea) return;
    const bounds = L.geoJSON(geo(workArea)).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, workArea]);

  return workArea ? (
    <GeoJSON
      key={JSON.stringify(workArea)}
      data={geo(workArea)}
      style={{ ...WORK_AREA_STYLE, fillOpacity: 0.08 }}
    />
  ) : null;
}
