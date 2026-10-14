import { describe, expect, it } from 'vitest';
import type { DroneModel, Resource } from '@aeris/shared';
import { capableCount, maxRedundancy, redundancyWarning } from './redundancy';

const catalog = [
  { id: 'thermique', thermal: true, night: true, zoomX: 112 },
  { id: 'simple', thermal: false, night: false, zoomX: 4 },
] as DroneModel[];

const res = (id: string, droneModelId: string, available = true) =>
  ({ id, pilotId: id, droneModelId, available }) as Resource;

const mission = {
  maxDrones: 3,
  resources: [res('r1', 'thermique'), res('r2', 'simple'), res('r3', 'simple', false)],
};

describe('redondance saisie', () => {
  it("borne au nombre de drones de l'arrêté, au moins 1", () => {
    expect(maxRedundancy({ maxDrones: 5 })).toBe(5);
    expect(maxRedundancy({ maxDrones: 0 })).toBe(1);
  });

  it('ne compte que les couples disponibles et équipés', () => {
    expect(capableCount(mission, catalog, {})).toBe(2);
    expect(capableCount(mission, catalog, { thermal: true })).toBe(1);
  });

  it('se tait quand la demande est tenable', () => {
    expect(redundancyWarning(mission, catalog, { redundancy: 1, requires: {} })).toBeUndefined();
    expect(redundancyWarning(mission, catalog, { redundancy: 2, requires: {} })).toBeUndefined();
  });

  it('se tait sur les moyens tant que la flotte reste à dimensionner', () => {
    const vide = { maxDrones: 3, resources: [] };
    expect(redundancyWarning(vide, catalog, { redundancy: 2, requires: {} })).toBeUndefined();
    const auto = { maxDrones: 3, resources: [res('auto-1', 'simple')] };
    expect(redundancyWarning(auto, catalog, { redundancy: 2, requires: {} })).toBeUndefined();
    expect(redundancyWarning(vide, catalog, { redundancy: 4, requires: {} })).toMatch(/arrêté/);
  });

  it("prévient quand l'arrêté ou les moyens ne suffisent pas", () => {
    expect(redundancyWarning(mission, catalog, { redundancy: 4, requires: {} })).toMatch(
      /arrêté en autorise 3/,
    );
    expect(
      redundancyWarning(mission, catalog, { redundancy: 2, requires: { thermal: true } }),
    ).toMatch(/1 couple\(s\) disponible\(s\) équipé/);
  });
});
