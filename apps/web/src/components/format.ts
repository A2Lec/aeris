import type { Weather } from '@aeris/shared';

/** Formats d'affichage partagés par les panneaux (fonctions pures, testées). */

export const pct = (x: number) => `${Math.round(x * 100)} %`;

export const hectares = (m2: number) => `${Math.round(m2 / 1e4)} ha`;

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Créneau horaire « 14:00 – 16:00 », ou « Permanent » sans créneau. */
export function formatSlot(slot?: { start: string; end: string }): string {
  return slot ? `${time(slot.start)} – ${time(slot.end)}` : 'Permanent';
}

const kmh = (ms: number) => Math.round(ms * 3.6);

export interface WeatherSummary {
  wind: string;
  conditions: string;
  /** Avertissement quand la météo n'est pas une mesure réelle. */
  caveat?: string;
}

/** Météo lisible pour le bandeau : vent en km/h, pluie, jour ou nuit, origine des données. */
export function summarizeWeather(w: Weather): WeatherSummary {
  const conditions = [
    w.precipitationMm > 0 ? `pluie ${w.precipitationMm} mm` : 'sec',
    w.isDay ? 'jour' : 'nuit',
    `${Math.round(w.temperatureC)} °C`,
  ].join(', ');
  const caveat =
    w.source === 'repli'
      ? 'Valeurs par défaut, aucune donnée réelle'
      : w.source === 'cache'
        ? 'Dernière météo connue (réseau coupé)'
        : w.source === 'manuel'
          ? 'Saisie par l’opérateur'
          : undefined;
  return { wind: `${kmh(w.windMs)} km/h, rafales ${kmh(w.gustMs)}`, conditions, caveat };
}
