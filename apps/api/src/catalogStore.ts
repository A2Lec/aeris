import { drones as defaultDrones } from '@aeris/data';
import { DroneModel, type DroneModel as Drone, type NewDroneModel } from '@aeris/shared';
import { backend } from './store';

let droneCatalog: Drone[] = [...defaultDrones];

/** Recharge les drones ajoutés (sur Vercel, une autre instance a pu en ajouter). */
export async function initializeDroneCatalog(): Promise<void> {
  const customDrones = zDroneArray(await backend.loadCustomDrones());
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
  await initializeDroneCatalog();
  const baseId =
    input.name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'drone';
  const existingIds = new Set(droneCatalog.map((drone) => drone.id));
  for (let suffix = 1; ; suffix++) {
    const id = suffix === 1 ? baseId : `${baseId}-${suffix}`;
    if (existingIds.has(id)) continue;
    const drone = DroneModel.parse({
      ...input,
      id,
      enduranceMin: 30,
      minTempC: -10,
      maxTempC: 40,
    });
    // Identifiant réservé atomiquement : deux ajouts simultanés ne peuvent pas le partager.
    if (await backend.addCustomDrone(drone)) {
      droneCatalog = [...droneCatalog, drone];
      return drone;
    }
  }
}

function zDroneArray(value: unknown): Drone[] {
  if (!Array.isArray(value))
    throw new Error('Le fichier du catalogue de drones doit être une liste');
  return value.map((drone) => DroneModel.parse(drone));
}
