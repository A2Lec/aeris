import { z } from 'zod';
import { AreaGeom, DroneModel, MissionInput, PilotRule } from '@aeris/shared';
import dronesJson from './drones.json';
import rulesJson from './pilot-rules.json';
import demoJson from './fixtures/mission-demo.json';
import communesJson from './communes-demo.json';
import { buildTestMissions } from './fixtures';

export type { TestMission } from './fixtures';

/** Catalogue des drones de référence (valeurs indicatives à valider). */
export const drones = z.array(DroneModel).parse(dronesJson);

/** Capacités TP1 / TP2 (mémo « scénarios drone »). */
export const pilotRules = z.array(PilotRule).parse(rulesJson);

/** Mission de démonstration (forêt de Bouconne, ouest de Toulouse). */
export const demoMission = MissionInput.parse(demoJson);

/** Démo + cas limites, pour les tests de contrat. */
export const testMissions = buildTestMissions(demoMission);

/**
 * Contours des communes autour de la zone de démo (Haute-Garonne et Gers), téléchargés une
 * fois depuis l'API Géo de l'État (geo.api.gouv.fr, données IGN Admin Express) : les moteurs
 * n'appellent pas le réseau. Pour une autre zone, refaire l'extraction au chargement.
 * TODO(P1) : déplacer le schéma `Commune` dans @aeris/shared.
 */
export const Commune = z.object({ code: z.string(), nom: z.string(), contour: AreaGeom });
export type Commune = z.infer<typeof Commune>;
export const communesDemo = z.array(Commune).parse(communesJson);
