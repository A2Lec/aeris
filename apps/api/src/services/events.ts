import type { LiveState, MissionEvent, MissionState } from '@aeris/shared';
import { metricsFor } from './pipeline';

/**
 * Applique un événement de conduite à l'état de la mission, puis recalcule les métriques.
 * Tout événement change la situation : un recalcul en attente, calculé avant, devient périmé
 * (il pourrait réengager un TP qui vient de tomber). On le retire ; l'opérateur relance.
 */
export function applyEvent(st: MissionState, live: LiveState, ev: MissionEvent): void {
  const { mission } = st;
  const setAvailable = (id: string, available: boolean) => {
    mission.resources = mission.resources.map((r) => (r.id === id ? { ...r, available } : r));
  };

  switch (ev.type) {
    case 'resource_unavailable':
      setAvailable(ev.resourceId, false);
      live.assignments = live.assignments.filter((a) => a.resourceId !== ev.resourceId);
      break;
    case 'resource_available':
      setAvailable(ev.resourceId, true);
      break;
    case 'resource_moved':
      live.assignments = live.assignments.map((a) =>
        a.resourceId === ev.resourceId ? { ...a, position: ev.position } : a,
      );
      break;
    case 'weather_update':
      live.weather = ev.weather;
      break;
    case 'priority_zone_added':
      mission.priorityZones = [...mission.priorityZones, ev.zone];
      break;
    case 'priority_zone_removed':
      mission.priorityZones = mission.priorityZones.filter((z) => z.id !== ev.zoneId);
      break;
    case 'phase_changed': {
      live.phase = Math.min(ev.phase, mission.phaseCount - 1);
      const proposal = st.proposals.find((p) => p.id === live.proposalId);
      const available = new Set(mission.resources.filter((r) => r.available).map((r) => r.id));
      live.assignments = (proposal?.assignments ?? []).filter(
        (a) => a.phase === live.phase && available.has(a.resourceId),
      );
      break;
    }
  }

  live.events.push({ at: new Date().toISOString(), event: ev });
  live.pendingRecompute = undefined;
  live.metrics = metricsFor(mission, live.phase, live.assignments);
}
