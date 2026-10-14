import { phaseWindow, type Mission } from '@aeris/shared';

/**
 * Plages horaires des phases : la période de l'intervention (début → fin) est découpée en
 * phases de même durée (phaseWindow, @aeris/shared). L'API en déduit le jour ou la nuit de
 * chaque phase pour la météo ; le front l'affiche avec le même calcul solaire.
 */

/** Valeur d'un champ datetime-local (heure locale du poste) pour une date ISO. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Date ISO d'un champ datetime-local ; undefined si la saisie est incomplète. */
export function fromLocalInput(value: string): string | undefined {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

/**
 * Soleil au-dessus du seuil de nuit aéronautique (-4°). Même calcul que `isDaylight` de
 * @aeris/weather (P4), que le front ne peut pas importer : à garder identique.
 */
export function isDaylight(lat: number, lng: number, date: Date): boolean {
  const rad = Math.PI / 180;
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(Date.UTC(date.getUTCFullYear(), 0, 1)).getTime()) / 86400000,
  );
  const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * rad) * rad;
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const solarTime = (utcHours + lng / 15 + 24) % 24;
  const hourAngle = (solarTime - 12) * 15 * rad;
  const sinAltitude =
    Math.sin(lat * rad) * Math.sin(declination) +
    Math.cos(lat * rad) * Math.cos(declination) * Math.cos(hourAngle);
  return Math.asin(sinAltitude) / rad > -4;
}

export interface PhaseSlot {
  phase: number;
  start: string;
  end: string;
  /** Jour ou nuit au milieu de la phase (règle de l'API). */
  day: boolean;
}

/** Créneau et jour/nuit de chaque phase ; vide sans période valide. */
export function phaseSlots(
  mission: Pick<Mission, 'period' | 'phaseCount'> & Partial<Pick<Mission, 'phaseDurationsMin'>>,
  lat: number,
  lng: number,
): PhaseSlot[] {
  return [...Array(mission.phaseCount).keys()].flatMap((phase) => {
    const w = phaseWindow(mission, phase);
    if (!w) return [];
    const mid = new Date((Date.parse(w.start) + Date.parse(w.end)) / 2);
    return [{ phase, start: w.start, end: w.end, day: isDaylight(lat, lng, mid) }];
  });
}

/** « mar. 14 oct., 18:00 » ou « 18:00 » si c'est le même jour que `ref`. */
export function formatSlotTime(iso: string, ref?: string): string {
  const d = new Date(iso);
  const sameDay = ref && new Date(ref).toDateString() === d.toDateString();
  return d.toLocaleString('fr-FR', {
    ...(sameDay ? {} : { weekday: 'short', day: 'numeric', month: 'short' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Durée proposée pour une nouvelle phase, en minutes. */
export const DEFAULT_PHASE_MIN = 240;

/** Durée de chaque phase en minutes : celles choisies, sinon le découpage égal de la période. */
export function phaseDurations(
  mission: Pick<Mission, 'period' | 'phaseCount'> & Partial<Pick<Mission, 'phaseDurationsMin'>>,
): number[] {
  const n = mission.phaseCount;
  if (mission.phaseDurationsMin?.length === n) return mission.phaseDurationsMin;
  if (!mission.period) return Array(n).fill(DEFAULT_PHASE_MIN);
  const total = (Date.parse(mission.period.end) - Date.parse(mission.period.start)) / 60_000;
  return Number.isFinite(total) && total > 0
    ? Array(n).fill(Math.round(total / n))
    : Array(n).fill(DEFAULT_PHASE_MIN);
}

/** Durées ajustées à un nouveau nombre de phases : on garde les premières, on complète. */
export function resizeDurations(durations: number[], count: number): number[] {
  const last = durations.at(-1) ?? DEFAULT_PHASE_MIN;
  return [...durations.slice(0, count), ...Array(Math.max(0, count - durations.length)).fill(last)];
}

/** Période et durées enregistrées : la fin de l'intervention suit la somme des phases. */
export function withSchedule(
  startIso: string,
  durations: number[],
): Pick<Mission, 'period' | 'phaseDurationsMin'> {
  const total = durations.reduce((s, d) => s + d, 0);
  return {
    period: {
      start: startIso,
      end: new Date(Date.parse(startIso) + total * 60_000).toISOString(),
    },
    phaseDurationsMin: durations,
  };
}

/** « 4 h », « 1 h 30 », « 45 min ». */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
