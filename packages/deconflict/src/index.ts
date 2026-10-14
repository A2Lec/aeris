import {
  phaseWindow,
  type Assignment,
  type Conflict,
  type Deconflicter,
  type Grid,
} from '@aeris/shared';
import { distanceM } from '@aeris/geo';

/** Hauteur par défaut d'une tranche d'altitude attribuée à un couple (20 m). */
export const DEFAULT_BAND_M = 20;
/** Hauteur minimale d'une tranche pour adapter la séparation sous plafond bas (10 m). */
export const MIN_BAND_M = 10;
/** Hauteur minimale de sécurité au-dessus du sol (10 m). */
export const FLOOR_M = 10;
/** Nombre par défaut de créneaux temporels par phase pour la séparation temporelle (2). */
export const DEFAULT_SLOTS_PER_PHASE = 2;

/**
 * Calcule le plafond effectif d'un couple :
 * son plafond initial (règlementaire) abaissé par tous les plafonds locaux (terrain militaire, etc.)
 * des cellules de la grille situées sous son disque de couverture.
 */
export function localCeiling(a: Assignment, grid: Grid): number {
  let ceiling = a.altitude.maxM;
  for (const cell of grid.cells) {
    if (cell.maxHeightM === undefined || cell.maxHeightM >= ceiling) continue;
    if (distanceM(a.position.coordinates, cell.center) <= a.radiusM) {
      ceiling = Math.min(ceiling, cell.maxHeightM);
    }
  }
  return ceiling;
}

/** Chevauchement horizontal : distance entre centres inférieure à la somme des rayons. */
export function horizontalOverlap(a: Assignment, b: Assignment): boolean {
  if (a.sector && b.sector) return false;
  return distanceM(a.position.coordinates, b.position.coordinates) < a.radiusM + b.radiusM;
}

/** Chevauchement vertical : les tranches d'altitude se recoupent. */
export function verticalOverlap(
  a: { minM: number; maxM: number },
  b: { minM: number; maxM: number },
): boolean {
  return a.minM < b.maxM && b.minM < a.maxM;
}

/** Chevauchement temporel : les créneaux se recoupent (ou l'un n'a pas de créneau imposé). */
export function slotsOverlap(
  a?: { start: string; end: string },
  b?: { start: string; end: string },
): boolean {
  if (!a || !b) return true;
  return a.start < b.end && b.start < a.end;
}

/** Paires de couples d'une même phase qui partagent un volume 4D (horizontal, vertical ET temporel). */
export function detectConflicts(assignments: Assignment[]): Conflict[] {
  const out: Conflict[] = [];
  for (let i = 0; i < assignments.length; i++) {
    for (let j = i + 1; j < assignments.length; j++) {
      const a = assignments[i];
      const b = assignments[j];
      if (a.phase !== b.phase) continue;
      if (
        horizontalOverlap(a, b) &&
        verticalOverlap(a.altitude, b.altitude) &&
        slotsOverlap(a.slot, b.slot)
      ) {
        out.push({ a: a.resourceId, b: b.resourceId, phase: a.phase });
      }
    }
  }
  return out;
}

/** Découpe la fenêtre de la phase en créneaux temporels équi-répartis. */
function getPhaseSlots(
  window: { start: string; end: string } | undefined,
  slotCount = DEFAULT_SLOTS_PER_PHASE,
): Array<{ start: string; end: string }> {
  // Sans période d'arrêté, pas de créneau horaire : on n'invente pas de date.
  if (!window) return [];
  const startMs = new Date(window.start).getTime();
  const endMs = new Date(window.end).getTime();
  const duration = (endMs - startMs) / slotCount;
  const slots: Array<{ start: string; end: string }> = [];
  for (let i = 0; i < slotCount; i++) {
    slots.push({
      start: new Date(startMs + i * duration).toISOString(),
      end: new Date(startMs + (i + 1) * duration).toISOString(),
    });
  }
  return slots;
}

interface Candidate {
  assignment: Assignment;
  ceiling: number;
}

interface PlacedEntry {
  candidate: Candidate;
  altitude: { minM: number; maxM: number };
  slot?: { start: string; end: string };
}

/** Calcule les intervalles verticaux libres sous un plafond donné compte tenu d'intervalles occupés. */
function findFreeIntervals(
  floor: number,
  ceiling: number,
  occupied: Array<{ minM: number; maxM: number }>,
): Array<{ start: number; end: number }> {
  const sorted = [...occupied]
    .map((o) => ({ minM: Math.max(floor, o.minM), maxM: Math.min(ceiling, o.maxM) }))
    .filter((o) => o.minM < o.maxM)
    .sort((a, b) => a.minM - b.minM);

  const merged: Array<{ minM: number; maxM: number }> = [];
  for (const interval of sorted) {
    if (merged.length === 0) {
      merged.push({ ...interval });
    } else {
      const last = merged[merged.length - 1];
      if (interval.minM <= last.maxM) {
        last.maxM = Math.max(last.maxM, interval.maxM);
      } else {
        merged.push({ ...interval });
      }
    }
  }

  const free: Array<{ start: number; end: number }> = [];
  let current = floor;
  for (const occ of merged) {
    if (occ.minM > current) {
      free.push({ start: current, end: occ.minM });
    }
    current = Math.max(current, occ.maxM);
  }
  if (current < ceiling) {
    free.push({ start: current, end: ceiling });
  }

  return free;
}

/**
 * Tente d'allouer des tranches verticales sans chevauchement pour une liste de candidats.
 * Adapte la taille de la tranche (entre DEFAULT_BAND_M et MIN_BAND_M) selon la saturation locale.
 */
function tryAllocateVertical(
  candidates: Candidate[],
  slot?: { start: string; end: string },
): { placed: PlacedEntry[]; unplaced: Candidate[] } {
  const placed: PlacedEntry[] = [];
  const unplaced: Candidate[] = [];

  for (const c of candidates) {
    const occupied: Array<{ minM: number; maxM: number }> = [];
    for (const p of placed) {
      if (horizontalOverlap(c.assignment, p.candidate.assignment)) {
        occupied.push(p.altitude);
      }
    }

    const freeIntervals = findFreeIntervals(FLOOR_M, c.ceiling, occupied);
    const usable = freeIntervals.filter((i) => i.end - i.start >= MIN_BAND_M);

    if (usable.length === 0) {
      unplaced.push(c);
      continue;
    }

    // On sélectionne l'intervalle le plus haut pour préserver les basses altitudes pour les drones à plafond bas
    const bestInterval = usable[usable.length - 1];
    const available = bestInterval.end - bestInterval.start;

    // Calcul d'une tranche adaptative proportionnée au nombre de drones concurrents dans ce créneau
    const competing = candidates.filter(
      (cand) => horizontalOverlap(c.assignment, cand.assignment) && cand.ceiling <= c.ceiling,
    ).length;
    const adaptiveHeight = Math.max(
      MIN_BAND_M,
      Math.floor((c.ceiling - FLOOR_M) / Math.max(1, competing)),
    );
    const bandHeight = Math.min(DEFAULT_BAND_M, Math.min(available, adaptiveHeight));

    const altitude = {
      minM: bestInterval.end - bandHeight,
      maxM: bestInterval.end,
    };

    placed.push({ candidate: c, altitude, slot });
  }

  return { placed, unplaced };
}

/**
 * Découpe un ensemble de candidats en composantes connexes selon le chevauchement horizontal.
 */
function findHorizontalComponents(candidates: Candidate[]): Candidate[][] {
  const n = candidates.length;
  const visited = new Array<boolean>(n).fill(false);
  const components: Candidate[][] = [];

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    const comp: Candidate[] = [];
    const queue = [i];
    visited[i] = true;

    while (queue.length > 0) {
      const u = queue.shift()!;
      comp.push(candidates[u]);
      for (let v = 0; v < n; v++) {
        if (!visited[v] && horizontalOverlap(candidates[u].assignment, candidates[v].assignment)) {
          visited[v] = true;
          queue.push(v);
        }
      }
    }
    components.push(comp);
  }

  return components;
}

/**
 * Moteur de déconfliction v1 :
 * Applique strictement la doctrine de séparation en cascade de la gendarmerie :
 *   1. Horizontal : maintien sans contrainte des drones aux secteurs disjoints.
 *   2. Vertical   : tranches adaptatives (20 m -> 10 m) sous plafonds locaux (militaire, etc.),
 *                  avec attribution des hautes altitudes aux capacités supérieures (TP2).
 *   3. Temporel   : décalage en créneaux temporels (slot) en cas de saturation de l'espace vertical.
 *   4. Renoncer   : retrait explicite et motivé des drones excédentaires si saturation totale.
 */
export const deconflict: Deconflicter = (assignments, ctx) => {
  if (assignments.length === 0) {
    return { assignments: [], conflicts: [], diagnostics: [] };
  }

  const diagnostics: string[] = [];
  const conflicts: Conflict[] = [];
  const resourcesById = new Map(ctx.mission.resources.map((r) => [r.id, r]));

  // 1. Calcul du plafond effectif de chaque couple sous les contraintes locales
  const viableCandidates: Candidate[] = [];
  for (const a of assignments) {
    const ceiling = localCeiling(a, ctx.grid);
    if (ceiling < a.altitude.maxM) {
      diagnostics.push(
        `${a.resourceId} : plafond abaissé à ${ceiling} m par contrainte locale (vs ${a.altitude.maxM} m)`,
      );
    }
    if (ceiling <= FLOOR_M) {
      diagnostics.push(
        `${a.resourceId} : renoncement pour contrainte verticale (plafond ${ceiling} m ≤ plancher de sécurité ${FLOOR_M} m)`,
      );
      conflicts.push({
        a: a.resourceId,
        b: a.resourceId,
        phase: a.phase,
        resolvedBy: 'renoncement',
      });
      continue;
    }
    viableCandidates.push({ assignment: a, ceiling });
  }

  // Tri prioritaire : positions imposées d'abord, puis plafonds les plus élevés, puis plus grand rayon
  const candidatePriority = (a: Candidate, b: Candidate) => {
    const rA = resourcesById.get(a.assignment.resourceId);
    const rB = resourcesById.get(b.assignment.resourceId);
    const fixedA = rA?.fixedPosition ? 1 : 0;
    const fixedB = rB?.fixedPosition ? 1 : 0;
    if (fixedB !== fixedA) return fixedB - fixedA;
    if (b.ceiling !== a.ceiling) return b.ceiling - a.ceiling;
    if (b.assignment.radiusM !== a.assignment.radiusM)
      return b.assignment.radiusM - a.assignment.radiusM;
    return a.assignment.resourceId.localeCompare(b.assignment.resourceId);
  };

  viableCandidates.sort(candidatePriority);

  const finalPlaced: Assignment[] = [];
  const phaseSlots = getPhaseSlots(phaseWindow(ctx.mission, ctx.phase), DEFAULT_SLOTS_PER_PHASE);

  // 2. Traitement par composante connexe de chevauchement horizontal
  const components = findHorizontalComponents(viableCandidates);

  for (const comp of components) {
    // Garantir le respect strict de la doctrine de priorité au sein de la composante
    comp.sort(candidatePriority);

    // Cas simple : drone isolé sans chevauchement horizontal (Niveau 1 Horizontal)
    if (comp.length === 1) {
      const c = comp[0];
      const h = Math.min(DEFAULT_BAND_M, c.ceiling - FLOOR_M);
      finalPlaced.push({
        ...c.assignment,
        altitude: { minM: c.ceiling - h, maxM: c.ceiling },
      });
      continue;
    }

    // Niveau 2 : Séparation verticale simultanée (sans créneaux temporels)
    const vertAttempt = tryAllocateVertical(comp);

    if (vertAttempt.unplaced.length === 0) {
      // Tous les drones de la composante ont pu être séparés verticalement
      for (const p of vertAttempt.placed) {
        finalPlaced.push({
          ...p.candidate.assignment,
          altitude: p.altitude,
        });
      }
      // Enregistrement de la résolution des conflits horizontaux
      for (let i = 0; i < comp.length; i++) {
        for (let j = i + 1; j < comp.length; j++) {
          if (horizontalOverlap(comp[i].assignment, comp[j].assignment)) {
            conflicts.push({
              a: comp[i].assignment.resourceId,
              b: comp[j].assignment.resourceId,
              phase: ctx.phase,
              resolvedBy: 'vertical',
            });
          }
        }
      }
      continue;
    }

    // Niveau 3 : Séparation temporelle dynamique (répartition équilibrée sans renoncement prématuré)
    const placedBySlot: PlacedEntry[][] = phaseSlots.map(() => []);
    const compPlaced: PlacedEntry[] = [];
    const compUnplaced: Candidate[] = [];

    if (phaseSlots.length === 0) {
      // Pas de période d'arrêté : on garde la séparation verticale obtenue, le reste renonce.
      diagnostics.push(
        `Phase ${ctx.phase + 1} : saturation verticale, séparation temporelle impossible sans période d'arrêté`,
      );
      compPlaced.push(...vertAttempt.placed);
      compUnplaced.push(...vertAttempt.unplaced);
    } else {
      diagnostics.push(
        `Phase ${ctx.phase + 1} : saturation verticale détectée, activation de la séparation temporelle (créneaux horaires)`,
      );
    }

    for (const c of phaseSlots.length ? comp : []) {
      // Prioriser les créneaux ayant le moins de drones pour équilibrer la charge temporelle
      const slotIndices = phaseSlots
        .map((_, i) => i)
        .sort((i1, i2) => placedBySlot[i1].length - placedBySlot[i2].length);

      let placedInAnySlot = false;

      for (const sIdx of slotIndices) {
        const slot = phaseSlots[sIdx];
        const currentSlotPlaced = placedBySlot[sIdx];

        const occupied: Array<{ minM: number; maxM: number }> = [];
        for (const p of currentSlotPlaced) {
          if (horizontalOverlap(c.assignment, p.candidate.assignment)) {
            occupied.push(p.altitude);
          }
        }

        const freeIntervals = findFreeIntervals(FLOOR_M, c.ceiling, occupied);
        const usable = freeIntervals.filter((i) => i.end - i.start >= MIN_BAND_M);

        if (usable.length > 0) {
          const bestInterval = usable[usable.length - 1];
          const available = bestInterval.end - bestInterval.start;

          // Nombre attendu de drones concurrents dans ce créneau
          const competingTotal = comp.filter(
            (cand) => horizontalOverlap(c.assignment, cand.assignment) && cand.ceiling <= c.ceiling,
          ).length;
          const targetDronesPerSlot = Math.max(1, Math.ceil(competingTotal / phaseSlots.length));

          const adaptiveHeight = Math.max(
            MIN_BAND_M,
            Math.floor((c.ceiling - FLOOR_M) / targetDronesPerSlot),
          );
          const bandHeight = Math.min(DEFAULT_BAND_M, Math.min(available, adaptiveHeight));

          const entry: PlacedEntry = {
            candidate: c,
            altitude: {
              minM: bestInterval.end - bandHeight,
              maxM: bestInterval.end,
            },
            slot,
          };

          placedBySlot[sIdx].push(entry);
          compPlaced.push(entry);
          diagnostics.push(
            `${c.assignment.resourceId} : séparation temporelle (créneau ${slot.start} – ${slot.end})`,
          );
          placedInAnySlot = true;
          break;
        }
      }

      if (!placedInAnySlot) {
        compUnplaced.push(c);
      }
    }

    for (const p of compPlaced) {
      finalPlaced.push({
        ...p.candidate.assignment,
        altitude: p.altitude,
        slot: p.slot,
      });
    }

    // Traçabilité des conflits résolus
    for (let i = 0; i < compPlaced.length; i++) {
      for (let j = i + 1; j < compPlaced.length; j++) {
        const p1 = compPlaced[i];
        const p2 = compPlaced[j];
        if (horizontalOverlap(p1.candidate.assignment, p2.candidate.assignment)) {
          const method =
            p1.slot && p2.slot && p1.slot.start !== p2.slot.start ? 'temporel' : 'vertical';
          conflicts.push({
            a: p1.candidate.assignment.resourceId,
            b: p2.candidate.assignment.resourceId,
            phase: ctx.phase,
            resolvedBy: method,
          });
        }
      }
    }

    // Niveau 4 : Renoncement explicite et justifié en cas de saturation résiduelle
    for (const un of compUnplaced) {
      diagnostics.push(
        `${un.assignment.resourceId} : renoncement pour saturation de l'espace aérien (conflits verticaux et temporels insolubles sous le plafond de ${un.ceiling} m)`,
      );
      // Associer le renoncement aux drones qui occupent la zone
      const blocking = compPlaced.find((p) =>
        horizontalOverlap(un.assignment, p.candidate.assignment),
      );
      conflicts.push({
        a: un.assignment.resourceId,
        b: blocking ? blocking.candidate.assignment.resourceId : un.assignment.resourceId,
        phase: ctx.phase,
        resolvedBy: 'renoncement',
      });
    }
  }

  // Traçabilité Niveau 1 — Horizontal pour les drones séparés par secteurs dédiés
  for (let i = 0; i < viableCandidates.length; i++) {
    for (let j = i + 1; j < viableCandidates.length; j++) {
      const a = viableCandidates[i].assignment;
      const b = viableCandidates[j].assignment;
      if (
        a.sector &&
        b.sector &&
        distanceM(a.position.coordinates, b.position.coordinates) < a.radiusM + b.radiusM
      ) {
        conflicts.push({
          a: a.resourceId,
          b: b.resourceId,
          phase: ctx.phase,
          resolvedBy: 'horizontal',
        });
        diagnostics.push(
          `${a.resourceId} / ${b.resourceId} : séparation horizontale (secteurs dédiés)`,
        );
      }
    }
  }

  // 3. Détection de tout conflit résiduel non résolu
  const residualConflicts = detectConflicts(finalPlaced);
  for (const rc of residualConflicts) {
    conflicts.push(rc);
    diagnostics.push(`Conflit non résolu ${rc.a} / ${rc.b} (phase ${rc.phase + 1})`);
  }

  return {
    assignments: finalPlaced,
    conflicts,
    diagnostics,
  };
};
