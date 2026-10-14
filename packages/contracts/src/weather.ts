import { describe, expect, it } from 'vitest';
import { demoMission, drones } from '@aeris/data';
import type { Weather, WeatherFilter } from '@aeris/shared';

const calm: Weather = {
  windMs: 2,
  gustMs: 4,
  precipitationMm: 0,
  temperatureC: 15,
  isDay: true,
  fetchedAt: '2026-10-14T10:00:00Z',
};

/** Contrat de `excludedByWeather` : exclusions justes, toujours justifiées. */
export function weatherFilterContract(filter: WeatherFilter) {
  describe('Contrat WeatherFilter', () => {
    const resources = demoMission.resources;
    const model = (id: string) =>
      drones.find((d) => d.id === resources.find((r) => r.id === id)!.droneModelId)!;
    const run = (w: Partial<Weather>) => filter(resources, drones, { ...calm, ...w });
    const expectReasons = (out: Record<string, string>) => {
      for (const [id, reason] of Object.entries(out)) {
        expect(
          resources.some((r) => r.id === id),
          `couple inconnu ${id}`,
        ).toBe(true);
        expect(reason.trim().length, `raison vide pour ${id}`).toBeGreaterThan(0);
      }
    };

    it('temps calme de jour : personne n’est exclu', () => {
      expect(run({})).toEqual({});
    });

    it('tempête : tout le monde est exclu, avec une raison', () => {
      const out = run({ windMs: 40, gustMs: 50 });
      expectReasons(out);
      expect(Object.keys(out).sort()).toEqual(resources.map((r) => r.id).sort());
    });

    it('rafales : exclut exactement les drones dont le vent max est dépassé', () => {
      const gust = 11;
      const out = run({ windMs: 8, gustMs: gust });
      expectReasons(out);
      for (const r of resources) expect(r.id in out, r.id).toBe(gust > model(r.id).maxWindMs);
    });

    it('pluie : exclut exactement les drones non étanches', () => {
      const out = run({ precipitationMm: 2 });
      expectReasons(out);
      for (const r of resources) expect(r.id in out, r.id).toBe(!model(r.id).rainOk);
    });

    it('nuit : exclut exactement les drones non équipés', () => {
      const out = run({ isDay: false });
      expectReasons(out);
      for (const r of resources) expect(r.id in out, r.id).toBe(!model(r.id).night);
    });

    it('grand froid : exclut les drones hors plage de température', () => {
      const out = run({ temperatureC: -15 });
      expectReasons(out);
      for (const r of resources) expect(r.id in out, r.id).toBe(-15 < model(r.id).minTempC);
    });
  });
}
