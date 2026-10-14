import type { DroneModel, Mission, Weather } from '@aeris/shared';

/**
 * Météos préréglées pour la conduite (démo et entraînement). Les trois drones de référence
 * tiennent tous 12 m/s : c'est la pluie (seul le Matrice 4T est étanche) qui les départage.
 */
export interface MeteoPreset {
  id: 'pluie' | 'rafales' | 'calme';
  label: string;
  windMs: number;
  gustMs: number;
  precipitationMm: number;
}

export const METEO_PRESETS: MeteoPreset[] = [
  { id: 'pluie', label: 'Pluie', windMs: 6, gustMs: 9, precipitationMm: 0.4 },
  { id: 'rafales', label: 'Rafales fortes', windMs: 11, gustMs: 14, precipitationMm: 0 },
  { id: 'calme', label: 'Retour au calme', windMs: 4, gustMs: 6, precipitationMm: 0 },
];

/** Météo à envoyer : le préréglage, en gardant jour / nuit et température de la météo en cours. */
export function meteoDuPreset(
  p: MeteoPreset,
  actuelle?: Weather,
  maintenant = new Date(),
): Weather {
  return {
    windMs: p.windMs,
    gustMs: p.gustMs,
    precipitationMm: p.precipitationMm,
    temperatureC: actuelle?.temperatureC ?? 15,
    isDay: actuelle?.isDay ?? true,
    fetchedAt: maintenant.toISOString(),
    source: 'manuel',
  };
}

/**
 * Modèles cloués au sol par le vent ou la pluie (aperçu affiché avant d'envoyer). Même règle
 * que `flyability` de @aeris/weather pour le vent et la pluie ; le calcul qui fait foi reste
 * celui de l'API au recalcul.
 */
export function modelesAuSol(
  models: DroneModel[],
  w: Pick<Weather, 'windMs' | 'gustMs' | 'precipitationMm'>,
): DroneModel[] {
  return models.filter(
    (m) => w.gustMs > m.maxWindMs || w.windMs > m.maxWindMs || (w.precipitationMm > 0 && !m.rainOk),
  );
}

/** Centre approximatif de la zone de travail [lng, lat] (moyenne des sommets), pour la météo réelle. */
export function centreZone(mission: Pick<Mission, 'workArea'>): [number, number] {
  const ring = mission.workArea.coordinates[0] ?? [];
  if (ring.length === 0) return [0, 0];
  const lng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return [lng, lat];
}

/** « Matrice 4T : 43 km/h, étanche » : seuils à rappeler à côté des boutons. */
export function seuilModele(m: DroneModel): string {
  return `${m.name.replace(/^DJI /, '')} : ${Math.round(m.maxWindMs * 3.6)} km/h${m.rainOk ? ', étanche' : ''}`;
}
