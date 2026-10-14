import { describe, expect, it } from 'vitest';
import { makeAssignment } from '@aeris/contracts';
import { Mission, type Assignment, type PolygonGeom } from '@aeris/shared';
import { coverageGeometry } from './coverage';
import { buildGrid } from './grid';
import { computeMetrics } from './metrics';
import { couchesParCouple } from './parCouple';

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

const grid = buildGrid(
  Mission.parse({
    id: 's',
    name: 's',
    maxDrones: 5,
    pilots: [],
    resources: [],
    workArea: rect(1.18, 43.62, 1.28, 43.665),
  }),
  0,
);
const drone = makeAssignment('r1', [1.23, 43.642], 2000);
/** Secteur = moitié ouest de la zone : le drone n'évolue pas à l'est de 1,23°. */
const ouest: Assignment = { ...drone, sector: rect(1.18, 43.62, 1.23, 43.665) };

describe('secteur : un drone ne couvre que là où il évolue', () => {
  it('sans secteur : tout le disque ; avec un demi-secteur : environ la moitié', () => {
    const plein = computeMetrics(grid, [drone]).coveredAreaM2;
    const demi = computeMetrics(grid, [ouest]).coveredAreaM2;
    expect(demi).toBeGreaterThan(0.4 * plein);
    expect(demi).toBeLessThan(0.6 * plein);
  });

  it('les cellules hors secteur ne sont pas attribuées au drone sur la carte', () => {
    const [c] = couchesParCouple(grid, [ouest]);
    expect(c.areaM2).toBeCloseTo(computeMetrics(grid, [ouest]).coveredAreaM2, 6);
    const est = coverageGeometry(grid, [ouest]).covered.coordinates.flat(2);
    expect(est.every(([lng]) => lng <= 1.2301)).toBe(true);
  });

  it('un autre drone sans secteur couvre ce que le premier contourne', () => {
    const autre = makeAssignment('r2', [1.25, 43.642], 1000);
    const m = computeMetrics(grid, [ouest, autre]);
    expect(m.coveredAreaM2).toBeGreaterThan(computeMetrics(grid, [ouest]).coveredAreaM2);
  });
});
