import type { Catalog, Mission } from '@aeris/shared';

export function resourceLabel(mission: Mission, resourceId: string, catalog?: Catalog): string {
  const resource = mission.resources.find((item) => item.id === resourceId);
  if (!resource) return `Couple inconnu (${resourceId})`;

  const pilot = mission.pilots.find((item) => item.id === resource.pilotId);
  const pilotLabel = pilot ? `${pilot.name} (${pilot.level})` : 'Télépilote inconnu';
  const droneLabel =
    catalog?.drones.find((item) => item.id === resource.droneModelId)?.name ??
    resource.droneModelId;
  return `${pilotLabel} — ${droneLabel}`;
}
