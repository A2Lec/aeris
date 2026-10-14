import { describe, expect, it } from 'vitest';
import { drones, demoMission, pilotRules } from '@aeris/data';
import { buildGrid, computeMetrics } from '@aeris/geo';
import { anneal, greedySolve } from './greedy';
import { ilpSolve } from './ilp';
import {
  PRIORITY_DRONE_BONUS,
  PRIORITY_DRONE_MIN_SHARE,
  PRIORITY_OVERLAP,
  PRIORITY_OVERLAP_MAX,
  PRIORITY_OVERLAP_MIN,
  buildProblem,
  clampPriorityOverlap,
  isProblem,
  marginal,
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

describe('chevauchement sur les zones prioritaires', () => {
  it('borne le réglage', () => {
    expect(clampPriorityOverlap(-2)).toBe(PRIORITY_OVERLAP_MIN);
    expect(clampPriorityOverlap(5)).toBe(PRIORITY_OVERLAP_MAX);
    expect(clampPriorityOverlap(Number.NaN)).toBe(PRIORITY_OVERLAP_MIN);
    expect(clampPriorityOverlap(PRIORITY_OVERLAP)).toBe(PRIORITY_OVERLAP);
  });

  it('bonifie la seconde couverture d’une cellule prioritaire, pénalise les autres', () => {
    const ctx = {
      mission,
      catalog: drones,
      rules: pilotRules,
      grid: buildGrid(mission, 0),
      phase: 0,
      strategy: 'priorite' as const,
    };
    const p = buildProblem(ctx);
    if (!isProblem(p)) throw new Error('problème attendu');
    const prio = ctx.grid.cells.find((c) => c.priorityLevel > 0 && !c.forbidden)!;
    const plain = ctx.grid.cells.find((c) => c.priorityLevel === 0 && !c.forbidden)!;
    const alpha = p.overlapPenalty;
    const beta = PRIORITY_OVERLAP;
    expect(marginal(p, prio.id, 1)).toBeCloseTo((beta - alpha * (1 - beta)) * p.weights[prio.id]!);
    expect(marginal(p, plain.id, 1)).toBeLessThan(0);
    expect(marginal(p, prio.id, 2)).toBeLessThan(0);
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
    expect(p.usable.some((u) => u.priorityBonus.some((b) => b > 0))).toBe(true);
  });
});
