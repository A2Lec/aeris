import { z } from 'zod';
import { MissionState, type MissionEvent, type Proposal, type Resource } from '@aeris/shared';

/**
 * Projet enregistré : fichier JSON qui garde la mission, ses propositions et le dispositif
 * retenu. L'API ne conserve rien entre deux redémarrages : le fichier fait foi.
 */
export const PROJECT_FORMAT = 'aeris-projet';

const ProjectFile = z.object({
  format: z.literal(PROJECT_FORMAT),
  version: z.literal(1),
  savedAt: z.string(),
  state: MissionState,
});
export type Project = z.infer<typeof ProjectFile>;

/**
 * Projet à enregistrer. En conduite, le dispositif retenu prend les positions réelles de la
 * phase en cours (recalculs validés, déplacements), pour reprendre là où on s'est arrêté.
 */
export function toProject(state: MissionState, now = new Date()): Project {
  const live = state.live;
  const proposals = live
    ? state.proposals.map((p) =>
        p.id === live.proposalId
          ? {
              ...p,
              assignments: [
                ...p.assignments.filter((a) => a.phase !== live.phase),
                ...live.assignments,
              ],
            }
          : p,
      )
    : state.proposals;
  return {
    format: PROJECT_FORMAT,
    version: 1,
    savedAt: now.toISOString(),
    state: { ...state, proposals, live: undefined },
  };
}

export const projectFileName = (p: Project) =>
  `${
    p.state.mission.name
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '') || 'mission'
  }.aeris.json`;

/** Lit un fichier de projet ; l'erreur dit ce qui ne va pas, en clair. */
export function parseProject(text: string): { project?: Project; error?: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: 'Ce fichier n’est pas un projet Aeris : son contenu n’est pas du JSON.' };
  }
  if ((json as { format?: unknown })?.format !== PROJECT_FORMAT)
    return { error: 'Ce fichier n’est pas un projet Aeris enregistré depuis l’application.' };
  const res = ProjectFile.safeParse(json);
  if (!res.success)
    return { error: 'Ce projet est incomplet ou provient d’une version incompatible d’Aeris.' };
  return { project: res.data };
}

/** Dispositif retenu du projet : proposition validée, sinon la première. */
export function retainedProposal(p: Project): Proposal | undefined {
  const { proposals, selectedProposalId, live } = p.state;
  const id = live?.proposalId ?? selectedProposalId;
  return proposals.find((x) => x.id === id) ?? proposals[0];
}

/** Événements de conduite qui traduisent les disponibilités choisies par l'opérateur. */
export function availabilityEvents(
  resources: Resource[],
  available: Record<string, boolean>,
): MissionEvent[] {
  return resources.flatMap((r): MissionEvent[] => {
    const wanted = available[r.id] ?? r.available;
    if (wanted === r.available) return [];
    return [{ type: wanted ? 'resource_available' : 'resource_unavailable', resourceId: r.id }];
  });
}
