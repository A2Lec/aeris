import {
  meetsRequirement,
  type DroneModel,
  type MissionInput,
  type Requirement,
} from '@aeris/shared';

/** Borne haute du nombre de drones voulus sur une zone : l'arrêté, au moins 1. */
export function maxRedundancy(mission: Pick<MissionInput, 'maxDrones'>): number {
  return Math.max(1, mission.maxDrones);
}

/**
 * Couples disponibles dont le drone a les capacités exigées par la zone. Majorant : la portée
 * et les zones limites ne sont pas vérifiées ici, le solveur dira s'il en manque.
 */
export function capableCount(
  mission: Pick<MissionInput, 'resources'>,
  catalog: DroneModel[],
  requires: Requirement,
): number {
  const models = new Map(catalog.map((m) => [m.id, m]));
  return mission.resources.filter((r) => {
    const m = models.get(r.droneModelId);
    return r.available && !!m && meetsRequirement(m, requires);
  }).length;
}

/**
 * Moyens à dimensionner par le solveur au calcul (aucun couple saisi, ou seulement ceux qu'il a
 * générés : même préfixe que `SIZING_PREFIX` dans packages/solver/src/sizing.ts).
 */
export function fleetToBeSized(mission: Pick<MissionInput, 'resources'>): boolean {
  return mission.resources.every((r) => r.id.startsWith('auto-'));
}

/** Avertissement si la redondance demandée ne peut pas être tenue, avant tout calcul. */
export function redundancyWarning(
  mission: Pick<MissionInput, 'maxDrones' | 'resources'>,
  catalog: DroneModel[],
  zone: { redundancy: number; requires: Requirement },
): string | undefined {
  if (zone.redundancy <= 1) return undefined;
  if (zone.redundancy > mission.maxDrones)
    return `${zone.redundancy} drones voulus, l’arrêté en autorise ${mission.maxDrones}.`;
  if (fleetToBeSized(mission)) return undefined;
  const capable = capableCount(mission, catalog, zone.requires);
  if (zone.redundancy > capable) {
    const equipes = Object.keys(zone.requires).length > 0 ? ' équipé(s) pour la zone' : '';
    return `${zone.redundancy} drones voulus, ${capable} couple(s) disponible(s)${equipes}.`;
  }
  return undefined;
}
