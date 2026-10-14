import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DroneModel, Weather } from '@aeris/shared';
import {
  DEFAULT_OFFLINE_WEATHER,
  clearWeatherCache,
  excludedByWeather,
  fetchWeather,
  flyability,
  isDaylight,
  isPhaseDay,
  setWeatherFallback,
  weatherForPhase,
} from './index';

const droneStandard: DroneModel = {
  id: 'mavic-3e',
  name: 'DJI Mavic 3 Enterprise',
  enduranceMin: 45,
  maxWindMs: 12,
  rainOk: false,
  minTempC: -10,
  maxTempC: 40,
  zoomX: 56,
  thermal: false,
  night: false,
};

const droneRobuste: DroneModel = {
  id: 'matrice-4t',
  name: 'DJI Matrice 4T',
  enduranceMin: 40,
  maxWindMs: 15,
  rainOk: true,
  minTempC: -20,
  maxTempC: 50,
  zoomX: 56,
  thermal: true,
  night: true,
};

const calmWeather: Weather = {
  windMs: 3,
  gustMs: 5,
  precipitationMm: 0,
  temperatureC: 20,
  isDay: true,
  fetchedAt: '2026-10-14T10:00:00Z',
  source: 'api',
};

describe('Critères de volabilité (flyability)', () => {
  it('autorise le vol en conditions calmes', () => {
    const res = flyability(droneStandard, calmWeather);
    expect(res.ok).toBe(true);
    expect(res.reasons).toHaveLength(0);
  });

  it('bloque si les rafales dépassent la limite', () => {
    const res = flyability(droneStandard, { ...calmWeather, gustMs: 14 });
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.includes('rafales 14 m/s > 12 m/s'))).toBe(true);
  });

  it('bloque si le vent continu dépasse la limite', () => {
    const res = flyability(droneStandard, { ...calmWeather, windMs: 13, gustMs: 12 });
    expect(res.ok).toBe(false);
    expect(res.reasons.some((r) => r.includes('vent 13 m/s > 12 m/s'))).toBe(true);
  });

  it('gère l’étanchéité à la pluie', () => {
    const rainy: Weather = { ...calmWeather, precipitationMm: 2 };
    expect(flyability(droneStandard, rainy).ok).toBe(false);
    expect(flyability(droneRobuste, rainy).ok).toBe(true);
  });

  it('gère les températures extrêmes', () => {
    const freeze: Weather = { ...calmWeather, temperatureC: -15 };
    const heat: Weather = { ...calmWeather, temperatureC: 45 };

    expect(flyability(droneStandard, freeze).ok).toBe(false);
    expect(flyability(droneRobuste, freeze).ok).toBe(true);

    expect(flyability(droneStandard, heat).ok).toBe(false);
    expect(flyability(droneRobuste, heat).ok).toBe(true);
  });

  it('gère le vol de nuit', () => {
    const nightWeather: Weather = { ...calmWeather, isDay: false };
    expect(flyability(droneStandard, nightWeather).ok).toBe(false);
    expect(flyability(droneRobuste, nightWeather).ok).toBe(true);
  });
});

describe('Filtrage des ressources (excludedByWeather)', () => {
  it('exclut uniquement les ressources dont le drone ne peut voler', () => {
    const resources = [
      { id: 'r1', pilotId: 'p1', droneModelId: 'mavic-3e', available: true },
      { id: 'r2', pilotId: 'p2', droneModelId: 'matrice-4t', available: true },
    ];
    const catalog = [droneStandard, droneRobuste];
    const rainy: Weather = { ...calmWeather, precipitationMm: 1 };

    const excluded = excludedByWeather(resources, catalog, rainy);
    expect(excluded).toHaveProperty('r1');
    expect(excluded).not.toHaveProperty('r2');
    expect(excluded.r1).toContain('pluie');
  });
});

describe('Résilience fetchWeather (cache, timeout, fallback)', () => {
  beforeEach(() => {
    clearWeatherCache();
    setWeatherFallback(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearWeatherCache();
    setWeatherFallback(undefined);
  });

  it('renvoie les données de l’API et les met en cache', async () => {
    const mockJson = {
      current: {
        temperature_2m: 21.5,
        precipitation: 0.1,
        wind_speed_10m: 4.2,
        wind_gusts_10m: 7.8,
        is_day: 1,
      },
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockJson),
    });
    vi.stubGlobal('fetch', mockFetch);

    const w1 = await fetchWeather(43.65, 1.25);
    expect(w1.temperatureC).toBe(21.5);
    expect(w1.windMs).toBe(4.2);
    expect(w1.gustMs).toBe(7.8);
    expect(w1.isDay).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Le second appel à la même position doit utiliser le cache sans rappeler fetch
    const w2 = await fetchWeather(43.65, 1.25);
    expect(w2.temperatureC).toBe(21.5);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('bascule sur la météo par défaut en mode hors-ligne sans crash', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('Pas de connexion internet')));

    const w = await fetchWeather(43.65, 1.25);
    expect(w.windMs).toBe(DEFAULT_OFFLINE_WEATHER.windMs);
    expect(w.isDay).toBe(DEFAULT_OFFLINE_WEATHER.isDay);
    expect(w.fetchedAt).toBeDefined();
    // L'opérateur doit savoir que ce n'est pas une vraie mesure.
    expect(w.source).toBe('repli');
  });

  it('permet de définir une météo de repli personnalisée', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('Network down')));
    const customFallback: Weather = {
      windMs: 9,
      gustMs: 14,
      precipitationMm: 3,
      temperatureC: 12,
      isDay: false,
      fetchedAt: '2026-10-14T12:00:00Z',
      source: 'api',
    };
    setWeatherFallback(customFallback);

    const w = await fetchWeather(43.65, 1.25);
    expect(w).toEqual(customFallback);
  });

  it('lève une erreur si le repli est explicitement désactivé (null)', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('Network down')));
    setWeatherFallback(null);

    await expect(fetchWeather(43.65, 1.25)).rejects.toThrow('Network down');
  });

  it('respecte setWeatherFallback(null) et lève une erreur même si le cache contient des entrées', async () => {
    // 1. Peupler le cache avec une première coordonnée
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          current: {
            temperature_2m: 15,
            precipitation: 0,
            wind_speed_10m: 2,
            wind_gusts_10m: 4,
            is_day: 1,
          },
        }),
    });
    vi.stubGlobal('fetch', mockFetch);
    await fetchWeather(43.6, 1.4);

    // 2. Désactiver le repli et simuler une coupure sur une autre position
    setWeatherFallback(null);
    vi.stubGlobal('fetch', () => Promise.reject(new Error('Connexion perdue')));

    await expect(fetchWeather(48.85, 2.35)).rejects.toThrow('Connexion perdue');
  });

  it('respecte setWeatherFallback(custom) même si le cache contient des entrées', async () => {
    // 1. Peupler le cache avec une première coordonnée
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          current: {
            temperature_2m: 15,
            precipitation: 0,
            wind_speed_10m: 2,
            wind_gusts_10m: 4,
            is_day: 1,
          },
        }),
    });
    vi.stubGlobal('fetch', mockFetch);
    await fetchWeather(43.6, 1.4);

    // 2. Définir un fallback personnalisé et simuler une coupure sur une autre position
    const custom: Weather = {
      windMs: 1,
      gustMs: 2,
      precipitationMm: 0,
      temperatureC: 22,
      isDay: true,
      fetchedAt: '2026-10-14T14:00:00Z',
      source: 'api',
    };
    setWeatherFallback(custom);
    vi.stubGlobal('fetch', () => Promise.reject(new Error('Coupure réseau')));

    const w = await fetchWeather(48.85, 2.35);
    expect(w).toEqual(custom);
  });
});

describe('Calcul astronomique et alternance Jour / Nuit par phase', () => {
  it('isDaylight calcule correctement le jour et la nuit à Toulouse', () => {
    // 14 Octobre 2026 à Toulouse (43.6, 1.4)
    const midi = new Date('2026-10-14T11:00:00Z'); // 13h locale -> plein jour
    const minuit = new Date('2026-10-14T23:00:00Z'); // 01h locale -> nuit noire

    expect(isDaylight(43.6, 1.4, midi)).toBe(true);
    expect(isDaylight(43.6, 1.4, minuit)).toBe(false);
  });

  it('isPhaseDay détermine le jour/nuit selon la période de la phase', () => {
    // Mission de 14h à 22h UTC avec 2 phases :
    // Phase 0 : 14h - 18h UTC -> Jour
    // Phase 1 : 18h - 22h UTC -> Nuit (milieu à 20h UTC / 22h local)
    const mission = {
      period: {
        start: '2026-10-14T14:00:00Z',
        end: '2026-10-14T22:00:00Z',
      },
      phaseCount: 2,
    };

    expect(isPhaseDay(mission, 0, 43.6, 1.4)).toBe(true);
    expect(isPhaseDay(mission, 1, 43.6, 1.4)).toBe(false);
  });

  it('isPhaseDay renvoie true par défaut si la mission n’a pas de période', () => {
    const mission = { phaseCount: 3 };
    expect(isPhaseDay(mission, 0)).toBe(true);
    expect(isPhaseDay(mission, 1)).toBe(true);
  });

  it('weatherForPhase adapte isDay et excludedByWeather filtre les drones en conséquence', () => {
    const mission = {
      period: {
        start: '2026-10-14T14:00:00Z',
        end: '2026-10-14T22:00:00Z',
      },
      phaseCount: 2,
    };
    const resources = [
      { id: 'r-standard', pilotId: 'p1', droneModelId: 'mavic-3e', available: true },
      { id: 'r-robuste', pilotId: 'p2', droneModelId: 'matrice-4t', available: true },
    ];
    const catalog = [droneStandard, droneRobuste];

    // Phase 0 (Jour) : aucun drone n'est exclu pour motif nocturne
    const wPhase0 = weatherForPhase(calmWeather, mission, 0, 43.6, 1.4);
    expect(wPhase0.isDay).toBe(true);
    const exclPhase0 = excludedByWeather(resources, catalog, wPhase0);
    expect(exclPhase0['r-standard']).toBeUndefined();
    expect(exclPhase0['r-robuste']).toBeUndefined();

    // Phase 1 (Nuit) : le drone standard est exclu, le robuste est autorisé
    const wPhase1 = weatherForPhase(calmWeather, mission, 1, 43.6, 1.4);
    expect(wPhase1.isDay).toBe(false);
    const exclPhase1 = excludedByWeather(resources, catalog, wPhase1);
    expect(exclPhase1['r-standard']).toContain('nuit, drone non équipé');
    expect(exclPhase1['r-robuste']).toBeUndefined();
  });
});
