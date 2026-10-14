import type { DroneModel, Weather, WeatherFilter, WeatherProvider } from '@aeris/shared';

interface OpenMeteoCurrent {
  current: {
    temperature_2m: number;
    precipitation: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    is_day: number;
  };
}

/**
 * Météo par défaut de secours en mode hors-ligne pour la résilience en démo.
 * `source: 'repli'` : ce n'est PAS une mesure, l'interface doit le signaler à l'opérateur.
 */
export const DEFAULT_OFFLINE_WEATHER: Weather = {
  windMs: 3.5,
  gustMs: 6.0,
  precipitationMm: 0,
  temperatureC: 18,
  isDay: true,
  fetchedAt: '2026-10-14T08:00:00.000Z',
  source: 'repli',
};

/** Durée de validité du cache météo en mémoire (10 minutes). */
export const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
/** Timeout de la requête HTTP Open-Meteo (4 secondes). */
export const WEATHER_FETCH_TIMEOUT_MS = 4000;

interface CacheEntry {
  weather: Weather;
  cachedAt: number;
}

const weatherCache = new Map<string, CacheEntry>();
let fallbackWeatherOverride: Weather | null | undefined = undefined;

/** Permet d'injecter ou désactiver (null) une météo de repli pour les tests ou la démo. */
export function setWeatherFallback(fallback: Weather | null | undefined): void {
  fallbackWeatherOverride = fallback;
}

/** Vide le cache météo en mémoire. */
export function clearWeatherCache(): void {
  weatherCache.clear();
}

/**
 * Météo courante via Open-Meteo (gratuit, sans compte ni clé).
 * Intègre un timeout strict, un cache en mémoire et un repli hors-ligne en cas de coupure réseau.
 */
export const fetchWeather: WeatherProvider = async (lat, lng) => {
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const now = Date.now();
  const cached = weatherCache.get(cacheKey);

  // Si une entrée en cache est encore fraîche, on la réutilise immédiatement
  if (cached && now - cached.cachedAt < WEATHER_CACHE_TTL_MS) {
    return cached.weather;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,is_day&wind_speed_unit=ms`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Open-Meteo a répondu ${res.status}`);
    const { current } = (await res.json()) as OpenMeteoCurrent;
    const weather: Weather = {
      windMs: current.wind_speed_10m,
      gustMs: current.wind_gusts_10m,
      precipitationMm: current.precipitation,
      temperatureC: current.temperature_2m,
      isDay: current.is_day === 1,
      fetchedAt: new Date().toISOString(),
      source: 'api',
    };
    weatherCache.set(cacheKey, { weather, cachedAt: now });
    return weather;
  } catch (err) {
    // 1. Repli configuré explicitement (ou re-throw si configuré à null pour tests/démo stricte)
    if (fallbackWeatherOverride !== undefined) {
      if (fallbackWeatherOverride === null) throw err;
      return fallbackWeatherOverride;
    }
    // 2. Repli sur le cache de cette zone (même expiré) : `fetchedAt` garde l'heure de la mesure
    if (cached) {
      return { ...cached.weather, source: 'cache' };
    }
    // 3. Météo par défaut pour résister aux coupures réseau en démo, marquée comme telle.
    // (Pas de repli sur le cache d'une AUTRE zone : ce serait présenter la météo d'ailleurs.)
    return DEFAULT_OFFLINE_WEATHER;
  }
};

/** Le modèle peut-il voler dans ces conditions ? Raisons lisibles pour l'opérateur. */
export function flyability(model: DroneModel, w: Weather): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (w.gustMs > model.maxWindMs) {
    reasons.push(`rafales ${w.gustMs} m/s > ${model.maxWindMs} m/s`);
  }
  if (w.windMs > model.maxWindMs) {
    reasons.push(`vent ${w.windMs} m/s > ${model.maxWindMs} m/s`);
  }
  if (w.precipitationMm > 0 && !model.rainOk) {
    reasons.push('pluie, drone non étanche');
  }
  if (w.temperatureC < model.minTempC || w.temperatureC > model.maxTempC) {
    reasons.push(`température ${w.temperatureC} °C hors plage`);
  }
  if (!w.isDay && !model.night) {
    reasons.push('nuit, drone non équipé');
  }
  return { ok: reasons.length === 0, reasons };
}

/** Couples à exclure du calcul à cause de la météo : { resourceId: raison }. */
export const excludedByWeather: WeatherFilter = (resources, catalog, w) => {
  const out: Record<string, string> = {};
  for (const r of resources) {
    const model = catalog.find((m) => m.id === r.droneModelId);
    if (!model) continue;
    const { ok, reasons } = flyability(model, w);
    if (!ok) out[r.id] = `météo (${reasons.join(', ')})`;
  }
  return out;
};
