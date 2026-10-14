import { describe, expect, it } from 'vitest';
import { areaM2, makeAssignment } from '@aeris/contracts';
import { Mission, type LngLat, type PolygonGeom } from '@aeris/shared';
import { buildGrid } from './grid';
import { coverageGeometry } from './coverage';
import { computeMetrics } from './metrics';
import { couchesRedondance, mesurerRedondance } from './redondance';

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

/** Zone de 8 × 5 km ; un étang de ~800 × 550 m actif en phase 0 seulement, r drones voulus. */
const mission = (redundancy: number) =>
  Mission.parse({
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
        redundancy,
        geometry: rect(1.225, 43.638, 1.235, 43.643),
      },
    ],
  });
/** Étang exigeant 2 drones (grid) ou 1 seul (grid1). */
const grid = buildGrid(mission(2), 0);
const grid1 = buildGrid(mission(1), 0);
const etang: LngLat = [1.23, 43.6405];
const loin: LngLat = [1.19, 43.63];
const surfaceEtang = grid.cells.filter((c) => c.redundancy === 2).length * grid.cellAreaM2;

describe('cell.redundancy (buildGrid)', () => {
  it("r = 2 sur l'étang, 1 ailleurs", () => {
    expect(surfaceEtang).toBeGreaterThan(0);
    expect(grid.cells.every((c) => c.redundancy === 1 || c.priorityLevel === 2)).toBe(true);
  });

  it('une zone inactive dans la phase ne compte pas', () => {
    expect(buildGrid(mission(2), 1).cells.every((c) => c.redundancy === 1)).toBe(true);
  });
});

describe('mesurerRedondance', () => {
  const deux = [makeAssignment('a', etang, 1000), makeAssignment('b', etang, 1000)];

  it('avec r = 1 partout, on retrouve computeMetrics', () => {
    const as = [makeAssignment('a', etang, 1000), makeAssignment('b', [1.24, 43.645], 1000)];
    const m = computeMetrics(grid1, as);
    const red = mesurerRedondance(grid1, as);
    expect(red.superfluousOverlap).toBeCloseTo(m.overlap, 12);
    expect(red.usefulOverlap).toBe(0);
    expect(red.partialWeightedCoverage).toBeCloseTo(m.weightedCoverage, 12);
    expect(red.redundancyMet).toBe(1);
  });

  it('deux drones sur un étang qui en exige deux : redondance atteinte, chevauchement utile', () => {
    const red = mesurerRedondance(grid, deux);
    expect(red.redundancyMet).toBe(1);
    expect(red.usefulOverlap).toBeGreaterThan(0);
    expect(areaM2(couchesRedondance(grid, deux).redundancyMissing)).toBe(0);
  });

  it('un seul drone : redondance non atteinte, mais crédit partiel', () => {
    const un = [makeAssignment('a', etang, 1000)];
    const avec2 = mesurerRedondance(grid, un);
    const avec1 = mesurerRedondance(grid1, un);
    expect(avec2.redundancyMet).toBe(0);
    expect(avec2.partialWeightedCoverage).toBeGreaterThan(0);
    expect(avec2.partialWeightedCoverage).toBeLessThan(avec1.partialWeightedCoverage);
    const manque = areaM2(couchesRedondance(grid, un).redundancyMissing);
    expect(Math.abs(manque - surfaceEtang)).toBeLessThanOrEqual(0.02 * surfaceEtang);
  });

  it('le deuxième drone rapporte du crédit (sinon un glouton ne le poserait jamais)', () => {
    const un = mesurerRedondance(grid, [makeAssignment('a', loin, 1000)]).partialWeightedCoverage;
    const plus = mesurerRedondance(grid, [makeAssignment('a', loin, 1000), deux[0]]);
    expect(plus.partialWeightedCoverage).toBeGreaterThan(un);
  });

  it('trois drones là où deux suffisent : chevauchement superflu', () => {
    const trois = [...deux, makeAssignment('c', etang, 1000)];
    expect(mesurerRedondance(grid, trois).superfluousOverlap).toBeGreaterThan(0);
  });

  it('utile + superflu = overlap de computeMetrics', () => {
    const as = [...deux, makeAssignment('c', [1.24, 43.645], 2000)];
    const red = mesurerRedondance(grid, as);
    expect(red.usefulOverlap + red.superfluousOverlap).toBeCloseTo(
      computeMetrics(grid, as).overlap,
      12,
    );
  });

  it('des drones sans les capacités requises ne comptent pas pour la redondance', () => {
    const red = mesurerRedondance(grid, deux, { canServe: () => false });
    expect(red.redundancyMet).toBe(0);
    expect(red.partialWeightedCoverage).toBe(0);
  });
});

describe('redondance au pire moment', () => {
  const creneau = (id: string, start: string, end: string) => ({
    ...makeAssignment(id, etang, 1000),
    slot: { start, end },
  });

  it('deux drones qui se relaient sur l’étang : couvert en permanence, redondance non atteinte', () => {
    const relais = [creneau('a', '10:00', '11:00'), creneau('b', '11:00', '12:00')];
    const red = mesurerRedondance(grid, relais);
    expect(red.redundancyMet).toBe(0);
    expect(red.usefulOverlap).toBe(0);
    expect(areaM2(couchesRedondance(grid, relais).redundancyMissing)).toBeGreaterThan(0);
  });

  it('créneaux qui ne se recouvrent qu’en partie : il manque un drone une partie du temps', () => {
    const partiel = [creneau('a', '10:00', '11:00'), creneau('b', '10:30', '11:30')];
    expect(mesurerRedondance(grid, partiel).redundancyMet).toBe(0);
  });

  it('deux drones sur le même créneau : redondance atteinte', () => {
    const ensemble = [creneau('a', '10:00', '11:00'), creneau('b', '10:00', '11:00')];
    expect(mesurerRedondance(grid, ensemble).redundancyMet).toBe(1);
  });

  it('un drone sans créneau est présent toute la phase', () => {
    const mixte = [makeAssignment('a', etang, 1000), creneau('b', '10:00', '11:00')];
    expect(mesurerRedondance(grid, mixte).redundancyMet).toBe(1);
  });
});

describe('champs de redondance de computeMetrics et de coverageGeometry', () => {
  const deux = [makeAssignment('a', etang, 1000), makeAssignment('b', etang, 1000)];
  const trois = [...deux, makeAssignment('c', etang, 1000)];

  it('computeMetrics donne les mêmes valeurs que mesurerRedondance', () => {
    for (const as of [deux, trois, [deux[0]]]) {
      const m = computeMetrics(grid, as);
      const red = mesurerRedondance(grid, as);
      expect(m.usefulOverlap).toBeCloseTo(red.usefulOverlap, 12);
      expect(m.superfluousOverlap).toBeCloseTo(red.superfluousOverlap, 12);
      expect(m.redundancyMet).toBeCloseTo(red.redundancyMet, 12);
    }
  });

  it('coverageGeometry : couches de redondance seulement si une zone en demande', () => {
    expect(coverageGeometry(grid1, deux).redundancyMissing).toBeUndefined();
    const un = coverageGeometry(grid, [deux[0]]);
    expect(areaM2(un.redundancyMissing!)).toBeGreaterThan(0);
    expect(areaM2(coverageGeometry(grid, trois).superfluousOverlap!)).toBeGreaterThan(0);
  });
});
