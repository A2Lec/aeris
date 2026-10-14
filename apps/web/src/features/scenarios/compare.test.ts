import { describe, expect, it } from 'vitest';
import type { Metrics, Proposal, SolveStatus, Strategy } from '@aeris/shared';
import { bestIds, columnLabels, criterion, engagedCount, formatValue } from './compare';

const metrics = (m: Partial<Metrics> = {}): Metrics => ({
  coverage: 0.5,
  priorityCoverage: 0.5,
  weightedCoverage: 0.5,
  overlap: 0.1,
  coveredAreaM2: 5e6,
  uncoveredAreaM2: 5e6,
  forbiddenAreaM2: 0,
  communes: [],
  ...m,
});

function proposal(
  id: string,
  opts: {
    strategy?: Strategy;
    status?: SolveStatus;
    label?: string;
    phases?: Partial<Metrics>[];
    /** Couples engagés par phase. */
    drones?: string[][];
  } = {},
): Proposal {
  const phases = opts.phases ?? [{}];
  return {
    id,
    label: opts.label ?? id,
    strategy: opts.strategy ?? 'priorite',
    status: opts.status ?? 'faisable',
    assignments: (opts.drones ?? [['R1']]).flatMap((ids, phase) =>
      ids.map((resourceId) => ({
        resourceId,
        phase,
        position: { type: 'Point' as const, coordinates: [1.2, 43.6] as [number, number] },
        radiusM: 1000,
        altitude: { minM: 30, maxM: 50 },
      })),
    ),
    metricsByPhase: phases.map(metrics),
    diagnostics: [],
    createdAt: '2026-10-14T10:00:00Z',
  };
}

describe('valeurs des critères', () => {
  it('exprime les ratios en pourcentage arrondi et les surfaces en hectares', () => {
    const p = proposal('a', { phases: [{ coverage: 0.456, uncoveredAreaM2: 123_456 }] });
    expect(criterion('coverage').value(p, 0)).toBe(46);
    expect(criterion('uncoveredHa').value(p, 0)).toBe(12);
    expect(formatValue(criterion('coverage'), 46)).toBe('46 %');
    expect(formatValue(criterion('uncoveredHa'), 12)).toBe('12 ha');
  });

  it('compte les couples distincts de la phase demandée', () => {
    const p = proposal('a', { phases: [{}, {}], drones: [['R1', 'R2'], ['R3']] });
    expect(engagedCount(p, 0)).toBe(2);
    expect(engagedCount(p, 1)).toBe(1);
    expect(criterion('drones').value(p, 1)).toBe(1);
  });

  it("n'invente pas de valeur pour une phase non calculée", () => {
    const p = proposal('a');
    expect(criterion('coverage').value(p, 3)).toBeUndefined();
    expect(criterion('drones').value(p, 3)).toBeUndefined();
    expect(formatValue(criterion('coverage'), undefined)).toBe('—');
  });
});

describe('bestIds', () => {
  const a = proposal('a', { phases: [{ coverage: 0.8, overlap: 0.3 }] });
  const b = proposal('b', { phases: [{ coverage: 0.6, overlap: 0.1 }] });
  const c = proposal('c', { phases: [{ coverage: 0.8, overlap: 0.2 }] });

  it('maximise la couverture et minimise le chevauchement', () => {
    expect(bestIds([a, b], 0, criterion('coverage'))).toEqual(new Set(['a']));
    expect(bestIds([a, b], 0, criterion('overlap'))).toEqual(new Set(['b']));
  });

  it('désigne tous les ex aequo en tête', () => {
    expect(bestIds([a, b, c], 0, criterion('coverage'))).toEqual(new Set(['a', 'c']));
  });

  it("ne désigne personne si tout le monde est égal à l'arrondi près", () => {
    const x = proposal('x', { phases: [{ coverage: 0.701 }] });
    const y = proposal('y', { phases: [{ coverage: 0.699 }] });
    expect(bestIds([x, y], 0, criterion('coverage')).size).toBe(0);
  });

  it('ne désigne personne avec une seule proposition', () => {
    expect(bestIds([a], 0, criterion('coverage')).size).toBe(0);
  });

  it('ignore les propositions infaisables', () => {
    const bad = proposal('bad', { status: 'infaisable', phases: [{ coverage: 1 }] });
    expect(bestIds([a, b, bad], 0, criterion('coverage'))).toEqual(new Set(['a']));
  });
});

describe('columnLabels', () => {
  it('donne un libellé court par stratégie', () => {
    const labels = columnLabels([
      proposal('1', { strategy: 'couverture_globale' }),
      proposal('2', { strategy: 'priorite' }),
      proposal('3', { strategy: 'economie_moyens' }),
    ]);
    expect([...labels.values()]).toEqual(['Couverture', 'Priorité', 'Économie']);
  });

  it('numérote une stratégie relancée et signale une retouche', () => {
    const labels = columnLabels([
      proposal('1', { strategy: 'priorite' }),
      proposal('2', { strategy: 'economie_moyens', label: 'Économie de moyens (modifiée)' }),
      proposal('3', { strategy: 'priorite' }),
    ]);
    expect(labels.get('1')).toBe('Priorité 1');
    expect(labels.get('2')).toBe('Économie ✎');
    expect(labels.get('3')).toBe('Priorité 2');
  });
});
