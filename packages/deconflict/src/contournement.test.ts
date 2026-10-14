import { describe, expect, it } from 'vitest';
import { inArea, makeAssignment } from '@aeris/contracts';
import { buildGrid } from '@aeris/geo';
import { Mission, type DeconflictContext, type PolygonGeom } from '@aeris/shared';
import { deconflict } from './index';

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

/** Zone de 8 × 5 km ; terrain militaire (50 m) de ~1,6 × 1,1 km au nord-est. */
const militaire = rect(1.25, 43.655, 1.27, 43.665);
const mission = (prioritaireSousTerrain: boolean) =>
  Mission.parse({
    id: 'c',
    name: 'c',
    maxDrones: 5,
    pilots: [],
    resources: [],
    workArea: rect(1.18, 43.62, 1.28, 43.67),
    constraintZones: [
      {
        id: 'm',
        name: 'Terrain militaire',
        kind: 'hauteur_limitee',
        maxHeightM: 50,
        geometry: militaire,
      },
    ],
    priorityZones: prioritaireSousTerrain
      ? [{ id: 'p', name: 'Clôture', level: 3, geometry: rect(1.255, 43.658, 1.265, 43.662) }]
      : [],
  });
const ctx = (m: Mission): DeconflictContext => ({
  mission: m,
  catalog: [],
  rules: [],
  grid: buildGrid(m, 0),
  phase: 0,
});
/** TP2 dont le disque de 2 km mord sur le terrain militaire. */
const tp2 = makeAssignment('tp2', [1.24, 43.65], 2000, 0, { minM: 0, maxM: 120 });
/** TP1 rural (50 m) au-dessus du terrain. */
const tp1 = makeAssignment('tp1', [1.26, 43.66], 1000, 0, { minM: 0, maxM: 50 });

describe('zone à hauteur limitée : contourner ou descendre', () => {
  it('par défaut, le TP2 contourne le terrain et garde 120 m', () => {
    const res = deconflict([tp2], ctx(mission(false)));
    const [a] = res.assignments;
    expect(a.altitude.maxM).toBe(120);
    expect(a.sector).toBeDefined();
    expect(inArea([1.26, 43.66], a.sector!)).toBe(false);
    expect(inArea([1.23, 43.645], a.sector!)).toBe(true);
    expect(res.diagnostics.some((d) => d.includes('tp2') && d.includes('contourne'))).toBe(true);
  });

  it('zone prioritaire sous le terrain sans autre drone : le TP2 descend à 50 m', () => {
    const res = deconflict([tp2], ctx(mission(true)));
    const [a] = res.assignments;
    expect(a.altitude.maxM).toBeLessThanOrEqual(50);
    expect(a.sector).toBeUndefined();
    expect(res.diagnostics.some((d) => d.includes('tp2') && d.includes('descend'))).toBe(true);
  });

  it('zone prioritaire couverte par un TP1 volant bas : le TP2 contourne quand même', () => {
    const res = deconflict([tp2, tp1], ctx(mission(true)));
    const a = res.assignments.find((x) => x.resourceId === 'tp2')!;
    expect(a.altitude.maxM).toBe(120);
    expect(a.sector).toBeDefined();
  });

  it('un drone entièrement sous le terrain ne peut que descendre', () => {
    const dedans = makeAssignment('d', [1.26, 43.66], 300, 0, { minM: 0, maxM: 120 });
    const res = deconflict([dedans], ctx(mission(false)));
    expect(res.assignments[0].altitude.maxM).toBeLessThanOrEqual(50);
  });
});
