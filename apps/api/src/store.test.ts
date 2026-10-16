/**
 * Stockage : tourne sur la mémoire par défaut, sur Redis si REDIS_URL est défini
 * (`vercel env pull` puis `REDIS_URL=… pnpm --filter @aeris/api test`).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { LiveState, MissionState } from '@aeris/shared';
import { backend, createMission, getOr404, onLive, publishLive, updateMission } from './store';

function newState(): MissionState {
  return { mission: { id: randomUUID() }, status: 'config', proposals: [] } as never;
}

describe('Stockage des missions', () => {
  it('rend des copies : modifier une lecture ne change pas l’état stocké', async () => {
    const st = newState();
    await createMission(st);
    const read = await getOr404(st.mission.id);
    read.status = 'phasage';
    expect((await getOr404(st.mission.id)).status).toBe('config');
  });

  it('n’écrase aucune écriture concurrente', async () => {
    const st = newState();
    await createMission(st);
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        updateMission(st.mission.id, (cur) => {
          cur.proposals = [...cur.proposals, { id: String(i) } as never];
        }),
      ),
    );
    const ids = (await getOr404(st.mission.id)).proposals.map((p) => p.id).sort();
    expect(ids).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].sort());
  });

  it('refuse d’écrire sur une version périmée', async () => {
    const st = newState();
    await createMission(st);
    const stored = (await backend.getMission(st.mission.id))!;
    expect(await backend.putMission(stored.state, stored.version)).toBe(true);
    expect(await backend.putMission(stored.state, stored.version)).toBe(false);
  });

  it('diffuse l’état temps réel aux abonnés jusqu’au désabonnement', async () => {
    const id = randomUUID();
    const received: LiveState[] = [];
    const off = await onLive(id, (live) => received.push(live));
    await publishLive(id, { phase: 1 } as LiveState);
    await expect.poll(() => received.length).toBe(1);
    await off();
    await publishLive(id, { phase: 2 } as LiveState);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(received.map((l) => l.phase)).toEqual([1]);
  });
});
