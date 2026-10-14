import { describe, expect, it } from 'vitest';
import type { PriorityZone } from '@aeris/shared';
import { togglePhase, withPhaseCount, zonePhases } from './phases';

const zone = (phases?: number[]): PriorityZone =>
  ({
    id: 'z',
    name: 'Zone',
    level: 2,
    geometry: { type: 'Polygon', coordinates: [] },
    requires: {},
    redundancy: 1,
    phases,
  }) as PriorityZone;

describe('phases des zones prioritaires', () => {
  it('une zone sans liste est active dans toutes les phases', () => {
    expect(zonePhases(zone(), 3)).toEqual([0, 1, 2]);
    expect(zonePhases(zone([1, 4]), 3)).toEqual([1]);
  });

  it('coche et décoche une phase, sans jamais vider la zone', () => {
    expect(togglePhase(zone(), 1, false, 3).phases).toEqual([0, 2]);
    expect(togglePhase(zone([0]), 2, true, 3).phases).toEqual([0, 2]);
    expect(togglePhase(zone([0, 1]), 2, true, 3).phases).toBeUndefined();
    expect(togglePhase(zone([1]), 1, false, 3).phases).toEqual([1]);
  });

  it('adapte les zones à un nouveau nombre de phases', () => {
    const [a, b, c] = withPhaseCount([zone(), zone([2]), zone([0, 2])], 2);
    expect(a.phases).toBeUndefined();
    expect(b.phases).toEqual([0]);
    expect(c.phases).toEqual([0]);
  });
});
