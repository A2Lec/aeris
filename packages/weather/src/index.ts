import {
  phaseWindow,
  type DroneModel,
  type Mission,
  type Weather,
  type WeatherFilter,
  type WeatherProvider,
} from '@aeris/shared';

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

/**
 * Calcule si le soleil est au-dessus du seuil de nuit aéronautique.
 * En France, la nuit aéronautique commence quand le soleil descend à -4° sous l'horizon
 * (environ 30 minutes après le coucher du soleil).
 */
export function isDaylight(lat: number, lng: number, date: Date): boolean {
  const rad = Math.PI / 180;
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(Date.UTC(date.getUTCFullYear(), 0, 1)).getTime()) / 86400000,
  );
  // Déclinaison solaire approximative de Cooper (1969)
  const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * rad) * rad;
  // Temps solaire moyen basé sur l'heure UTC et la longitude (+4 min par degré Est)
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const solarTime = (utcHours + lng / 15 + 24) % 24;
  const hourAngle = (solarTime - 12) * 15 * rad;

  const sinAltitude =
    Math.sin(lat * rad) * Math.sin(declination) +
    Math.cos(lat * rad) * Math.cos(declination) * Math.cos(hourAngle);
  const altitudeDeg = Math.asin(sinAltitude) / rad;

  // Seuil de nuit aéronautique (-4° sous l'horizon)
  return altitudeDeg > -4;
}

/**
 * Détermine si une phase se déroule de jour ou de nuit selon la période déclarée de la mission.
 * Si aucune période n'est déclarée, le jour est retenu par défaut.
 */
export function isPhaseDay(
  mission: Pick<Mission, 'period' | 'phaseCount'>,
  phase: number,
  lat = 43.6,
  lng = 1.4,
): boolean {
  const window = phaseWindow(mission, phase);
  if (!window) return true;
  const startMs = Date.parse(window.start);
  const endMs = Date.parse(window.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return true;
  // On évalue la luminosité au milieu de la phase
  const midDate = new Date((startMs + endMs) / 2);
  return isDaylight(lat, lng, midDate);
}

/**
 * Adapte les conditions météo pour une phase spécifique de la mission :
 * le statut `isDay` est déterminé en fonction de l'horaire réel de la phase (Jour ou Nuit).
 */
export function weatherForPhase(
  baseWeather: Weather,
  mission: Pick<Mission, 'period' | 'phaseCount'>,
  phase: number,
  lat = 43.6,
  lng = 1.4,
): Weather {
  return {
    ...baseWeather,
    isDay: isPhaseDay(mission, phase, lat, lng),
  };
}
