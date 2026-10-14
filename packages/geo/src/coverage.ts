import type { CoverageGeometryBuilder, Grid, LngLat, MultiPolygonGeom } from '@aeris/shared';
import { M_PER_DEG_LAT, metersPerDegLng } from './distance';
import { coverageCounts } from './metrics';

/** Carré de la cellule (anneau fermé, sens trigonométrique). */
function cellSquare(grid: Grid, center: [number, number]): LngLat[][] {
  const [lng, lat] = center;
  const hx = grid.cellSizeM / 2 / metersPerDegLng(lat);
  const hy = grid.cellSizeM / 2 / M_PER_DEG_LAT;
  return [
    [
      [lng - hx, lat - hy],
      [lng + hx, lat - hy],
      [lng + hx, lat + hy],
      [lng - hx, lat + hy],
      [lng - hx, lat - hy],
    ],
  ];
}

/**
 * v0 : un carré par cellule (exact au pas de la grille, cohérent avec computeMetrics).
 * TODO(P3) : fusionner les carrés (turf.union / dissolve) pour alléger la carte.
 */
export const coverageGeometry: CoverageGeometryBuilder = (grid, assignments) => {
  const counts = coverageCounts(grid, assignments);
  const covered: MultiPolygonGeom = { type: 'MultiPolygon', coordinates: [] };
  const gaps: MultiPolygonGeom = { type: 'MultiPolygon', coordinates: [] };
  const overlap: MultiPolygonGeom = { type: 'MultiPolygon', coordinates: [] };
  for (const cell of grid.cells) {
    if (cell.forbidden) continue;
    const square = cellSquare(grid, cell.center);
    const n = counts[cell.id];
    (n > 0 ? covered : gaps).coordinates.push(square);
    if (n > 1) overlap.coordinates.push(square);
  }
  return { phase: grid.phase, covered, gaps, overlap };
};
