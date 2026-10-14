import type {
  DroneModel,
  Environment,
  Mission,
  PilotLevel,
  PilotRule,
  Requirement,
} from './domain';

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

/**
 * Créneau horaire d'une phase : la durée choisie pour chaque phase (`phaseDurationsMin`),
 * enchaînées depuis le début de la période ; à défaut, la période découpée en `phaseCount`
 * parts égales. `undefined` si la mission n'a pas de période valide : ne JAMAIS inventer de
 * date. Sert à la séparation temporelle (créneaux) et à la météo par phase.
 */
export function phaseWindow(
  mission: Pick<Mission, 'period' | 'phaseCount'> & Partial<Pick<Mission, 'phaseDurationsMin'>>,
  phase: number,
): { start: string; end: string } | undefined {
  if (!mission.period) return undefined;
  const start = Date.parse(mission.period.start);
  const end = Date.parse(mission.period.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined;
  const durations = mission.phaseDurationsMin;
  if (durations?.length === mission.phaseCount && durations.every((d) => d > 0)) {
    const offset = durations.slice(0, phase).reduce((s, d) => s + d, 0) * 60_000;
    return {
      start: new Date(start + offset).toISOString(),
      end: new Date(start + offset + (durations[phase] ?? 0) * 60_000).toISOString(),
    };
  }
  const step = (end - start) / Math.max(1, mission.phaseCount);
  return {
    start: new Date(start + phase * step).toISOString(),
    end: new Date(start + (phase + 1) * step).toISOString(),
  };
}
