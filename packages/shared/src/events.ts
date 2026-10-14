import { z } from 'zod';
import { Assignment, Metrics, PriorityZone, Proposal, Weather } from './domain';
import { PointGeom } from './geojson';

/** Événements de conduite des opérations (injectés depuis le poste ou simulés en démo). */
export const MissionEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('resource_unavailable'), resourceId: z.string() }),
  z.object({ type: z.literal('resource_available'), resourceId: z.string() }),
  z.object({ type: z.literal('resource_moved'), resourceId: z.string(), position: PointGeom }),
  z.object({ type: z.literal('weather_update'), weather: Weather }),
  z.object({ type: z.literal('priority_zone_added'), zone: PriorityZone }),
  z.object({ type: z.literal('priority_zone_removed'), zoneId: z.string() }),
  z.object({ type: z.literal('phase_changed'), phase: z.number().int().min(0) }),
]);
export type MissionEvent = z.infer<typeof MissionEvent>;

export const LoggedEvent = z.object({ at: z.string(), event: MissionEvent });
export type LoggedEvent = z.infer<typeof LoggedEvent>;

/** État temps réel diffusé au poste par WebSocket. */
export const LiveState = z.object({
  phase: z.number().int().min(0),
  proposalId: z.string(),
  /** Positions réelles courantes (phase en cours). */
  assignments: z.array(Assignment),
  metrics: Metrics,
  events: z.array(LoggedEvent),
  weather: Weather.optional(),
  /** Proposition de recalcul en attente de validation par l'opérateur. */
  pendingRecompute: Proposal.optional(),
});
export type LiveState = z.infer<typeof LiveState>;
