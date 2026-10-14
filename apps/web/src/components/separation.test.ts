import { describe, expect, it } from 'vitest';
import type { Assignment } from '@aeris/shared';
import { phaseDiagnostics, separationCascade } from './separation';

const at = (resourceId: string, minM: number, maxM: number, extra: Partial<Assignment> = {}) =>
  ({
    resourceId,
    phase: 0,
    position: { type: 'Point', coordinates: [1.2, 43.6] },
    radiusM: 1000,
    altitude: { minM, maxM },
    ...extra,
  }) as Assignment;

const status = (steps: ReturnType<typeof separationCascade>['steps']) =>
  Object.fromEntries(steps.map((s) => [s.id, s.status]));

describe('phaseDiagnostics', () => {
  it('garde la phase demandée et retire le préfixe de l’API', () => {
    const diags = ['Phase 1 — r4 non engagé', 'Phase 2 — r3 non engagé', 'Phase 1 — Solveur : ILP'];
    expect(phaseDiagnostics(diags, 0)).toEqual(['r4 non engagé', 'Solveur : ILP']);
  });
});

describe('separationCascade', () => {
  it('sans conflit : rien d’appliqué au-delà des tranches identiques', () => {
    const { steps, explanations } = separationCascade([at('r1', 30, 50), at('r2', 30, 50)], []);
    expect(status(steps)).toEqual({
      horizontal: 'inutile',
      vertical: 'inutile',
      temporel: 'inutile',
      renoncement: 'inutile',
    });
    expect(explanations).toEqual([]);
  });

  it('détecte la séparation verticale par des tranches différentes', () => {
    const { steps } = separationCascade([at('r1', 30, 50), at('r2', 60, 80)], []);
    expect(status(steps).vertical).toBe('appliquee');
    expect(steps[1].detail).toBe('2 tranches : 30–50, 60–80 m');
  });

  it('lit secteurs, créneaux et renoncement dans les données et les diagnostics', () => {
    const slot = { start: '2026-10-14T10:00:00Z', end: '2026-10-14T12:00:00Z' };
    const { steps, explanations } = separationCascade(
      [
        at('r1', 30, 50, { sector: { type: 'Polygon', coordinates: [] } }),
        at('r2', 30, 50, { slot }),
      ],
      ['r5 : renoncement pour saturation de l’espace aérien'],
    );
    expect(status(steps)).toEqual({
      horizontal: 'appliquee',
      vertical: 'inutile',
      temporel: 'appliquee',
      renoncement: 'appliquee',
    });
    expect(explanations).toEqual([
      { severity: 'danger', text: 'r5 : renoncement pour saturation de l’espace aérien' },
    ]);
  });

  it('signale une séparation temporelle impossible', () => {
    const { steps } = separationCascade(
      [at('r1', 30, 50)],
      ["Phase 1 : saturation verticale, séparation temporelle impossible sans période d'arrêté"],
    );
    expect(status(steps).temporel).toBe('impossible');
  });

  it('n’explique que ce qui demande l’attention de l’opérateur', () => {
    const { explanations } = separationCascade(
      [at('r1', 30, 50)],
      [
        'Solveur : recuit simulé',
        'r4 non engagé : arrêté (5 drones max)',
        'Conflit non résolu r1 / r2',
      ],
    );
    expect(explanations.map((e) => e.severity)).toEqual(['warn', 'danger']);
  });
});
