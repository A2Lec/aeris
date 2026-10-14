/**
 * Couverture zone par zone : pour chaque zone prioritaire active dans la phase, la part de ses
 * cellules couvertes et servies (au moins un drone ayant les capacités requises), au pire
 * moment de la phase. Plus parlant pour un commandant qu'un taux global : « Lisière nord :
 * 92 % servie ». Une cellule appartient à une zone si son centre y tombe (même règle que la grille).
 */
import { booleanPointInPolygon } from '@turf/turf';
import type { Assignment, Grid, MetricsOptions, Mission, ZoneCoverage } from '@aeris/shared';
import { zoneActive } from './grid';
import { presenceAuPireMoment } from './presence';
import { indexerGrille } from './voisinage';

// TODO(P1) : ajouter `byZone` (tableau de CouvertureZone) à Metrics.

export type CouvertureZone = ZoneCoverage;

export function couvertureParZone(
  mission: Mission,
  grid: Grid,
  assignments: Assignment[],
  opts: MetricsOptions = {},
): CouvertureZone[] {
  const index = indexerGrille(grid);
  const couverts = presenceAuPireMoment(grid, index, assignments);
  const servis = presenceAuPireMoment(
    grid,
    index,
    assignments,
    (a, cell) => !opts.canServe || opts.canServe(a.resourceId, cell),
  );
  return mission.priorityZones
    .filter((z) => zoneActive(z, grid.phase))
    .map((z) => {
      let cells = 0;
      let couvertes = 0;
      let servies = 0;
      for (const cell of grid.cells) {
        if (cell.forbidden || !booleanPointInPolygon(cell.center, z.geometry)) continue;
        cells++;
        if (couverts[cell.id] > 0) couvertes++;
        if (servis[cell.id] > 0) servies++;
      }
      return {
        zoneId: z.id,
        name: z.name,
        level: z.level,
        cells,
        areaM2: cells * grid.cellAreaM2,
        coverage: cells ? couvertes / cells : 0,
        served: cells ? servies / cells : 0,
      };
    });
}
