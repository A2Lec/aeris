import { z } from 'zod';
import {
  DroneModel,
  Mission,
  MissionStatus,
  PilotRule,
  Proposal,
  Strategy,
  Assignment,
} from './domain';
import { LiveState } from './events';

export const MissionInput = Mission.omit({ id: true });
export type MissionInput = z.infer<typeof MissionInput>;

export const MissionState = z.object({
  mission: Mission,
  status: MissionStatus,
  proposals: z.array(Proposal),
  selectedProposalId: z.string().optional(),
  live: LiveState.optional(),
});
export type MissionState = z.infer<typeof MissionState>;

export const StatusRequest = z.object({ status: MissionStatus });

export const SolveRequest = z.object({
  strategies: z
    .array(Strategy)
    .min(1)
    .default(['couverture_globale', 'priorite', 'economie_moyens']),
  useWeather: z.boolean().default(true),
});
export type SolveRequest = z.infer<typeof SolveRequest>;

/** Proposition modifiée à la main (positions déplacées) : les métriques sont recalculées. */
export const ProposalEditRequest = z.object({ assignments: z.array(Assignment) });
export type ProposalEditRequest = z.infer<typeof ProposalEditRequest>;

export const AcceptRequest = z.object({ proposalId: z.string() });

export const Catalog = z.object({ drones: z.array(DroneModel), rules: z.array(PilotRule) });
export type Catalog = z.infer<typeof Catalog>;

export const WsMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('live'), live: LiveState }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type WsMessage = z.infer<typeof WsMessage>;

/** Chemins d'API : source unique pour le front et le back. */
export const API = {
  catalog: '/api/catalog',
  demoMission: '/api/demo-mission',
  missions: '/api/missions',
  mission: (id: string) => `/api/missions/${id}`,
  status: (id: string) => `/api/missions/${id}/status`,
  solve: (id: string) => `/api/missions/${id}/solve`,
  proposal: (id: string, pid: string) => `/api/missions/${id}/proposals/${pid}`,
  start: (id: string, pid: string) => `/api/missions/${id}/proposals/${pid}/start`,
  events: (id: string) => `/api/missions/${id}/events`,
  recompute: (id: string) => `/api/missions/${id}/recompute`,
  acceptRecompute: (id: string) => `/api/missions/${id}/recompute/accept`,
  liveWs: (id: string) => `/api/missions/${id}/live`,
  weather: (lat: number, lng: number) => `/api/weather?lat=${lat}&lng=${lng}`,
} as const;
