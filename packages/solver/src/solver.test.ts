import { describe, expect, it } from 'vitest';
import { drones, demoMission, pilotRules } from '@aeris/data';
import { buildGrid, computeMetrics } from '@aeris/geo';
import { greedySolve } from './greedy';

const mission = { ...demoMission, id: 'test' };

describe('greedySolve sur la mission de démo', () => {
  it('respecte l’arrêté et produit une couverture non nulle', () => {
    const grid = buildGrid(mission, 0);
    const res = greedySolve({
      mission,
      catalog: drones,
      rules: pilotRules,
      grid,
      phase: 0,
      strategy: 'priorite',
    });
    expect(res.status).toBe('faisable');
    expect(res.assignments.length).toBeLessThanOrEqual(mission.maxDrones);
    const m = computeMetrics(grid, res.assignments);
    expect(m.coverage).toBeGreaterThan(0.3);
  });

  it('dit infaisable sans moyen disponible', () => {
    const empty = {
      ...mission,
      resources: mission.resources.map((r) => ({ ...r, available: false })),
    };
    const res = greedySolve({
      mission: empty,
      catalog: drones,
      rules: pilotRules,
      grid: buildGrid(empty, 0),
      phase: 0,
      strategy: 'priorite',
    });
    expect(res.status).toBe('infaisable');
  });
});
