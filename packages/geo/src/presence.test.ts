import { describe, expect, it } from 'vitest';
import { areaM2, makeAssignment } from '@aeris/contracts';
import { Mission, type Assignment, type LngLat } from '@aeris/shared';
import { coverageGeometry } from './coverage';
import { buildGrid } from './grid';
import { computeMetrics } from './metrics';

const mission = Mission.parse({
  id: 'p',
  name: 'p',
  maxDrones: 5,
  pilots: [],
  resources: [],
  workArea: {
    type: 'Polygon',
    coordinates: [
      [
        [1.18, 43.62],
        [1.28, 43.62],
        [1.28, 43.665],
        [1.18, 43.665],
        [1.18, 43.62],
      ],
    ],
  },
});
const grid = buildGrid(mission, 0);
const ouest: LngLat = [1.2, 43.64];
const est: LngLat = [1.26, 43.645];
const avecCreneau = (a: Assignment, start: string, end: string): Assignment => ({
  ...a,
  slot: { start, end },
});

describe('couverture au pire moment', () => {
  const ensemble = [makeAssignment('o', ouest, 1000), makeAssignment('e', est, 1000)];

  it('sans créneau : inchangé', () => {
    expect(computeMetrics(grid, ensemble).coverage).toBeGreaterThan(0);
  });

  it("un drone qui ne vole qu'une partie de la phase ne couvre pas au pire moment", () => {
    const moitie = [
      avecCreneau(ensemble[0], '10:00', '11:00'),
      avecCreneau(ensemble[1], '10:00', '12:00'),
    ];
    const plein = computeMetrics(grid, ensemble);
    const m = computeMetrics(grid, moitie);
    expect(m.coverage).toBeCloseTo(computeMetrics(grid, [ensemble[1]]).coverage, 12);
    expect(m.coverage).toBeLessThan(plein.coverage);
  });

  it('deux drones qui se relaient au même endroit couvrent en permanence, sans chevauchement', () => {
    const relais = [
      avecCreneau(makeAssignment('a', ouest, 1000), '10:00', '11:00'),
      avecCreneau(makeAssignment('b', ouest, 1000), '11:00', '12:00'),
    ];
    const m = computeMetrics(grid, relais);
    const seul = computeMetrics(grid, [makeAssignment('a', ouest, 1000)]);
    expect(m.coverage).toBeCloseTo(seul.coverage, 12);
    expect(m.overlap).toBe(0);
  });

  it('la carte suit les métriques', () => {
    const moitie = [
      avecCreneau(ensemble[0], '10:00', '11:00'),
      avecCreneau(ensemble[1], '10:00', '12:00'),
    ];
    const m = computeMetrics(grid, moitie);
    const couches = coverageGeometry(grid, moitie);
    expect(Math.abs(areaM2(couches.covered) - m.coveredAreaM2)).toBeLessThanOrEqual(
      Math.max(grid.cellAreaM2, 0.01 * m.coveredAreaM2),
    );
  });
});
