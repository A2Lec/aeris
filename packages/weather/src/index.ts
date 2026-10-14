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

/** Météo courante via Open-Meteo (gratuit, sans compte ni clé). */
export const fetchWeather: WeatherProvider = async (lat, lng) => {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,is_day&wind_speed_unit=ms`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo a répondu ${res.status}`);
  const { current } = (await res.json()) as OpenMeteoCurrent;
  return {
    windMs: current.wind_speed_10m,
    gustMs: current.wind_gusts_10m,
    precipitationMm: current.precipitation,
    temperatureC: current.temperature_2m,
    isDay: current.is_day === 1,
    fetchedAt: new Date().toISOString(),
  };
};

/** Le modèle peut-il voler dans ces conditions ? Raisons lisibles pour l'opérateur. */
export function flyability(model: DroneModel, w: Weather): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (w.gustMs > model.maxWindMs) reasons.push(`rafales ${w.gustMs} m/s > ${model.maxWindMs} m/s`);
  if (w.precipitationMm > 0 && !model.rainOk) reasons.push('pluie, drone non étanche');
  if (w.temperatureC < model.minTempC || w.temperatureC > model.maxTempC) {
    reasons.push(`température ${w.temperatureC} °C hors plage`);
  }
  if (!w.isDay && !model.night) reasons.push('nuit, drone non équipé');
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
