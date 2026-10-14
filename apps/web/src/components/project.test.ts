import { describe, expect, it } from 'vitest';
import { MissionState } from '@aeris/shared';
import snapshot from '../api/mocks/snapshot.json';
import {
  availabilityEvents,
  parseProject,
  projectFileName,
  retainedProposal,
  toProject,
} from './project';

const started = MissionState.parse(snapshot.started);
const withProposals = MissionState.parse({ ...snapshot.created, proposals: snapshot.proposals });

describe('projet enregistré', () => {
  it('se relit à l’identique', () => {
    const project = toProject(withProposals, new Date('2026-10-14T15:00:00Z'));
    const { project: read, error } = parseProject(JSON.stringify(project));
    expect(error).toBeUndefined();
    expect(read).toEqual(project);
    expect(read?.savedAt).toBe('2026-10-14T15:00:00.000Z');
  });

  it('en conduite, garde les positions réelles de la phase en cours', () => {
    const live = started.live!;
    const moved = {
      ...started,
      live: {
        ...live,
        assignments: live.assignments.map((a) => ({
          ...a,
          position: { type: 'Point' as const, coordinates: [1, 43] as [number, number] },
        })),
      },
    };
    const project = toProject(moved);
    const retained = retainedProposal(project)!;
    const inPhase = retained.assignments.filter((a) => a.phase === live.phase);
    expect(inPhase.length).toBe(live.assignments.length);
    expect(inPhase.every((a) => a.position.coordinates[0] === 1)).toBe(true);
    expect(project.state.live).toBeUndefined();
  });

  it('explique pourquoi un fichier est refusé', () => {
    expect(parseProject('pas du json').error).toMatch(/pas du JSON/);
    expect(parseProject('{"format":"autre"}').error).toMatch(/pas un projet Aeris/);
    expect(parseProject('{"format":"aeris-projet","version":1}').error).toMatch(/incomplet/);
  });

  it('nomme le fichier d’après la mission', () => {
    const project = toProject(withProposals);
    project.state.mission.name = 'Démo — Forêt de Bouconne';
    expect(projectFileName(project)).toBe('Démo-Forêt-de-Bouconne.aeris.json');
  });
});

describe('availabilityEvents', () => {
  const resources = withProposals.mission.resources;

  it('ne génère rien quand rien ne change', () => {
    expect(availabilityEvents(resources, {})).toEqual([]);
  });

  it('déclare indisponible ou rétablit selon le choix de l’opérateur', () => {
    const [a, b] = resources;
    const events = availabilityEvents([a, { ...b, available: false }], {
      [a.id]: false,
      [b.id]: true,
    });
    expect(events).toEqual([
      { type: 'resource_unavailable', resourceId: a.id },
      { type: 'resource_available', resourceId: b.id },
    ]);
  });
});
