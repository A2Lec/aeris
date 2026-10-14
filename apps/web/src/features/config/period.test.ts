import { describe, expect, it } from 'vitest';
import { fromLocalInput, isDaylight, phaseSlots, toLocalInput } from './period';

// Bouconne (démo) : 43,65° N, 1,23° E.
const LAT = 43.65;
const LNG = 1.23;

describe('plages horaires des phases', () => {
  it('relit un champ datetime-local à l’identique', () => {
    const iso = fromLocalInput('2026-10-14T18:30')!;
    expect(toLocalInput(iso)).toBe('2026-10-14T18:30');
    expect(fromLocalInput('')).toBeUndefined();
  });

  it('jour à midi, nuit à minuit (heure solaire)', () => {
    expect(isDaylight(LAT, LNG, new Date('2026-10-14T12:00:00Z'))).toBe(true);
    expect(isDaylight(LAT, LNG, new Date('2026-10-14T23:00:00Z'))).toBe(false);
  });

  it('découpe la période en phases égales, avec le jour ou la nuit de chacune', () => {
    const slots = phaseSlots(
      {
        phaseCount: 3,
        period: { start: '2026-10-14T08:00:00.000Z', end: '2026-10-15T02:00:00.000Z' },
      },
      LAT,
      LNG,
    );
    expect(slots.map((s) => [s.start, s.end])).toEqual([
      ['2026-10-14T08:00:00.000Z', '2026-10-14T14:00:00.000Z'],
      ['2026-10-14T14:00:00.000Z', '2026-10-14T20:00:00.000Z'],
      ['2026-10-14T20:00:00.000Z', '2026-10-15T02:00:00.000Z'],
    ]);
    expect(slots.map((s) => s.day)).toEqual([true, true, false]);
  });

  it('aucun créneau sans période ou avec une période invalide', () => {
    expect(phaseSlots({ phaseCount: 2 }, LAT, LNG)).toEqual([]);
    expect(
      phaseSlots(
        { phaseCount: 2, period: { start: '2026-10-14T10:00:00Z', end: '2026-10-14T08:00:00Z' } },
        LAT,
        LNG,
      ),
    ).toEqual([]);
  });
});
