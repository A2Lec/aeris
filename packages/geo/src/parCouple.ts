/**
 * Qui couvre quoi : chaque cellule couverte est attribuée à un seul couple, son responsable,
 * le plus proche parmi ceux qui la couvrent (à égalité, le plus petit identifiant, pour que le
 * résultat ne dépende pas de l'ordre des affectations). La carte affiche une surface par
 * couple ; la stabilité compare les responsables avant et après un recalcul.
 *
 * Règle purement géographique : elle ne tient pas compte des créneaux (deux drones qui se
 * relaient au même endroit se partagent la zone selon la distance, pas selon l'heure).
 */
import type { Assignment, Grid, ResourceCoverage } from '@aeris/shared';
import { fusionner } from './coverage';
import { distanceM } from './distance';
import { indexerGrille, pourChaqueCelluleAPortee, type IndexGrille } from './voisinage';

// TODO(P1) : ajouter `byResource` (tableau de CouverturePropre, optionnel) à CoverageLayers.

/** Index (dans `assignments`) du couple responsable de chaque cellule, -1 si non couverte. */
export function responsables(
  grid: Grid,
  index: IndexGrille,
  assignments: Assignment[],
): Int32Array {
  const resp = new Int32Array(grid.cells.length).fill(-1);
  const dist = new Float64Array(grid.cells.length).fill(Infinity);
  assignments.forEach((a, i) => {
    const p = a.position.coordinates;
    pourChaqueCelluleAPortee(grid, index, p, a.radiusM, (cell) => {
      const d = distanceM(p, cell.center);
      const actuel = resp[cell.id];
      if (
        d < dist[cell.id] ||
        (d === dist[cell.id] && a.resourceId < assignments[actuel].resourceId)
      ) {
        dist[cell.id] = d;
        resp[cell.id] = i;
      }
    });
  });
  return resp;
}

/** Surface dont un couple est responsable. */
export type CouverturePropre = ResourceCoverage;

/** Une surface par couple engagé dans la phase, dans l'ordre des affectations. */
export function couchesParCouple(grid: Grid, assignments: Assignment[]): CouverturePropre[] {
  const index = indexerGrille(grid);
  const resp = responsables(grid, index, assignments);
  const cellules = new Uint32Array(assignments.length);
  for (const r of resp) if (r >= 0) cellules[r]++;
  return assignments.map((a, i) => ({
    resourceId: a.resourceId,
    geometry: fusionner(grid, index, (id) => resp[id] === i),
    areaM2: cellules[i] * grid.cellAreaM2,
  }));
}
