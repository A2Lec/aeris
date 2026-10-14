import type {
  CoverageGeometryBuilder,
  CoverageLayers,
  Grid,
  LngLat,
  MultiPolygonGeom,
} from '@aeris/shared';
import { coverageCounts } from './metrics';
import { presenceAuPireMoment } from './presence';
import { indexerGrille, type IndexGrille } from './voisinage';

/** Rectangle de cellules, bornes incluses. */
interface Bloc {
  ligne0: number;
  ligne1: number;
  col0: number;
  col1: number;
}

/**
 * Regroupe les cellules retenues en rectangles : d'abord les suites de cellules voisines sur
 * une même ligne, puis on prolonge vers le nord un rectangle dont la ligne suivante a
 * exactement les mêmes colonnes. Exact au pas de la grille, et quelques centaines de
 * polygones au lieu d'un carré par cellule. (Pas de turf.union : lent sur des milliers de
 * carrés et fragile sur les coins qui se touchent.)
 */
export function fusionner(
  grid: Grid,
  index: IndexGrille,
  retenue: (id: number) => boolean,
): MultiPolygonGeom {
  const finis: Bloc[] = [];
  let ouverts = new Map<string, Bloc>();

  for (let ligne = 0; ligne < grid.rows; ligne++) {
    const suivants = new Map<string, Bloc>();
    let debut = -1;
    for (let col = 0; col <= grid.cols; col++) {
      const id = col < grid.cols ? index.ids[ligne * grid.cols + col] : -1;
      const dedans = id >= 0 && retenue(id);
      if (dedans && debut < 0) debut = col;
      if (!dedans && debut >= 0) {
        const cle = `${debut}:${col - 1}`;
        const bloc = ouverts.get(cle);
        if (bloc) {
          bloc.ligne1 = ligne;
          ouverts.delete(cle);
          suivants.set(cle, bloc);
        } else {
          suivants.set(cle, { ligne0: ligne, ligne1: ligne, col0: debut, col1: col - 1 });
        }
        debut = -1;
      }
    }
    finis.push(...ouverts.values());
    ouverts = suivants;
  }
  finis.push(...ouverts.values());

  return { type: 'MultiPolygon', coordinates: finis.map((b) => [anneau(index, b)]) };
}

/** Anneau fermé du rectangle, sens trigonométrique. */
function anneau(index: IndexGrille, b: Bloc): LngLat[] {
  const ouest = index.lng0 + b.col0 * index.pasLng;
  const est = index.lng0 + (b.col1 + 1) * index.pasLng;
  const sud = index.lat0 + b.ligne0 * index.pasLat;
  const nord = index.lat0 + (b.ligne1 + 1) * index.pasLat;
  return [
    [ouest, sud],
    [est, sud],
    [est, nord],
    [ouest, nord],
    [ouest, sud],
  ];
}

export const coverageGeometry: CoverageGeometryBuilder = (grid, assignments, opts = {}) => {
  const index = indexerGrille(grid);
  const counts = coverageCounts(grid, assignments, index);
  const couvrable = (id: number) => !grid.cells[id].forbidden;
  const layers: CoverageLayers = {
    phase: grid.phase,
    covered: fusionner(grid, index, (id) => couvrable(id) && counts[id] > 0),
    gaps: fusionner(grid, index, (id) => couvrable(id) && counts[id] === 0),
    overlap: fusionner(grid, index, (id) => couvrable(id) && counts[id] > 1),
  };
  // Couches de redondance seulement si une zone en demande : la carte reste légère sinon.
  if (!grid.cells.some((c) => c.redundancy >= 2)) return layers;
  const capables = presenceAuPireMoment(
    grid,
    index,
    assignments,
    (a, cell) => !opts.canServe || opts.canServe(a.resourceId, cell),
  );
  const r = (id: number) => grid.cells[id].redundancy;
  layers.redundancyMissing = fusionner(
    grid,
    index,
    (id) => couvrable(id) && r(id) >= 2 && capables[id] < r(id),
  );
  layers.superfluousOverlap = fusionner(grid, index, (id) => couvrable(id) && counts[id] > r(id));
  return layers;
};
