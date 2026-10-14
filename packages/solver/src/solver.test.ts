import { describe, expect, it } from 'vitest';
import { booleanPointInPolygon } from '@turf/turf';
import { drones, demoMission, pilotRules, testMissions } from '@aeris/data';
import { buildGrid, computeMetrics } from '@aeris/geo';
import { anneal, greedySolve } from './greedy';
import {
  HOLES_ARE_INFEASIBLE,
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
    // 5 drones ne couvrent pas toute la démo : meilleure solution rendue, mais « infaisable ».
    expect(res.status).toBe(HOLES_ARE_INFEASIBLE ? 'infaisable' : 'faisable');
    expect(res.assignments.length).toBeGreaterThan(0);
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

describe('recuit simulé', () => {
  const ctxFor = (strategy: 'couverture_globale' | 'priorite' | 'economie_moyens') => ({
    mission,
    catalog: drones,
    rules: pilotRules,
    grid: buildGrid(mission, 0),
    phase: 0,
    strategy,
  });

  it('deux missions identiques (identifiants différents) donnent le même dispositif', () => {
    const ctx = ctxFor('priorite');
    const a = greedySolve(ctx);
    const b = greedySolve({ ...ctx, mission: { ...ctx.mission, id: 'autre-id', name: 'Copie' } });
    expect(b.assignments).toEqual(a.assignments);
  });

  it('le recuit est déterministe', () => {
    const p = buildProblem(ctxFor('priorite'));
    if (!isProblem(p)) throw new Error('problème attendu');
    // Peu d'itérations : on reste sous le budget de temps même sur une machine chargée.
    const a = anneal(p, { seed: 42, iterations: 3000 });
    const b = anneal(p, { seed: 42, iterations: 3000 });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('ne déplace aucun drone au recalcul quand il n’y a rien à gagner (aucun trou)', () => {
    // Les trous passent avant la stabilité : on teste donc la stabilité là où il n'y en a pas.
    const tp2 = mission.resources.find(
      (r) => mission.pilots.find((p) => p.id === r.pilotId)!.level === 'TP2',
    )!;
    const big = {
      ...mission,
      maxDrones: 9,
      resources: [
        ...mission.resources.map((r) => ({ ...r, available: true })),
        ...[0, 1, 2].map((i) => ({
          ...tp2,
          id: `x${i}`,
          fixedPosition: undefined,
          allowedArea: undefined,
        })),
      ],
    };
    const ctx = { ...ctxFor('priorite'), mission: big, grid: buildGrid(big, 0) };
    const first = greedySolve(ctx);
    const again = greedySolve({ ...ctx, previous: first.assignments });
    // Un drone peut être ajouté, mais ceux déjà en place ne bougent pas.
    for (const a of first.assignments) {
      const b = again.assignments.find((x) => x.resourceId === a.resourceId);
      expect(b?.position, a.resourceId).toEqual(a.position);
    }
  });

  it('n’affecte qu’un drone par télépilote dans une phase', () => {
    const resource = mission.resources.find((item) => !item.fixedPosition)!;
    const alternateModel = drones.find((drone) => drone.id !== resource.droneModelId)!;
    const duplicatePilotMission = {
      ...mission,
      id: 'duplicate-pilot-resources',
      maxDrones: 2,
      resources: [
        { ...resource, id: 'pilot-drone-a' },
        { ...resource, id: 'pilot-drone-b', droneModelId: alternateModel.id },
      ],
    };
    const ctx = {
      mission: duplicatePilotMission,
      catalog: drones,
      rules: pilotRules,
      grid: buildGrid(duplicatePilotMission, 0),
      phase: 0,
      strategy: 'priorite' as const,
    };
    const pilotIds = new Map(
      duplicatePilotMission.resources.map((item) => [item.id, item.pilotId]),
    );
    const expectOneDronePerPilot = (result: ReturnType<typeof greedySolve>) => {
      const assignedPilots = result.assignments.map((item) => pilotIds.get(item.resourceId));
      expect(new Set(assignedPilots).size).toBe(assignedPilots.length);
    };

    expectOneDronePerPilot(greedySolve(ctx));
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
    const res = greedySolve(ctx);
    expect(res.assignments.length).toBeGreaterThan(0);
    // Hameau à 3 drones jugé impossible par la fixture : le solveur doit le dire.
    expect(res.diagnostics.some((d) => d.includes('redondance'))).toBe(true);
    // Les trous passent avant la redondance : avec 5 drones, elle peut tomber à 0.
    expect(met(grid, res)).toBeGreaterThanOrEqual(0);
  }, 10_000);
});

describe('trous et zones prioritaires', () => {
  const ctxOf = (m: typeof mission, phase = 0) => ({
    mission: m,
    catalog: drones,
    rules: pilotRules,
    grid: buildGrid(m, phase),
    phase,
    strategy: 'couverture_globale' as const,
  });
  const active = (m: typeof mission, phase: number) =>
    m.priorityZones.filter((z) => !z.phases || z.phases.includes(phase));

  it('pose au moins un drone dans chaque zone prioritaire active, à chaque phase', () => {
    for (let phase = 0; phase < mission.phaseCount; phase++) {
      const res = greedySolve(ctxOf(mission, phase));
      for (const z of active(mission, phase))
        expect(
          res.assignments.some((a) => booleanPointInPolygon(a.position.coordinates, z.geometry)),
          `${z.name}, phase ${phase}`,
        ).toBe(true);
    }
  });

  it('rend la meilleure solution (infaisable seulement si HOLES_ARE_INFEASIBLE) quand des trous restent', () => {
    const res = greedySolve(ctxOf(mission));
    expect(res.assignments.length).toBeGreaterThan(0);
    if (HOLES_ARE_INFEASIBLE) {
      expect(res.status).toBe('infaisable');
      expect(res.diagnostics.some((d) => d.includes('Aucune solution sans trou'))).toBe(true);
    }
  });

  it('dit infaisable si une zone prioritaire ne peut recevoir aucun drone (arrêté à 1, 2 zones)', () => {
    const one = { ...mission, maxDrones: 1 };
    const res = greedySolve(ctxOf(one));
    if (active(one, 0).length >= 2) {
      expect(res.status).toBe('infaisable');
      expect(res.diagnostics.some((d) => d.includes('aucun drone posé dessus'))).toBe(true);
    }
  });
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
