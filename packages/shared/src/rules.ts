import type { DroneModel, Environment, PilotLevel, PilotRule, Requirement } from './domain';

/** Poids d'une cellule selon son niveau de priorité (0 = hors zone prioritaire). */
export const PRIORITY_WEIGHTS: Record<number, number> = { 0: 1, 1: 2, 2: 4, 3: 8 };

/** Hauteur max à proximité d'une zone militaire (notes d'analyse, à confirmer). */
export const MILITARY_MAX_HEIGHT_M = 50;

export function ruleFor(rules: PilotRule[], level: PilotLevel): PilotRule {
  const rule = rules.find((r) => r.level === level);
  if (!rule) throw new Error(`Règle manquante pour le niveau ${level}`);
  return rule;
}

export function rangeM(rules: PilotRule[], level: PilotLevel): number {
  return ruleFor(rules, level).rangeM;
}

export function maxHeightM(rules: PilotRule[], level: PilotLevel, env: Environment): number {
  return ruleFor(rules, level).maxHeightM[env];
}

/** Le drone a-t-il les capacités exigées par la zone ? */
export function meetsRequirement(model: DroneModel, req: Requirement): boolean {
  if (req.minZoomX !== undefined && model.zoomX < req.minZoomX) return false;
  if (req.thermal && !model.thermal) return false;
  if (req.night && !model.night) return false;
  return true;
}
