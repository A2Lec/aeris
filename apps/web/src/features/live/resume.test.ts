import { describe, expect, it } from 'vitest';
import type { Assignment, Proposal, Resource } from '@aeris/shared';
import { restoredAssignments } from './resume';

const assignment = (resourceId: string): Assignment =>
  ({ resourceId, phase: 0, position: [2, 48] }) as unknown as Assignment;
const resource = (id: string): Resource =>
  ({ id, pilotId: 'p', droneModelId: 'd', available: true }) as Resource;

describe('restoredAssignments', () => {
  it('ne restaure que les affectations dont le couple existe encore', () => {
    const saved = { assignments: [assignment('r1'), assignment('r2')] } as Proposal;
    expect(restoredAssignments(saved, [resource('r2'), resource('r3')])).toEqual([
      assignment('r2'),
    ]);
  });
});
