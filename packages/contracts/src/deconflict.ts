import { describe, expect, it } from 'vitest';
import { drones, pilotRules, testMissions } from '@aeris/data';
import {
  Assignment,
  maxHeightM,
  rangeM,
  type DeconflictContext,
  type DeconflictResult,
  type Deconflicter,
  type GridBuilder,
  type Mission,
} from '@aeris/shared';
import { distM, inArea, inConflict, makeAssignment, mentions } from './helpers';

type Layout = 'meme-point' | 'disperses';

/** Une affectation par couple disponible (sortie typique d'un solveur), phase 0. */
function inputFor(mission: Mission, ctx: DeconflictContext, layout: Layout): Assignment[] {
  const cells = ctx.grid.cells.filter((c) => !c.forbidden);
  if (cells.length === 0) return [];
  return mission.resources
    .filter((r) => r.available)
    .map((r, i) => {
      const level = mission.pilots.find((p) => p.id === r.pilotId)!.level;
      const cell =
        layout === 'meme-point'
          ? cells[0]
          : cells[Math.floor((i * cells.length) / mission.resources.length)];
      const coords = r.fixedPosition?.coordinates ?? cell.center;
      return makeAssignment(r.id, coords, rangeM(pilotRules, level), 0, {
        minM: 0,
        maxM: maxHeightM(pilotRules, level, mission.environment),
      });
    });
}

/**
 * Plafond local le plus bas sous la zone survolée par le couple : son disque, restreint à son
 * secteur s'il en a un (un drone qui contourne une zone à hauteur limitée n'y est pas soumis).
 */
function localCeiling(a: Assignment, ctx: DeconflictContext): number {
  let ceiling = Infinity;
  for (const c of ctx.grid.cells) {
    if (a.sector && !inArea(c.center, a.sector)) continue;
    if (c.maxHeightM !== undefined && distM(a.position.coordinates, c.center) <= a.radiusM) {
      ceiling = Math.min(ceiling, c.maxHeightM);
    }
  }
  return ceiling;
}

const samePair = (x: { a: string; b: string }, a: string, b: string) =>
  (x.a === a && x.b === b) || (x.a === b && x.b === a);

/**
 * Contrat de tout `Deconflicter` : à appeler depuis un fichier *.test.ts.
 *   deconflictContract('cascade', deconflict, { buildGrid });
 */
export function deconflictContract(
  name: string,
  deconflicter: Deconflicter,
  deps: { buildGrid: GridBuilder },
) {
  describe(`Contrat Deconflicter — ${name}`, () => {
    it('entrée vide ⇒ sortie vide', () => {
      const mission = testMissions[0].mission;
      const ctx = {
        mission,
        catalog: drones,
        rules: pilotRules,
        grid: deps.buildGrid(mission, 0),
        phase: 0,
      };
      const res = deconflicter([], ctx);
      expect(res.assignments).toHaveLength(0);
      expect(res.conflicts).toHaveLength(0);
    });

    for (const tm of testMissions) {
      for (const layout of ['meme-point', 'disperses'] as Layout[]) {
        describe(`${tm.name} · couples ${layout}`, () => {
          const { mission } = tm;
          const ctx: DeconflictContext = {
            mission,
            catalog: drones,
            rules: pilotRules,
            grid: deps.buildGrid(mission, 0),
            phase: 0,
          };
          const input = inputFor(mission, ctx, layout);
          let res: DeconflictResult;
          const run = () =>
            (res ??= deconflicter(JSON.parse(JSON.stringify(input)) as Assignment[], ctx));

          it('renvoie des affectations conformes au schéma, même phase, sans doublon', () => {
            run();
            for (const a of res.assignments) {
              expect(() => Assignment.parse(a)).not.toThrow();
              expect(a.phase).toBe(0);
            }
            const ids = res.assignments.map((a) => a.resourceId);
            expect(new Set(ids).size).toBe(ids.length);
          });

          it('ne perd aucun couple sans le dire (renoncement explicite)', () => {
            run();
            const kept = new Set(res.assignments.map((a) => a.resourceId));
            for (const a of res.assignments)
              expect(input.some((i) => i.resourceId === a.resourceId)).toBe(true);
            for (const i of input) {
              if (!kept.has(i.resourceId)) {
                expect(
                  mentions(res.diagnostics, i.resourceId),
                  `renoncement à ${i.resourceId} non expliqué`,
                ).toBe(true);
              }
            }
          });

          it('reste sous le plafond du solveur et sous les plafonds locaux (terrain militaire…)', () => {
            run();
            for (const a of res.assignments) {
              const before = input.find((i) => i.resourceId === a.resourceId)!;
              expect(a.altitude.minM).toBeGreaterThanOrEqual(0);
              expect(a.altitude.minM).toBeLessThan(a.altitude.maxM);
              expect(a.altitude.maxM).toBeLessThanOrEqual(before.altitude.maxM);
              expect(
                a.altitude.maxM,
                `${a.resourceId} au-dessus du plafond local`,
              ).toBeLessThanOrEqual(localCeiling(a, ctx));
              if (a.slot) expect(a.slot.start < a.slot.end).toBe(true);
            }
          });

          it('ne déplace pas une position imposée et reste dans les zones limites', () => {
            run();
            for (const a of res.assignments) {
              const r = mission.resources.find((x) => x.id === a.resourceId)!;
              if (r.fixedPosition)
                expect(a.position.coordinates).toEqual(r.fixedPosition.coordinates);
              else if (r.allowedArea) {
                const before = input.find((i) => i.resourceId === a.resourceId)!;
                const moved = a.position.coordinates.some(
                  (v, k) => v !== before.position.coordinates[k],
                );
                if (moved) expect(inArea(a.position.coordinates, r.allowedArea)).toBe(true);
              }
            }
          });

          it('déclare tout conflit résiduel (dans conflicts ET diagnostics)', () => {
            run();
            const out = res.assignments;
            for (let i = 0; i < out.length; i++) {
              for (let j = i + 1; j < out.length; j++) {
                if (!inConflict(out[i], out[j])) continue;
                const declared = res.conflicts.some((c) =>
                  samePair(c, out[i].resourceId, out[j].resourceId),
                );
                expect(
                  declared,
                  `conflit ${out[i].resourceId}/${out[j].resourceId} non déclaré`,
                ).toBe(true);
              }
            }
            if (res.conflicts.some((c) => !c.resolvedBy))
              expect(res.diagnostics.length).toBeGreaterThan(0);
          });
        });
      }
    }
  });
}
