/**
 * Voisinage d'un drone dans la grille : au lieu de tester toutes les cellules, on ne parcourt
 * que le rectangle (lignes × colonnes) qui contient son disque de portée, puis on applique le
 * même test de distance qu'avant. Le résultat est identique au parcours complet, en beaucoup
 * moins de calculs (un TP1 de 1 km sur une grille de 100 m : ~400 cellules testées au lieu de
 * toute la zone).
 */
import type { Cell, Grid } from '@aeris/shared';
import { M_PER_DEG_LAT, distanceM, metersPerDegLng } from './distance';

/** Position de la grille dans l'espace : retrouvée à partir des cellules, la grille ne la porte pas. */
export interface IndexGrille {
  /** id de la cellule en (ligne, colonne), -1 hors zone de travail. Indice : row * cols + col. */
  ids: Int32Array;
  /** Coin sud-ouest de la cellule (0, 0). */
  lng0: number;
  lat0: number;
  /** Pas de la grille en degrés. */
  pasLng: number;
  pasLat: number;
}

export function indexerGrille(grid: Grid): IndexGrille {
  const ids = new Int32Array(grid.rows * grid.cols).fill(-1);
  for (const c of grid.cells) ids[c.row * grid.cols + c.col] = c.id;

  const [premiere] = grid.cells;
  if (!premiere) return { ids, lng0: 0, lat0: 0, pasLng: 1, pasLat: 1 };

  // Pas exacts quand deux cellules diffèrent de colonne (resp. de ligne) ; sinon on recalcule
  // comme buildGrid. Le second cas ne concerne qu'une grille d'une seule colonne (resp. ligne).
  const autreCol = grid.cells.find((c) => c.col !== premiere.col);
  const autreLigne = grid.cells.find((c) => c.row !== premiere.row);
  const latMoy = grid.cells.reduce((s, c) => s + c.center[1], 0) / grid.cells.length;
  const pasLng = autreCol
    ? (autreCol.center[0] - premiere.center[0]) / (autreCol.col - premiere.col)
    : grid.cellSizeM / metersPerDegLng(latMoy);
  const pasLat = autreLigne
    ? (autreLigne.center[1] - premiere.center[1]) / (autreLigne.row - premiere.row)
    : grid.cellSizeM / M_PER_DEG_LAT;

  return {
    ids,
    lng0: premiere.center[0] - (premiere.col + 0.5) * pasLng,
    lat0: premiere.center[1] - (premiere.row + 0.5) * pasLat,
    pasLng,
    pasLat,
  };
}

const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Appelle `visiter` pour chaque cellule non interdite dont le centre est à moins de `rayonM`
 * de `centre` (même règle que le parcours complet : distanceM ≤ rayon).
 */
export function pourChaqueCelluleAPortee(
  grid: Grid,
  index: IndexGrille,
  centre: [number, number],
  rayonM: number,
  visiter: (cell: Cell) => void,
): void {
  if (grid.cells.length === 0) return;
  const [lng, lat] = centre;
  const dLat = rayonM / M_PER_DEG_LAT;
  // Largeur en longitude prise à la latitude la plus éloignée de l'équateur du disque :
  // c'est là qu'un mètre vaut le plus de degrés, donc le rectangle contient tout le disque.
  const latExtreme = Math.min(89.9, Math.max(Math.abs(lat - dLat), Math.abs(lat + dLat)));
  const dLng = rayonM / metersPerDegLng(latExtreme);

  // Une cellule de marge de chaque côté absorbe les arrondis.
  const ligneMin = borner(
    Math.floor((lat - dLat - index.lat0) / index.pasLat) - 1,
    0,
    grid.rows - 1,
  );
  const ligneMax = borner(
    Math.floor((lat + dLat - index.lat0) / index.pasLat) + 1,
    0,
    grid.rows - 1,
  );
  const colMin = borner(Math.floor((lng - dLng - index.lng0) / index.pasLng) - 1, 0, grid.cols - 1);
  const colMax = borner(Math.floor((lng + dLng - index.lng0) / index.pasLng) + 1, 0, grid.cols - 1);

  for (let row = ligneMin; row <= ligneMax; row++) {
    for (let col = colMin; col <= colMax; col++) {
      const id = index.ids[row * grid.cols + col];
      if (id < 0) continue;
      const cell = grid.cells[id];
      if (!cell.forbidden && distanceM(centre, cell.center) <= rayonM) visiter(cell);
    }
  }
}
