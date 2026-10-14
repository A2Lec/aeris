/**
 * Régénère les réponses figées utilisées par le front en mode mock (`pnpm dev:mock`) :
 *   pnpm mocks
 * Joue le scénario de démo contre la vraie API (sans réseau) et enregistre chaque réponse.
 * À relancer après toute évolution de @aeris/shared ; le test apps/web/src/api/mocks.test.ts
 * échoue si le fichier ne respecte plus les contrats.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, type MissionState, type Proposal } from '@aeris/shared';
import { buildApp } from '../app';

globalThis.fetch = () => Promise.reject(new Error('mocks générés sans réseau'));

const app = await buildApp({ logger: false });
const get = async (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) => {
  const res = await app.inject({ method, url, payload });
  if (res.statusCode >= 300) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`);
  return res.json();
};

const catalog = await get('GET', API.catalog);
const demoMission = await get('GET', API.demoMission);
const created: MissionState = await get('POST', API.missions, demoMission);
const id = created.mission.id;
const proposals: Proposal[] = await get('POST', API.solve(id), { useWeather: false });
const coverage = await get('GET', API.coverage(id, proposals[0].id, 0));
const started: MissionState = await get('POST', API.start(id, proposals[0].id));
await get('POST', API.events(id), { type: 'resource_unavailable', resourceId: 'r1' });
const recompute: Proposal = await get('POST', API.recompute(id), {});
await app.close();

const snapshot = { catalog, demoMission, created, proposals, coverage, started, recompute };
const out = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../web/src/api/mocks/snapshot.json',
);
// 6 décimales ≈ 10 cm : largement suffisant, et le fichier reste léger.
const round = (_k: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
await writeFile(out, JSON.stringify(snapshot, round) + '\n');
console.log(`Mocks écrits dans ${out}`);
