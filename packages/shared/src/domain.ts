import { z } from 'zod';
import { AreaGeom, PointGeom, PolygonGeom } from './geojson';

// ─── Référentiels ────────────────────────────────────────────────────────────

export const PilotLevel = z.enum(['TP1', 'TP2']);
export type PilotLevel = z.infer<typeof PilotLevel>;

export const Environment = z.enum(['rural', 'urbain']);
export type Environment = z.infer<typeof Environment>;

/** Modèle de drone (catalogue fixe, packages/data/src/drones.json). */
export const DroneModel = z.object({
  id: z.string(),
  name: z.string(),
  /** Informatif : l'autonomie n'est pas gérée par l'outil. */
  enduranceMin: z.number(),
  maxWindMs: z.number(),
  rainOk: z.boolean(),
  minTempC: z.number(),
  maxTempC: z.number(),
  zoomX: z.number(),
  thermal: z.boolean(),
  night: z.boolean(),
});
export type DroneModel = z.infer<typeof DroneModel>;

/** Capacité d'un niveau de télépilote (packages/data/src/pilot-rules.json). */
export const PilotRule = z.object({
  level: PilotLevel,
  scenario: z.string(),
  rangeM: z.number(),
  maxHeightM: z.object({ rural: z.number(), urbain: z.number() }),
});
export type PilotRule = z.infer<typeof PilotRule>;

// ─── Configuration de mission ────────────────────────────────────────────────

export const Pilot = z.object({ id: z.string(), name: z.string(), level: PilotLevel });
export type Pilot = z.infer<typeof Pilot>;

/** Couple télépilote + drone, figé à la configuration. */
export const Resource = z.object({
  id: z.string(),
  pilotId: z.string(),
  droneModelId: z.string(),
  available: z.boolean().default(true),
  /** Zone limite : le couple reste dans ce polygone pendant toute l'opération. */
  allowedArea: AreaGeom.optional(),
  /** Position imposée par l'opérateur (l'algo ne la déplace pas). */
  fixedPosition: PointGeom.optional(),
});
export type Resource = z.infer<typeof Resource>;

/** Capacités exigées par une zone (ex. priorité max → gros zoom). */
export const Requirement = z.object({
  minZoomX: z.number().optional(),
  thermal: z.boolean().optional(),
  night: z.boolean().optional(),
});
export type Requirement = z.infer<typeof Requirement>;

export const PriorityZone = z.object({
  id: z.string(),
  name: z.string(),
  geometry: AreaGeom,
  /** 1 = faible … 3 = maximale. Hors zone prioritaire = niveau 0. */
  level: z.number().int().min(1).max(3),
  /** Action attendue (recherche, surveillance, observation…). */
  action: z.string().optional(),
  requires: Requirement.default({}),
  /** Phases où la zone est active (index à partir de 0). Absent = toutes les phases. */
  phases: z.array(z.number().int().min(0)).optional(),
});
export type PriorityZone = z.infer<typeof PriorityZone>;

export const ConstraintKind = z.enum(['interdite', 'hauteur_limitee', 'urbaine']);
export type ConstraintKind = z.infer<typeof ConstraintKind>;

export const ConstraintZone = z.object({
  id: z.string(),
  name: z.string(),
  geometry: AreaGeom,
  kind: ConstraintKind,
  /** Pour kind = hauteur_limitee (ex. 50 m près d'un terrain militaire). */
  maxHeightM: z.number().optional(),
});
export type ConstraintZone = z.infer<typeof ConstraintZone>;

export const Mission = z.object({
  id: z.string(),
  name: z.string(),
  /** Zone complète à couvrir, définie au début : tout le calcul se fait dedans. */
  workArea: PolygonGeom,
  environment: Environment.default('rural'),
  /** Nombre maximal de drones fixé par l'arrêté préfectoral. */
  maxDrones: z.number().int().min(0),
  period: z.object({ start: z.string(), end: z.string() }).optional(),
  phaseCount: z.number().int().min(1).default(1),
  /** Taille des cellules de la grille de calcul, en mètres. */
  gridCellM: z.number().min(25).default(100),
  pilots: z.array(Pilot),
  resources: z.array(Resource),
  priorityZones: z.array(PriorityZone).default([]),
  constraintZones: z.array(ConstraintZone).default([]),
});
export type Mission = z.infer<typeof Mission>;

export const MissionStatus = z.enum(['config', 'phasage', 'propositions', 'conduite']);
export type MissionStatus = z.infer<typeof MissionStatus>;

// ─── Résultats de calcul ─────────────────────────────────────────────────────

export const Strategy = z.enum(['couverture_globale', 'priorite', 'economie_moyens']);
export type Strategy = z.infer<typeof Strategy>;

export const AltitudeBand = z.object({ minM: z.number(), maxM: z.number() });
export type AltitudeBand = z.infer<typeof AltitudeBand>;

/** Où, jusqu'où, à quelle hauteur, quand : un couple pour une phase. */
export const Assignment = z.object({
  resourceId: z.string(),
  phase: z.number().int().min(0),
  position: PointGeom,
  radiusM: z.number(),
  altitude: AltitudeBand,
  sector: AreaGeom.optional(),
  slot: z.object({ start: z.string(), end: z.string() }).optional(),
});
export type Assignment = z.infer<typeof Assignment>;

export const Metrics = z.object({
  /** Part de la zone de travail couverte (hors zones interdites), 0..1. */
  coverage: z.number(),
  /** Part des zones prioritaires couvertes par un drone ayant les capacités requises. */
  priorityCoverage: z.number(),
  /** Couverture pondérée par la priorité. */
  weightedCoverage: z.number(),
  /** Part de la surface couverte qui l'est par au moins 2 drones. */
  overlap: z.number(),
  coveredAreaM2: z.number(),
  uncoveredAreaM2: z.number(),
  forbiddenAreaM2: z.number(),
  communes: z.array(z.string()).default([]),
});
export type Metrics = z.infer<typeof Metrics>;

export const SolveStatus = z.enum(['optimal', 'faisable', 'infaisable']);
export type SolveStatus = z.infer<typeof SolveStatus>;

export const Proposal = z.object({
  id: z.string(),
  label: z.string(),
  strategy: Strategy,
  status: SolveStatus,
  /** Toutes phases confondues (filtrer par assignment.phase). */
  assignments: z.array(Assignment),
  metricsByPhase: z.array(Metrics),
  diagnostics: z.array(z.string()),
  createdAt: z.string(),
});
export type Proposal = z.infer<typeof Proposal>;

export const Weather = z.object({
  windMs: z.number(),
  gustMs: z.number(),
  precipitationMm: z.number(),
  temperatureC: z.number(),
  isDay: z.boolean(),
  fetchedAt: z.string(),
});
export type Weather = z.infer<typeof Weather>;
