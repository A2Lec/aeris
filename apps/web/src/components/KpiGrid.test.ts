import { describe, expect, it } from 'vitest';
import type { Metrics, ZoneCoverage } from '@aeris/shared';
import { redondanceAAfficher, zonesTriees } from './KpiGrid';

const zone = (zoneId: string, level: number, served: number): ZoneCoverage => ({
  zoneId,
  name: zoneId,
  level,
  cells: 10,
  areaM2: 1e5,
  coverage: served,
  served,
});

describe('KpiGrid : zones et redondance', () => {
  it('zones de la moins servie à la plus servie, priorité la plus haute d’abord à égalité', () => {
    const ordre = zonesTriees([zone('a', 1, 0.9), zone('b', 3, 0.5), zone('c', 2, 0.5)]);
    expect(ordre.map((z) => z.zoneId)).toEqual(['b', 'c', 'a']);
  });

  it('redondance affichée seulement si une zone exige plusieurs drones', () => {
    const m = (redundancyMet?: number, usefulOverlap?: number) =>
      ({ redundancyMet, usefulOverlap }) as Metrics;
    expect(redondanceAAfficher(m())).toBe(false);
    expect(redondanceAAfficher(m(1, 0))).toBe(false); // aucune zone exigeante
    expect(redondanceAAfficher(m(0.4, 0))).toBe(true); // il manque des drones
    expect(redondanceAAfficher(m(1, 0.05))).toBe(true); // atteinte : chevauchement voulu
  });
});
