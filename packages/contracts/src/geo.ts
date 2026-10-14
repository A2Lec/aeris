import { describe, expect, it } from 'vitest';
import { testMissions } from '@aeris/data';
import {
  CoverageLayers,
  Metrics,
  type Assignment,
  type CoverageGeometryBuilder,
  type Grid,
  type GridBuilder,
  type MetricsEngine,
  type Mission,
  type StabilityEngine,
} from '@aeris/shared';
import { Stability } from '@aeris/shared';
import { areaM2, inArea, makeAssignment } from './helpers';

const phasesOf = (m: Mission) => [...Array(m.phaseCount).keys()];

/** Un drone qui couvre toute la zone. */
const giant = (id: string, grid: Grid): Assignment =>
  makeAssignment(id, grid.cells[0]?.center ?? [0, 0], 1e6, grid.phase);

/** Quelques drones réalistes répartis sur la zone. */
function spread(grid: Grid): Assignment[] {
  const cells = grid.cells.filter((c) => !c.forbidden);
  return [0, 0.3, 0.6, 0.62].map((f, i) =>
    makeAssignment(`s${i}`, cells[Math.floor(f * (cells.length - 1))].center, 1000, grid.phase),
  );
}

const close = (actual: number, expected: number, relTol: number, absTol = 1) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    Math.max(absTol, relTol * Math.abs(expected)),
  );

/** Contrat de `buildGrid` : la grille reflète fidèlement la configuration de la mission. */
export function gridContract(buildGrid: GridBuilder) {
  describe('Contrat GridBuilder', () => {
    for (const tm of testMissions) {
      for (const phase of phasesOf(tm.mission)) {
        it(`${tm.name} · phase ${phase}`, () => {
          const m = tm.mission;
          const grid = buildGrid(m, phase);
          expect(grid.phase).toBe(phase);
          expect(grid.cellSizeM).toBe(m.gridCellM);
          expect(grid.cellAreaM2).toBeCloseTo(m.gridCellM ** 2);
          expect(grid.cells.length).toBeGreaterThan(0);
          close(grid.cells.length * grid.cellAreaM2, areaM2(m.workArea), 0.15);

          const active = m.priorityZones.filter(
            (z) => !z.phases?.length || z.phases.includes(phase),
          );
          grid.cells.forEach((cell, i) => {
            expect(cell.id).toBe(i);
            expect(inArea(cell.center, m.workArea)).toBe(true);
            const containing = active.filter((z) => inArea(cell.center, z.geometry));
            expect(cell.priorityLevel).toBe(Math.max(0, ...containing.map((z) => z.level)));
            if (containing.some((z) => z.requires.thermal))
              expect(cell.requires.thermal).toBe(true);
            if (containing.some((z) => z.requires.night)) expect(cell.requires.night).toBe(true);
            expect(cell.redundancy).toBe(Math.max(1, ...containing.map((z) => z.redundancy)));
            const minZoom = Math.max(0, ...containing.map((z) => z.requires.minZoomX ?? 0));
            if (minZoom > 0) expect(cell.requires.minZoomX).toBe(minZoom);

            const constraints = m.constraintZones.filter((z) => inArea(cell.center, z.geometry));
            expect(cell.forbidden).toBe(constraints.some((z) => z.kind === 'interdite'));
            expect(cell.urban).toBe(
              m.environment === 'urbain' || constraints.some((z) => z.kind === 'urbaine'),
            );
            const ceilings = constraints.filter(
              (z) => z.kind === 'hauteur_limitee' && z.maxHeightM !== undefined,
            );
            if (ceilings.length)
              expect(cell.maxHeightM).toBe(Math.min(...ceilings.map((z) => z.maxHeightM!)));
            else expect(cell.maxHeightM).toBeUndefined();
          });
        });
      }
    }
  });
}

/** Contrat de `computeMetrics` : indicateurs bornés, cohérents et monotones. */
export function metricsContract(computeMetrics: MetricsEngine, buildGrid: GridBuilder) {
  describe('Contrat MetricsEngine', () => {
    for (const tm of testMissions) {
      describe(tm.name, () => {
        const grid = buildGrid(tm.mission, 0);
        const forbidden = grid.cells.filter((c) => c.forbidden).length;
        const coverable = grid.cells.length - forbidden;
        const hasPriority = grid.cells.some((c) => c.priorityLevel > 0 && !c.forbidden);

        const check = (as: Assignment[]) => {
          const m = computeMetrics(grid, as);
          expect(() => Metrics.parse(m)).not.toThrow();
          for (const k of [
            'coverage',
            'priorityCoverage',
            'weightedCoverage',
            'overlap',
          ] as const) {
            expect(m[k]).toBeGreaterThanOrEqual(0);
            expect(m[k]).toBeLessThanOrEqual(1);
          }
          for (const k of ['usefulOverlap', 'superfluousOverlap', 'redundancyMet'] as const) {
            if (m[k] === undefined) continue;
            expect(m[k]).toBeGreaterThanOrEqual(0);
            expect(m[k]).toBeLessThanOrEqual(1);
          }
          // Chevauchement voulu + superflu = tout le chevauchement.
          if (m.usefulOverlap !== undefined && m.superfluousOverlap !== undefined) {
            close(m.usefulOverlap + m.superfluousOverlap, m.overlap, 1e-9, 1e-9);
          }
          close(
            m.coveredAreaM2 + m.uncoveredAreaM2 + m.forbiddenAreaM2,
            grid.cells.length * grid.cellAreaM2,
            1e-9,
          );
          close(m.forbiddenAreaM2, forbidden * grid.cellAreaM2, 1e-9);
          return m;
        };

        it('sans drone : rien de couvert', () => {
          const m = check([]);
          expect(m.coverage).toBe(0);
          expect(m.weightedCoverage).toBe(0);
          expect(m.overlap).toBe(0);
          expect(m.coveredAreaM2).toBe(0);
          close(m.uncoveredAreaM2, coverable * grid.cellAreaM2, 1e-9);
        });

        it('un drone qui couvre tout : couverture totale, sans chevauchement', () => {
          const m = check([giant('g1', grid)]);
          expect(m.coverage).toBe(1);
          expect(m.weightedCoverage).toBe(1);
          expect(m.priorityCoverage).toBe(1);
          expect(m.overlap).toBe(0);
          expect(m.uncoveredAreaM2).toBe(0);
        });

        it('deux drones qui couvrent tout : chevauchement total', () => {
          expect(check([giant('g1', grid), giant('g2', grid)]).overlap).toBe(1);
        });

        it('canServe refuse tout : aucune zone prioritaire servie', () => {
          const m = computeMetrics(grid, [giant('g1', grid)], { canServe: () => false });
          expect(m.coverage).toBe(1); // couvert, mais pas « servi »
          if (hasPriority) expect(m.priorityCoverage).toBe(0);
        });

        it('ajouter un drone ne fait jamais baisser la couverture', () => {
          const as = spread(grid);
          let prev = 0;
          for (let n = 1; n <= as.length; n++) {
            const m = check(as.slice(0, n));
            expect(m.coverage).toBeGreaterThanOrEqual(prev);
            prev = m.coverage;
          }
        });
      });
    }
  });
}

/** Contrat des géométries de couverture : ce que la carte affiche = ce que les métriques mesurent. */
export function coverageContract(
  coverage: CoverageGeometryBuilder,
  computeMetrics: MetricsEngine,
  buildGrid: GridBuilder,
) {
  describe('Contrat CoverageGeometryBuilder', () => {
    for (const tm of testMissions) {
      describe(tm.name, () => {
        const grid = buildGrid(tm.mission, 0);
        const coverableM2 = grid.cells.filter((c) => !c.forbidden).length * grid.cellAreaM2;

        for (const [label, as] of [
          ['sans drone', []],
          ['un drone qui couvre tout', [giant('g1', grid)]],
          ['drones répartis', spread(grid)],
        ] as [string, Assignment[]][]) {
          it(`${label} : surfaces cohérentes avec computeMetrics`, () => {
            const layers = coverage(grid, as);
            expect(() => CoverageLayers.parse(layers)).not.toThrow();
            expect(layers.phase).toBe(grid.phase);
            const m = computeMetrics(grid, as);
            const tol = 0.1;
            close(areaM2(layers.covered), m.coveredAreaM2, tol, grid.cellAreaM2);
            close(areaM2(layers.gaps), m.uncoveredAreaM2, tol, grid.cellAreaM2);
            close(areaM2(layers.overlap), m.overlap * m.coveredAreaM2, tol, grid.cellAreaM2);
            close(areaM2(layers.covered) + areaM2(layers.gaps), coverableM2, tol, grid.cellAreaM2);
          });
        }
      });
    }
  });
}

/** Contrat de la mesure de stabilité : rien ne bouge ⇒ tout à zéro ; un retrait est vu et chiffré. */
export function stabilityContract(stability: StabilityEngine, buildGrid: GridBuilder) {
  describe('Contrat StabilityEngine', () => {
    for (const tm of testMissions) {
      describe(tm.name, () => {
        const grid = buildGrid(tm.mission, 0);
        const before = spread(grid);

        it('dispositif identique : aucun changement', () => {
          const s = stability(grid, before, before.slice().reverse());
          expect(() => Stability.parse(s)).not.toThrow();
          expect(s.phase).toBe(grid.phase);
          expect(s.moved).toEqual([]);
          expect(s.added).toEqual([]);
          expect(s.removed).toEqual([]);
          expect(s.totalShiftM).toBe(0);
          expect(s.reassignedShare).toBe(0);
          expect(Object.values(s.deltas).every((d) => d === 0)).toBe(true);
          expect(s.summary.length).toBeGreaterThan(0);
        });

        it('un couple retiré : listé, couverture en baisse ou égale', () => {
          const s = stability(grid, before, before.slice(1));
          expect(s.removed).toEqual([before[0].resourceId]);
          expect(s.deltas.coverage).toBeLessThanOrEqual(0);
          expect(s.reassignedShare).toBeGreaterThanOrEqual(0);
          expect(s.reassignedShare).toBeLessThanOrEqual(1);
        });

        it('un couple déplacé de 1 km : compté, distance cohérente', () => {
          const after = before.map((a, i) =>
            i === 0
              ? {
                  ...a,
                  position: {
                    ...a.position,
                    coordinates: [
                      a.position.coordinates[0],
                      a.position.coordinates[1] + 1000 / 110_574,
                    ] as [number, number],
                  },
                }
              : a,
          );
          const s = stability(grid, before, after);
          expect(s.moved.map((m) => m.resourceId)).toEqual([before[0].resourceId]);
          close(s.maxShiftM, 1000, 0.02);
          close(s.totalShiftM, 1000, 0.02);
        });

        it("ignore les affectations d'une autre phase", () => {
          const other = before.map((a) => ({ ...a, phase: grid.phase + 1 }));
          const s = stability(grid, before, [
            ...before,
            ...other.map((a) => ({ ...a, resourceId: a.resourceId + '-x' })),
          ]);
          expect(s.added).toEqual([]);
        });
      });
    }
  });
}
