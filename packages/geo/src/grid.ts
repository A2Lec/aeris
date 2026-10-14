import { bbox, booleanPointInPolygon } from '@turf/turf';
import type { Cell, GridBuilder, PriorityZone, Requirement } from '@aeris/shared';
import { M_PER_DEG_LAT, metersPerDegLng } from './distance';

export function zoneActive(zone: PriorityZone, phase: number): boolean {
  return !zone.phases || zone.phases.length === 0 || zone.phases.includes(phase);
}

function mergeRequirement(a: Requirement, b: Requirement): Requirement {
  return {
    minZoomX: Math.max(a.minZoomX ?? 0, b.minZoomX ?? 0) || undefined,
    thermal: a.thermal || b.thermal || undefined,
    night: a.night || b.night || undefined,
  };
}

/**
 * Discrétise la zone de travail en cellules carrées de mission.gridCellM mètres.
 * Une grille par phase, car les zones prioritaires actives changent selon la phase.
 */
export const buildGrid: GridBuilder = (mission, phase) => {
  const size = mission.gridCellM;
  const [minX, minY, maxX, maxY] = bbox(mission.workArea);
  const lat0 = (minY + maxY) / 2;
  const dLng = size / metersPerDegLng(lat0);
  const dLat = size / M_PER_DEG_LAT;
  const cols = Math.ceil((maxX - minX) / dLng);
  const rows = Math.ceil((maxY - minY) / dLat);
  const active = mission.priorityZones.filter((z) => zoneActive(z, phase));
  const cells: Cell[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const center: [number, number] = [minX + (col + 0.5) * dLng, minY + (row + 0.5) * dLat];
      if (!booleanPointInPolygon(center, mission.workArea)) continue;

      let priorityLevel = 0;
      let requires: Requirement = {};
      for (const z of active) {
        if (!booleanPointInPolygon(center, z.geometry)) continue;
        priorityLevel = Math.max(priorityLevel, z.level);
        requires = mergeRequirement(requires, z.requires);
      }

      let forbidden = false;
      let urban = mission.environment === 'urbain';
      let maxHeightM: number | undefined;
      for (const c of mission.constraintZones) {
        if (!booleanPointInPolygon(center, c.geometry)) continue;
        if (c.kind === 'interdite') forbidden = true;
        if (c.kind === 'urbaine') urban = true;
        if (c.kind === 'hauteur_limitee' && c.maxHeightM !== undefined) {
          maxHeightM = Math.min(maxHeightM ?? Infinity, c.maxHeightM);
        }
      }

      cells.push({
        id: cells.length,
        row,
        col,
        center,
        priorityLevel,
        requires,
        forbidden,
        urban,
        maxHeightM,
      });
    }
  }

  return { phase, cellSizeM: size, cellAreaM2: size * size, rows, cols, cells };
};
