import { describe, expect, it } from 'vitest';
import { trancheArrondie } from './index';

describe('trancheArrondie', () => {
  it('bornes au multiple de 5 m, tranche au moins aussi épaisse que demandé', () => {
    expect(trancheArrondie(10, 120, 27)).toEqual({ minM: 90, maxM: 120 });
    expect(trancheArrondie(10, 90, 27)).toEqual({ minM: 60, maxM: 90 });
    expect(trancheArrondie(10, 50, 20)).toEqual({ minM: 30, maxM: 50 });
  });

  it('plafond non multiple de 5 : arrondi vers le bas, jamais au-dessus', () => {
    expect(trancheArrondie(10, 48, 20)).toEqual({ minM: 25, maxM: 45 });
  });

  it('ne sort jamais de l’intervalle libre, quitte à garder des bornes non rondes', () => {
    const t = trancheArrondie(27, 48, 20);
    expect(t.minM).toBeGreaterThanOrEqual(27);
    expect(t.maxM).toBeLessThanOrEqual(48);
    expect(t.maxM - t.minM).toBeGreaterThanOrEqual(20);
  });
});
