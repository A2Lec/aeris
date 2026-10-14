import { describe, expect, it } from 'vitest';
import { areaM2, makeAssignment } from '@aeris/contracts';
import { Mission, type LngLat, type PolygonGeom } from '@aeris/shared';
import { buildGrid } from './grid';
import { computeMetrics } from './metrics';
import { couchesRedondance, mesurerRedondance, redondanceDesCellules } from './redondance';

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

/** Zone de 8 × 5 km ; un étang de ~800 × 550 m actif en phase 0 seulement. */
const mission = Mission.parse({
  id: 'r',
  name: 'r',
  maxDrones: 5,
  phaseCount: 2,
  pilots: [],
  resources: [],
  workArea: rect(1.18, 43.62, 1.28, 43.665),
  priorityZones: [
    {
      id: 'etang',
      name: 'Étang',
      level: 2,
      phases: [0],
      geometry: rect(1.225, 43.638, 1.235, 43.643),
    },
  ],
});
const grid = buildGrid(mission, 0);
const etang: LngLat = [1.23, 43.6405];
const loin: LngLat = [1.19, 43.63];
const r2 = redondanceDesCellules(mission, grid, { etang: 2 });
const r1 = redondanceDesCellules(mission, grid, {});
const surfaceEtang = grid.cells.filter((c) => r2[c.id] === 2).length * grid.cellAreaM2;

describe('redondanceDesCellules', () => {
  it("r = 2 sur l'étang, 1 ailleurs", () => {
    expect(surfaceEtang).toBeGreaterThan(0);
    expect(grid.cells.every((c) => r2[c.id] === 1 || c.priorityLevel === 2)).toBe(true);
  });

  it('une zone inactive dans la phase ne compte pas', () => {
    const g1 = buildGrid(mission, 1);
    expect(redondanceDesCellules(mission, g1, { etang: 2 }).every((x) => x === 1)).toBe(true);
  });
});

describe('mesurerRedondance', () => {
  const deux = [makeAssignment('a', etang, 1000), makeAssignment('b', etang, 1000)];

  it('avec r = 1 partout, on retrouve computeMetrics', () => {
    const as = [makeAssignment('a', etang, 1000), makeAssignment('b', [1.24, 43.645], 1000)];
    const m = computeMetrics(grid, as);
    const red = mesurerRedondance(grid, as, r1);
    expect(red.superfluousOverlap).toBeCloseTo(m.overlap, 12);
    expect(red.usefulOverlap).toBe(0);
    expect(red.weightedCoverage).toBeCloseTo(m.weightedCoverage, 12);
    expect(red.redundancyMet).toBe(1);
  });

  it('deux drones sur un étang qui en exige deux : redondance atteinte, chevauchement utile', () => {
    const red = mesurerRedondance(grid, deux, r2);
    expect(red.redundancyMet).toBe(1);
    expect(red.usefulOverlap).toBeGreaterThan(0);
    expect(areaM2(couchesRedondance(grid, deux, r2).redundancyMissing)).toBe(0);
  });

  it('un seul drone : redondance non atteinte, mais crédit partiel', () => {
    const un = [makeAssignment('a', etang, 1000)];
    const avec2 = mesurerRedondance(grid, un, r2);
    const avec1 = mesurerRedondance(grid, un, r1);
    expect(avec2.redundancyMet).toBe(0);
    expect(avec2.weightedCoverage).toBeGreaterThan(0);
    expect(avec2.weightedCoverage).toBeLessThan(avec1.weightedCoverage);
    const manque = areaM2(couchesRedondance(grid, un, r2).redundancyMissing);
    expect(Math.abs(manque - surfaceEtang)).toBeLessThanOrEqual(0.02 * surfaceEtang);
  });

  it('le deuxième drone rapporte du crédit (sinon un glouton ne le poserait jamais)', () => {
    const un = mesurerRedondance(grid, [makeAssignment('a', loin, 1000)], r2).weightedCoverage;
    const plus = mesurerRedondance(grid, [makeAssignment('a', loin, 1000), deux[0]], r2);
    expect(plus.weightedCoverage).toBeGreaterThan(un);
  });

  it('trois drones là où deux suffisent : chevauchement superflu', () => {
    const trois = [...deux, makeAssignment('c', etang, 1000)];
    expect(mesurerRedondance(grid, trois, r2).superfluousOverlap).toBeGreaterThan(0);
  });

  it('utile + superflu = overlap de computeMetrics', () => {
    const as = [...deux, makeAssignment('c', [1.24, 43.645], 2000)];
    const red = mesurerRedondance(grid, as, r2);
    expect(red.usefulOverlap + red.superfluousOverlap).toBeCloseTo(
      computeMetrics(grid, as).overlap,
      12,
    );
  });

  it('des drones sans les capacités requises ne comptent pas pour la redondance', () => {
    const red = mesurerRedondance(grid, deux, r2, { canServe: () => false });
    expect(red.redundancyMet).toBe(0);
    expect(red.weightedCoverage).toBe(0);
  });
});
