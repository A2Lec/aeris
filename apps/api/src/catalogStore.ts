import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drones as defaultDrones } from '@aeris/data';
import { DroneModel, type DroneModel as Drone, type NewDroneModel } from '@aeris/shared';

let droneCatalog: Drone[] = [...defaultDrones];
let customDrones: Drone[] = [];
let catalogPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'drone-catalog.json');

export async function initializeDroneCatalog(): Promise<void> {
  catalogPath =
    process.env.AERIS_DRONE_CATALOG_PATH ??
    join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'drone-catalog.json');

  try {
    const saved = JSON.parse(await readFile(catalogPath, 'utf8')) as unknown;
    customDrones = zDroneArray(saved);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    customDrones = [];
  }

  const knownIds = new Set(defaultDrones.map((drone) => drone.id));
  for (const drone of customDrones) {
    if (knownIds.has(drone.id)) throw new Error(`Identifiant de drone déjà utilisé : ${drone.id}`);
    knownIds.add(drone.id);
  }
  droneCatalog = [...defaultDrones, ...customDrones];
}

export function getDrones(): Drone[] {
  return [...droneCatalog];
}

export async function addDrone(input: NewDroneModel): Promise<Drone> {
  const baseId =
    input.name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'drone';
  const existingIds = new Set(droneCatalog.map((drone) => drone.id));
  let id = baseId;
  for (let suffix = 2; existingIds.has(id); suffix++) id = `${baseId}-${suffix}`;

  const drone = DroneModel.parse({
    ...input,
    id,
    enduranceMin: 30,
    minTempC: -10,
    maxTempC: 40,
  });
  const nextCustomDrones = [...customDrones, drone];
  const temporaryPath = `${catalogPath}.${randomUUID()}.tmp`;
  await mkdir(dirname(catalogPath), { recursive: true });
  await writeFile(temporaryPath, JSON.stringify(nextCustomDrones, null, 2), 'utf8');
  await rename(temporaryPath, catalogPath);

  customDrones = nextCustomDrones;
  droneCatalog = [...defaultDrones, ...customDrones];
  return drone;
}

function zDroneArray(value: unknown): Drone[] {
  if (!Array.isArray(value))
    throw new Error('Le fichier du catalogue de drones doit être une liste');
  return value.map((drone) => DroneModel.parse(drone));
}
