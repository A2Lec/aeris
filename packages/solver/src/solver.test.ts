import { describe, expect, it } from 'vitest';
import { drones, demoMission, pilotRules, testMissions } from '@aeris/data';
import { buildGrid, computeMetrics } from '@aeris/geo';
import { anneal, greedySolve } from './greedy';
import { ilpSolve } from './ilp';
import {
  PRIORITY_DRONE_BONUS,
  PRIORITY_DRONE_MIN_SHARE,
  buildProblem,
  isProblem,
  marginal,
  redundancyOf,
} from './problem';

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

describe('recuit simulé et ILP', () => {
  const ctxFor = (strategy: 'couverture_globale' | 'priorite' | 'economie_moyens') => ({
    mission,
    catalog: drones,
    rules: pilotRules,
    grid: buildGrid(mission, 0),
    phase: 0,
    strategy,
  });

  it('le recuit est déterministe (hors coupure par le garde-fou de temps)', () => {
    const p = buildProblem(ctxFor('priorite'));
    if (!isProblem(p)) throw new Error('problème attendu');
    // Peu d'itérations : on reste sous le budget de temps même sur une machine chargée.
    const a = anneal(p, { seed: 42, iterations: 3000 });
    const b = anneal(p, { seed: 42, iterations: 3000 });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('l’ILP résout avec HiGHS et fait au moins aussi bien que le recuit', async () => {
    const ctx = ctxFor('couverture_globale');
    const sa = greedySolve(ctx);
    const ilp = await ilpSolve(ctx);
    expect(ilp.diagnostics.some((d) => d.includes('HiGHS'))).toBe(true);
    const cov = (r: typeof sa) => computeMetrics(ctx.grid, r.assignments).coverage;
    expect(cov(ilp)).toBeGreaterThanOrEqual(cov(sa) - 0.02);
  }, 10_000);

  it('pénalise les déplacements par rapport à la solution précédente', () => {
    const ctx = ctxFor('priorite');
    const first = greedySolve(ctx);
    const again = greedySolve({ ...ctx, previous: first.assignments });
    expect(again.assignments.map((a) => a.position)).toEqual(
      first.assignments.map((a) => a.position),
    );
  });

  it('économie de moyens n’engage pas plus de couples que couverture globale', () => {
    const eco = greedySolve(ctxFor('economie_moyens'));
    const all = greedySolve(ctxFor('couverture_globale'));
    expect(eco.assignments.length).toBeLessThanOrEqual(all.assignments.length);
  });
});

describe('redondance voulue par zone (cell.redundancy)', () => {
  const tm = testMissions.find((t) => t.name === 'redondance')!;
  const grid = buildGrid(tm.mission, 0);
  const ctx = {
    mission: tm.mission,
    catalog: drones,
    rules: pilotRules,
    grid,
    phase: 0,
    strategy: 'priorite' as const,
  };

  it('crédite w/r par drone jusqu’à r, pénalise au-delà', () => {
    const p = buildProblem(ctx);
    if (!isProblem(p)) throw new Error('problème attendu');
    const r2 = grid.cells.find((c) => c.redundancy === 2 && !c.forbidden)!;
    const r1 = grid.cells.find((c) => c.redundancy === 1 && !c.forbidden)!;
    expect(redundancyOf(p, r2.id)).toBe(2);
    expect(marginal(p, r2.id, 0)).toBeCloseTo(p.weights[r2.id]! / 2);
    expect(marginal(p, r2.id, 1)).toBeCloseTo(p.weights[r2.id]! / 2);
    expect(marginal(p, r2.id, 2)).toBeLessThan(0);
    expect(marginal(p, r1.id, 0)).toBeCloseTo(p.weights[r1.id]!);
    expect(marginal(p, r1.id, 1)).toBeLessThan(0);
  });

  it('place plusieurs drones sur la zone qui en demande 2 et signale la redondance manquante', async () => {
    const met = (g: typeof grid, r: { assignments: typeof res.assignments }) =>
      computeMetrics(g, r.assignments).redundancyMet ?? 1;
    const res = await ilpSolve(ctx);
    expect(res.status).toBe('faisable');
    // Hameau à 3 drones jugé impossible par la fixture : le solveur doit le dire.
    expect(res.diagnostics.some((d) => d.includes('redondance'))).toBe(true);
    expect(met(grid, res)).toBeGreaterThan(0);
  }, 10_000);
});

describe('trous', () => {
  it('ne laisse aucun trou quand les drones suffisent largement', () => {
    const tp2 = mission.resources.find(
      (r) => mission.pilots.find((p) => p.id === r.pilotId)!.level === 'TP2',
    )!;
    const extra = [0, 1, 2].map((i) => ({
      ...tp2,
      id: `x${i}`,
      fixedPosition: undefined,
      allowedArea: undefined,
      available: true,
    }));
    const big = {
      ...mission,
      maxDrones: 9,
      resources: [...mission.resources.map((r) => ({ ...r, available: true })), ...extra],
    };
    const grid = buildGrid(big, 0);
    const res = greedySolve({
      mission: big,
      catalog: drones,
      rules: pilotRules,
      grid,
      phase: 0,
      strategy: 'couverture_globale',
    });
    expect(computeMetrics(grid, res.assignments).coverage).toBe(1);
    expect(res.diagnostics.some((d) => d.includes('trous'))).toBe(false);
  }, 20_000);

  it('signale les trous restants', () => {
    const grid = buildGrid(mission, 0);
    const res = greedySolve({
      mission,
      catalog: drones,
      rules: pilotRules,
      grid,
      phase: 0,
      strategy: 'couverture_globale',
    });
    const m = computeMetrics(grid, res.assignments);
    if (m.coverage < 1) expect(res.diagnostics.some((d) => d.includes('ha de trous'))).toBe(true);
  });
});

describe('bonus des drones en zone prioritaire', () => {
  it('ne bonifie que les candidats placés dans la zone prioritaire', () => {
    const grid = buildGrid(mission, 0);
    const p = buildProblem({
      mission,
      catalog: drones,
      rules: pilotRules,
      grid,
      phase: 0,
      strategy: 'priorite',
    });
    if (!isProblem(p)) throw new Error('problème attendu');
    const expected = (PRIORITY_DRONE_BONUS / 100) * p.totalWeight;
    for (const u of p.usable)
      u.covers.forEach((cov, j) => {
        const prio = Array.from(cov).filter((i) => grid.cells[i]!.priorityLevel > 0).length;
        const inside = cov.length > 0 && prio / cov.length >= PRIORITY_DRONE_MIN_SHARE;
        expect(u.priorityBonus[j]).toBeCloseTo(inside ? expected : 0);
      });
    if (PRIORITY_DRONE_BONUS > 0)
      expect(p.usable.some((u) => u.priorityBonus.some((b) => b > 0))).toBe(true);
  });
});
