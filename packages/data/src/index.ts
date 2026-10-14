import { z } from 'zod';
import { DroneModel, MissionInput, PilotRule } from '@aeris/shared';
import dronesJson from './drones.json';
import rulesJson from './pilot-rules.json';
import demoJson from './fixtures/mission-demo.json';

/** Catalogue des drones de référence (valeurs indicatives à valider). */
export const drones = z.array(DroneModel).parse(dronesJson);

/** Capacités TP1 / TP2 (mémo « scénarios drone »). */
export const pilotRules = z.array(PilotRule).parse(rulesJson);

/** Mission de démonstration (forêt de Bouconne, ouest de Toulouse). */
export const demoMission = MissionInput.parse(demoJson);
