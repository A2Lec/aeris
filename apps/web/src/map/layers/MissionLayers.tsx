import { useEffect } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import { AreaGeom, type Mission, type MissionInput } from '@aeris/shared';
import { api } from '../../api/client';
import { useMissionStore } from '../../app/missionStore';
import { useConfigEditorStore } from '../../features/config/store';
import { CONSTRAINT_COLORS, PRIORITY_COLORS, resourceColor } from '../colors';

const geo = (g: unknown) => g as GeoJsonObject;

function areaFromLayer(layer: L.Layer) {
  if (!(layer instanceof L.Polygon)) return undefined;
  const result = AreaGeom.safeParse(layer.toGeoJSON().geometry);
  return result.success ? result.data : undefined;
}

/** Zone de travail, zones prioritaires (actives pour la phase) et zones contraintes. */
export function MissionLayers({ mission, phase }: { mission: Mission; phase?: number }) {
  const map = useMap();
  const drawMode = useConfigEditorStore((s) => s.drawMode);
  const editing = useConfigEditorStore((s) => s.editing);
  const setDrawMode = useConfigEditorStore((s) => s.setDrawMode);

  const save = (patch: Partial<MissionInput>) => {
    const { state, setState, run } = useMissionStore.getState();
    if (!state) return;
    const { id: _id, ...input } = state.mission;
    void run(async () =>
      setState(await api.updateMission(state.mission.id, { ...input, ...patch })),
    );
  };

  const editLayer = (
    type: 'workArea' | 'priority' | 'constraint' | 'resourceArea',
    layer: L.Layer,
    id?: string,
  ) => {
    if (!(layer instanceof L.Polygon)) return;
    layer.on('pm:edit', () => {
      const geometry = areaFromLayer(layer);
      if (!geometry) return;

      if (type === 'workArea' && geometry.type === 'Polygon') {
        save({ workArea: geometry });
      } else if (type === 'priority' && id) {
        save({
          priorityZones: mission.priorityZones.map((zone) =>
            zone.id === id ? { ...zone, geometry } : zone,
          ),
        });
      } else if (type === 'constraint' && id) {
        save({
          constraintZones: mission.constraintZones.map((zone) =>
            zone.id === id ? { ...zone, geometry } : zone,
          ),
        });
      } else if (type === 'resourceArea' && id) {
        save({
          resources: mission.resources.map((resource) =>
            resource.id === id ? { ...resource, allowedArea: geometry } : resource,
          ),
        });
      }
    });
    if (editing) layer.pm.enable();
    else layer.pm.disable();
  };

  useEffect(() => {
    const bounds = L.geoJSON(geo(mission.workArea)).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
  }, [map, mission.id, mission.workArea]);

  useEffect(() => {
    const onCreate: L.PM.CreateEventHandler = (event) => {
      const geometry = areaFromLayer(event.layer);
      const editor = useConfigEditorStore.getState();
      if (!geometry || editor.drawMode === 'idle' || editor.drawMode === 'setupWorkArea') {
        map.removeLayer(event.layer);
        return;
      }

      const { state, setState, run } = useMissionStore.getState();
      if (!state) return;
      const { id: _id, ...input } = state.mission;
      const name = editor.zoneName.trim();

      void run(async () => {
        let updated: MissionInput;
        if (editor.drawMode === 'workArea') {
          if (geometry.type !== 'Polygon')
            throw new Error('La zone de travail doit être un polygone simple.');
          updated = { ...input, workArea: geometry };
        } else if (editor.drawMode === 'priority') {
          updated = {
            ...input,
            priorityZones: [
              ...input.priorityZones,
              {
                id: crypto.randomUUID(),
                name: name || `Zone prioritaire ${input.priorityZones.length + 1}`,
                geometry,
                level: editor.priorityLevel,
                requires: {},
                redundancy: 1,
              },
            ],
          };
        } else if (editor.drawMode === 'constraint') {
          updated = {
            ...input,
            constraintZones: [
              ...input.constraintZones,
              {
                id: crypto.randomUUID(),
                name: name || `Contrainte ${input.constraintZones.length + 1}`,
                geometry,
                kind: editor.constraintKind,
              },
            ],
          };
        } else {
          if (!editor.resourceId || !input.resources.some((r) => r.id === editor.resourceId))
            throw new Error('Sélectionnez un couple télépilote / drone pour sa zone limite.');
          updated = {
            ...input,
            resources: input.resources.map((resource) =>
              resource.id === editor.resourceId ? { ...resource, allowedArea: geometry } : resource,
            ),
          };
        }
        setState(await api.updateMission(state.mission.id, updated));
        map.removeLayer(event.layer);
        setDrawMode('idle');
      });
    };

    map.on('pm:create', onCreate);
    map.pm.disableDraw();
    if (drawMode === 'setupWorkArea') setDrawMode('idle');
    if (
      drawMode === 'workArea' ||
      drawMode === 'priority' ||
      drawMode === 'constraint' ||
      drawMode === 'resourceArea'
    ) {
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
  }, [drawMode, map, setDrawMode]);

  const zones = mission.priorityZones.filter(
    (z) => phase === undefined || !z.phases?.length || z.phases.includes(phase),
  );

  return (
    <>
      <GeoJSON
        key={`wa-${mission.id}-${JSON.stringify(mission.workArea)}-${editing}`}
        data={geo(mission.workArea)}
        style={{ color: '#0b1f3a', weight: 3, fill: false, dashArray: '6 4' }}
        onEachFeature={(_, layer) => editLayer('workArea', layer)}
      />
      {mission.constraintZones.map((c) => (
        <GeoJSON
          key={`c-${c.id}-${JSON.stringify(c.geometry)}-${editing}`}
          data={geo(c.geometry)}
          style={{ color: CONSTRAINT_COLORS[c.kind], weight: 1, fillOpacity: 0.25 }}
          onEachFeature={(_, layer) => {
            layer.bindTooltip(c.name);
            editLayer('constraint', layer, c.id);
          }}
        />
      ))}
      {mission.resources.map(
        (resource) =>
          resource.allowedArea && (
            <GeoJSON
              key={`r-${resource.id}-${JSON.stringify(resource.allowedArea)}-${editing}`}
              data={geo(resource.allowedArea)}
              style={{
                color: resourceColor(
                  resource.id,
                  mission.resources.map((item) => item.id),
                ),
                weight: 2,
                dashArray: '4 4',
                fillOpacity: 0.08,
              }}
              onEachFeature={(_, layer) => {
                layer.bindTooltip(`Zone limite — ${resource.id}`);
                editLayer('resourceArea', layer, resource.id);
              }}
            />
          ),
      )}
      {zones.map((z) => (
        <GeoJSON
          key={`z-${z.id}-${phase ?? 'all'}-${JSON.stringify(z.geometry)}-${editing}`}
          data={geo(z.geometry)}
          style={{ color: PRIORITY_COLORS[z.level], weight: 2, fillOpacity: 0.3 }}
          onEachFeature={(_, layer) => {
            layer.bindTooltip(`${z.name} — priorité ${z.level}${z.action ? ` (${z.action})` : ''}`);
            editLayer('priority', layer, z.id);
          }}
        />
      ))}
    </>
  );
}
