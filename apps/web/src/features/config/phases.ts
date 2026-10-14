import type { PriorityZone } from '@aeris/shared';

/** Phases où la zone est active (absence de liste = toutes les phases). */
export function zonePhases(zone: PriorityZone, phaseCount: number): number[] {
  const all = [...Array(phaseCount).keys()];
  return zone.phases?.length ? zone.phases.filter((p) => p >= 0 && p < phaseCount) : all;
}

/**
 * Coche ou décoche une phase pour une zone. Une zone reste active dans au moins une phase ;
 * active partout, elle n'a plus besoin de liste.
 */
export function togglePhase(
  zone: PriorityZone,
  phase: number,
  checked: boolean,
  phaseCount: number,
): PriorityZone {
  const current = zonePhases(zone, phaseCount);
  const next = checked
    ? [...new Set([...current, phase])].sort((a, b) => a - b)
    : current.filter((p) => p !== phase);
  if (!next.length) return zone;
  return { ...zone, phases: next.length === phaseCount ? undefined : next };
}

/** Nouveau nombre de phases : les phases disparues sont retirées, chaque zone en garde une. */
export function withPhaseCount(zones: PriorityZone[], phaseCount: number): PriorityZone[] {
  return zones.map((zone) => {
    if (!zone.phases?.length) return zone;
    const kept = zone.phases.filter((p) => p < phaseCount);
    const phases = kept.length ? kept : [0];
    return { ...zone, phases: phases.length === phaseCount ? undefined : phases };
  });
}
