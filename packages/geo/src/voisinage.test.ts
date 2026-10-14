import { describe, expect, it } from 'vitest';
import { areaM2, makeAssignment } from '@aeris/contracts';
import { Mission, type Assignment, type Grid, type PolygonGeom } from '@aeris/shared';
import { coverageGeometry } from './coverage';
import { distanceM } from './distance';
import { buildGrid } from './grid';
import { coverageCounts } from './metrics';
import { indexerGrille, pourChaqueCelluleAPortee } from './voisinage';

const rect = (o: number, s: number, e: number, n: number): PolygonGeom => ({
  type: 'Polygon',
  coordinates: [
    [
      [o, s],
      [e, s],
      [e, n],
      [o, n],
      [o, s],
    ],
  ],
});

/** Missions construites ici : @aeris/data n'est pas une dépendance de @aeris/geo. */
const base = { maxDrones: 5, pilots: [], resources: [] };
const missions = [
  {
    name: 'zone de 8 × 5 km, zone interdite, 50 m',
    mission: Mission.parse({
      ...base,
      id: 'v1',
      name: 'v1',
      gridCellM: 50,
      workArea: rect(1.18, 43.62, 1.28, 43.665),
      constraintZones: [
        { id: 'i', name: 'interdite', kind: 'interdite', geometry: rect(1.2, 43.63, 1.21, 43.64) },
      ],
    }),
  },
  {
    name: 'zone en L, 100 m',
    mission: Mission.parse({
      ...base,
      id: 'v2',
      name: 'v2',
      workArea: {
        type: 'Polygon',
        coordinates: [
          [
            [1.2, 43.6],
            [1.26, 43.6],
            [1.26, 43.62],
            [1.22, 43.62],
            [1.22, 43.66],
            [1.2, 43.66],
            [1.2, 43.6],
          ],
        ],
      },
    }),
  },
  {
    name: 'bande d’une seule colonne',
    mission: Mission.parse({
      ...base,
      id: 'v3',
      name: 'v3',
      workArea: rect(1.2, 43.6, 1.2008, 43.63),
    }),
  },
];

/** Référence : parcours complet de la grille, la version d'origine. */
function comptesExhaustifs(grid: Grid, assignments: Assignment[]): Uint16Array {
  const counts = new Uint16Array(grid.cells.length);
  for (const a of assignments) {
    for (const cell of grid.cells) {
      if (!cell.forbidden && distanceM(a.position.coordinates, cell.center) <= a.radiusM)
        counts[cell.id]++;
    }
  }
  return counts;
}

/** Drones de 1 et 2 km posés sur la grille, plus un dont le disque déborde de la zone. */
function drones(grid: Grid): Assignment[] {
  const cells = grid.cells;
  const pris = [0, 0.25, 0.5, 0.75, 0.99].map((f) => cells[Math.floor(f * (cells.length - 1))]);
  const as = pris.map((c, i) => makeAssignment(`d${i}`, c.center, i % 2 ? 2000 : 1000, grid.phase));
  const [lng, lat] = cells[0].center;
  as.push(makeAssignment('bord', [lng - 0.01, lat - 0.01], 1500, grid.phase));
  return as;
}

describe('Voisinage : même résultat que le parcours complet', () => {
  for (const tm of missions) {
    it(tm.name, () => {
      const grid = buildGrid(tm.mission, 0);
      const as = drones(grid);
      expect(Array.from(coverageCounts(grid, as))).toEqual(Array.from(comptesExhaustifs(grid, as)));
    });
  }

  it('un rayon qui dépasse toute la zone visite chaque cellule non interdite une seule fois', () => {
    const grid = buildGrid(missions[0].mission, 0);
    const vues: number[] = [];
    pourChaqueCelluleAPortee(grid, indexerGrille(grid), grid.cells[0].center, 1e6, (c) =>
      vues.push(c.id),
    );
    const attendues = grid.cells.filter((c) => !c.forbidden).map((c) => c.id);
    expect(vues.sort((a, b) => a - b)).toEqual(attendues);
  });

  it('une grille vide ne visite rien', () => {
    const grid: Grid = { phase: 0, cellSizeM: 100, cellAreaM2: 1e4, rows: 0, cols: 0, cells: [] };
    let n = 0;
    pourChaqueCelluleAPortee(grid, indexerGrille(grid), [1, 43], 1000, () => n++);
    expect(n).toBe(0);
  });
});

describe('Couches fusionnées', () => {
  for (const tm of missions) {
    it(`${tm.name} : surfaces au pas de la grille, bien moins de polygones que de cellules`, () => {
      const grid = buildGrid(tm.mission, 0);
      const as = drones(grid);
      const counts = coverageCounts(grid, as);
      const couches = coverageGeometry(grid, as);
      const nb = (pred: (n: number) => boolean) =>
        grid.cells.filter((c) => !c.forbidden && pred(counts[c.id])).length;

      for (const [geom, cellules] of [
        [couches.covered, nb((n) => n > 0)],
        [couches.gaps, nb((n) => n === 0)],
        [couches.overlap, nb((n) => n > 1)],
      ] as const) {
        const attendu = cellules * grid.cellAreaM2;
        expect(Math.abs(areaM2(geom) - attendu)).toBeLessThanOrEqual(
          Math.max(grid.cellAreaM2, 0.01 * attendu),
        );
        expect(geom.coordinates.length).toBeLessThanOrEqual(Math.max(1, cellules));
      }
      if (grid.cells.length > 500) {
        const polygones =
          couches.covered.coordinates.length +
          couches.gaps.coordinates.length +
          couches.overlap.coordinates.length;
        expect(polygones).toBeLessThan(grid.cells.length / 5);
      }
    });
  }
});
