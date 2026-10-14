/**
 * Communes concernées : pour chaque commune qui contient au moins une cellule de la zone de
 * travail, la surface couverte (au pire moment) et la surface restée sans drone. Les contours
 * sont fournis par l'appelant (packages/data) : le moteur ne fait aucun appel réseau.
 * Une cellule appartient à la commune où tombe son centre.
 */
import { bbox, booleanPointInPolygon } from '@turf/turf';
import type { AreaGeom, Assignment, Grid } from '@aeris/shared';
import { presenceAuPireMoment } from './presence';
import { indexerGrille } from './voisinage';

// TODO(P1) : remplacer Metrics.communes (liste de noms) par CommuneConcernee[].

/** Contour d'une commune (même forme que `Commune` de @aeris/data). */
export interface ContourCommune {
  code: string;
  nom: string;
  contour: AreaGeom;
}

export interface CommuneConcernee {
  /** Code INSEE. */
  code: string;
  nom: string;
  /** Surface de la commune dans la zone de travail, hors zones interdites. */
  areaM2: number;
  coveredAreaM2: number;
  uncoveredAreaM2: number;
}

/** Communes touchées par la zone de travail, de la plus couverte à la moins couverte. */
export function communesConcernees(
  grid: Grid,
  assignments: Assignment[],
  communes: ContourCommune[],
): CommuneConcernee[] {
  const couverts = presenceAuPireMoment(grid, indexerGrille(grid), assignments);
  const resultat: CommuneConcernee[] = [];
  for (const c of communes) {
    const [o, s, e, n] = bbox(c.contour);
    let cellules = 0;
    let couvertes = 0;
    for (const cell of grid.cells) {
      const [lng, lat] = cell.center;
      if (cell.forbidden || lng < o || lng > e || lat < s || lat > n) continue;
      if (!booleanPointInPolygon(cell.center, c.contour)) continue;
      cellules++;
      if (couverts[cell.id] > 0) couvertes++;
    }
    if (!cellules) continue;
    resultat.push({
      code: c.code,
      nom: c.nom,
      areaM2: cellules * grid.cellAreaM2,
      coveredAreaM2: couvertes * grid.cellAreaM2,
      uncoveredAreaM2: (cellules - couvertes) * grid.cellAreaM2,
    });
  }
  return resultat.sort((a, b) => b.coveredAreaM2 - a.coveredAreaM2 || a.code.localeCompare(b.code));
}
