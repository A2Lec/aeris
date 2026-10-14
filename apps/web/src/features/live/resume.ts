import type { MissionInput, MissionState } from '@aeris/shared';
import { api } from '../../api/client';
import { availabilityEvents, retainedProposal, type Project } from '../../components/project';

export interface ResumeChoices {
  /** Disponibilité de chaque couple, choisie par l'opérateur. */
  available: Record<string, boolean>;
  /** Nombre maximal de drones de l'arrêté (il peut avoir changé). */
  maxDrones: number;
}

/**
 * Reprise d'un projet en conduite, avec les seules routes existantes :
 * mission recréée → dispositif enregistré restauré → conduite lancée → disponibilités
 * déclarées → recalcul (le solveur repart des positions en place) en attente de validation.
 */
export async function resumeInConduite(
  project: Project,
  choices: ResumeChoices,
  onStep: (step: string) => void,
): Promise<MissionState> {
  const saved = retainedProposal(project);
  if (!saved)
    throw new Error('Ce projet n’a pas encore de dispositif : ouvrez-le en planification.');
  const { id: _id, ...input } = project.state.mission;

  onStep('Création de la mission');
  const mission: MissionInput = { ...input, maxDrones: choices.maxDrones };
  const created = await api.createMission(mission);
  const id = created.mission.id;

  onStep('Restauration du dispositif enregistré');
  const [proposal] = await api.solve(id, [saved.strategy]);
  if (!proposal) throw new Error('Le solveur n’a renvoyé aucune proposition.');
  await api.editProposal(id, proposal.id, saved.assignments);

  onStep('Lancement de la conduite');
  await api.start(id, proposal.id);

  const events = availabilityEvents(created.mission.resources, choices.available);
  if (events.length) onStep('Prise en compte des pilotes et drones disponibles');
  for (const ev of events) await api.sendEvent(id, ev);

  onStep('Recalcul du dispositif');
  await api.recompute(id);
  return api.getMission(id);
}

/** Ouverture d'un projet en planification : la mission recréée, à retoucher puis calculer. */
export async function openInPlanning(project: Project): Promise<MissionState> {
  const { id: _id, ...input } = project.state.mission;
  return api.createMission(input);
}
