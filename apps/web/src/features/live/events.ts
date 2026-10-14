import type { Mission, MissionEvent } from '@aeris/shared';

const kmh = (ms: number) => Math.round(ms * 3.6);

/** Phrase lisible pour le journal de conduite (au lieu du type technique de l'événement). */
export function describeEvent(ev: MissionEvent, mission: Mission): string {
  switch (ev.type) {
    case 'resource_unavailable':
      return `${ev.resourceId} déclaré indisponible`;
    case 'resource_available':
      return `${ev.resourceId} de nouveau disponible`;
    case 'resource_moved':
      return `${ev.resourceId} déplacé`;
    case 'weather_update':
      return `Météo : vent ${kmh(ev.weather.windMs)} km/h, rafales ${kmh(ev.weather.gustMs)}${
        ev.weather.precipitationMm > 0 ? ', pluie' : ''
      }`;
    case 'priority_zone_added':
      return `Zone prioritaire ajoutée : ${ev.zone.name} (priorité ${ev.zone.level})`;
    case 'priority_zone_removed': {
      const zone = mission.priorityZones.find((z) => z.id === ev.zoneId);
      return `Zone prioritaire retirée${zone ? ` : ${zone.name}` : ''}`;
    }
    case 'phase_changed':
      return `Passage en phase ${ev.phase + 1}`;
  }
}
