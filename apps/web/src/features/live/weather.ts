import type { DroneModel, PolygonGeom, Weather as WeatherT } from '@aeris/shared';
import { api } from '../../api/client';
import { centreZone } from './meteo';

/** Météo actuelle au centre de la zone, relevée par l'API (Open-Meteo, cache, repli). */
export async function importWeather(area: PolygonGeom): Promise<WeatherT> {
  const [lng, lat] = centreZone({ workArea: area });
  try {
    return await api.weather(Number(lat.toFixed(4)), Number(lng.toFixed(4)));
  } catch {
    throw new Error('Météo indisponible : saisissez les valeurs relevées sur place.');
  }
}

/** Valeurs de départ d'une saisie manuelle, sans relevé. */
export const MANUAL_WEATHER: WeatherT = {
  windMs: 3,
  gustMs: 5,
  precipitationMm: 0,
  temperatureC: 15,
  isDay: true,
  fetchedAt: new Date(0).toISOString(),
  source: 'manuel',
};

/** Correction de l'opérateur : la météo devient une saisie manuelle, datée de maintenant. */
export function editWeather(w: WeatherT, patch: Partial<WeatherT>, now = new Date()): WeatherT {
  return { ...w, ...patch, source: 'manuel', fetchedAt: now.toISOString() };
}

/**
 * Limites d'un modèle de drone dépassées par cette météo, en clair. Indicatif : c'est le
 * calcul côté serveur qui écarte réellement les drones.
 */
export function weatherLimits(drone: DroneModel, w: WeatherT): string[] {
  const limits: string[] = [];
  if (Math.max(w.windMs, w.gustMs) > drone.maxWindMs) limits.push('vent trop fort');
  if (w.precipitationMm > 0 && !drone.rainOk) limits.push('pluie');
  if (w.temperatureC < drone.minTempC || w.temperatureC > drone.maxTempC)
    limits.push('température');
  if (!w.isDay && !drone.night) limits.push('vol de nuit');
  return limits;
}
