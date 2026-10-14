import type { Assignment } from '@aeris/shared';

/**
 * Cascade de séparation de l'espace aérien (brief) : horizontal → vertical → temporel →
 * renoncement. Le module de séparation (P4) ne renvoie pas de statut structuré : on déduit
 * chaque niveau des affectations (secteurs, tranches d'altitude, créneaux) et des
 * diagnostics qu'il émet réellement. Rien n'est affiché qui ne vienne de ces données.
 */

export type StepId = 'horizontal' | 'vertical' | 'temporel' | 'renoncement';
export type StepStatus = 'appliquee' | 'inutile' | 'impossible';

export interface SeparationStep {
  id: StepId;
  label: string;
  status: StepStatus;
  detail: string;
}

export interface Explanation {
  severity: 'danger' | 'warn';
  text: string;
}

/** Diagnostics d'une phase, sans le préfixe « Phase N — » ajouté par l'API. */
export function phaseDiagnostics(diagnostics: string[], phase: number): string[] {
  const prefix = `Phase ${phase + 1} — `;
  return diagnostics.filter((d) => d.startsWith(prefix)).map((d) => d.slice(prefix.length));
}

const has = (diags: string[], re: RegExp) => diags.filter((d) => re.test(d));
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function separationCascade(
  assignments: Assignment[],
  diagnostics: string[],
): { steps: SeparationStep[]; explanations: Explanation[] } {
  const sectors = assignments.filter((a) => a.sector).length;
  const horizontal = has(diagnostics, /séparation horizontale/i);
  const bands = new Set(
    [...assignments]
      .sort((x, y) => x.altitude.minM - y.altitude.minM || x.altitude.maxM - y.altitude.maxM)
      .map((a) => `${a.altitude.minM}–${a.altitude.maxM}`),
  );
  const slots = assignments.filter((a) => a.slot).length;
  const temporal = has(diagnostics, /séparation temporelle \(créneau/i);
  const temporalImpossible = has(diagnostics, /séparation temporelle impossible/i);
  const renounced = has(diagnostics, /renoncement/i);

  const steps: SeparationStep[] = [
    sectors > 0 || horizontal.length > 0
      ? {
          id: 'horizontal',
          label: 'Horizontale (secteurs)',
          status: 'appliquee',
          detail:
            sectors > 0 ? plural(sectors, 'secteur dédié', 'secteurs dédiés') : 'Secteurs dédiés',
        }
      : {
          id: 'horizontal',
          label: 'Horizontale (secteurs)',
          status: 'inutile',
          detail: 'Aucun secteur nécessaire',
        },
    assignments.length > 1 && bands.size > 1
      ? {
          id: 'vertical',
          label: 'Verticale (hauteurs)',
          status: 'appliquee',
          detail: `${plural(bands.size, 'tranche', 'tranches')} : ${[...bands].join(', ')} m`,
        }
      : {
          id: 'vertical',
          label: 'Verticale (hauteurs)',
          status: 'inutile',
          detail: assignments.length > 1 ? 'Même tranche pour tous' : 'Un seul couple engagé',
        },
    temporalImpossible.length > 0
      ? {
          id: 'temporel',
          label: 'Temporelle (créneaux)',
          status: 'impossible',
          detail: 'Pas de période d’arrêté pour créer des créneaux',
        }
      : slots > 0 || temporal.length > 0
        ? {
            id: 'temporel',
            label: 'Temporelle (créneaux)',
            status: 'appliquee',
            detail: plural(Math.max(slots, temporal.length), 'créneau', 'créneaux'),
          }
        : {
            id: 'temporel',
            label: 'Temporelle (créneaux)',
            status: 'inutile',
            detail: 'Tous les couples volent en même temps',
          },
    renounced.length > 0
      ? {
          id: 'renoncement',
          label: 'Renoncement (moyens retirés)',
          status: 'appliquee',
          detail: plural(renounced.length, 'couple retiré', 'couples retirés'),
        }
      : {
          id: 'renoncement',
          label: 'Renoncement (moyens retirés)',
          status: 'inutile',
          detail: 'Aucun couple retiré',
        },
  ];

  const explanations: Explanation[] = diagnostics.flatMap((text): Explanation[] => {
    if (/renoncement|conflit non résolu|impossible|infaisable/i.test(text))
      return [{ severity: 'danger', text }];
    if (/non engagé|plafond abaissé|saturation/i.test(text)) return [{ severity: 'warn', text }];
    return [];
  });

  return { steps, explanations };
}
