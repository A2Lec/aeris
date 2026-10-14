import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Catalog, CoverageLayers, MissionInput, MissionState, Proposal } from '@aeris/shared';
import snapshot from './mocks/snapshot.json';

/** Les mocks du front doivent rester conformes aux contrats : sinon, `pnpm mocks`. */
describe('mocks/snapshot.json respecte @aeris/shared', () => {
  const schemas = {
    catalog: Catalog,
    demoMission: MissionInput,
    created: MissionState,
    proposals: z.array(Proposal),
    coverage: CoverageLayers,
    started: MissionState,
    recompute: Proposal,
  };
  for (const [key, schema] of Object.entries(schemas)) {
    it(key, () => {
      const res = schema.safeParse((snapshot as Record<string, unknown>)[key]);
      expect(
        res.success,
        res.error ? `${key} : ${res.error.message} → relancer pnpm mocks` : '',
      ).toBe(true);
    });
  }
  it('la conduite démarrée porte un état temps réel', () => {
    expect(MissionState.parse(snapshot.started).live).toBeDefined();
  });
});
