import type { Assignment, MissionState, Proposal, Resource, Weather } from '@aeris/shared';
import { api } from '../../api/client';
import { availabilityEvents, type Project } from '../../components/project';

export interface ResumeChoices {
  /** Disponibilité de chaque couple, choisie par l'opérateur. */
  available: Record<string, boolean>;
  /** Météo importée ou saisie ; absente = celle relevée par l'API au lancement. */
  weather?: Weather;
}

/** Mission du projet recréée côté API, pour la retoucher avant la conduite ou la planifier. */
export async function openProject(project: Project): Promise<MissionState> {
  const { id: _id, ...input } = project.state.mission;
  return api.createMission(input);
}

/** Affectations enregistrées encore applicables : leur couple existe toujours. */
export function restoredAssignments(saved: Proposal, resources: Resource[]): Assignment[] {
  const ids = new Set(resources.map((r) => r.id));
  return saved.assignments.filter((a) => ids.has(a.resourceId));
}

/**
 * Reprise en conduite d'une mission rouverte (zones et moyens déjà retouchés), avec les
 * seules routes existantes : dispositif enregistré restauré → conduite lancée →
 * disponibilités et météo déclarées → recalcul (le solveur repart des positions en place),
 * laissé en attente de validation.
 */
export async function resumeInConduite(
  state: MissionState,
  saved: Proposal,
  choices: ResumeChoices,
  onStep: (step: string) => void,
): Promise<MissionState> {
  const { id, resources } = state.mission;

  onStep('Restauration du dispositif enregistré');
  const [proposal] = await api.solve(id, [saved.strategy]);
  if (!proposal) throw new Error('Le solveur n’a renvoyé aucune proposition.');
  await api.editProposal(id, proposal.id, restoredAssignments(saved, resources));

  onStep('Lancement de la conduite');
  await api.start(id, proposal.id);

  const events = availabilityEvents(resources, choices.available);
  if (choices.weather) events.push({ type: 'weather_update', weather: choices.weather });
  if (events.length) onStep('Prise en compte des moyens et de la météo');
  for (const ev of events) await api.sendEvent(id, ev);

  onStep('Optimisation avec les nouvelles contraintes');
  await api.recompute(id);
  return api.getMission(id);
}
