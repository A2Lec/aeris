/**
 * TODO(P2) — Solveur exact par programmation linéaire en nombres entiers (HiGHS, WASM).
 *
 * Modèle MCLP pondéré, pour une phase :
 *   variables  x[j,k] ∈ {0,1}  le couple k est placé en candidat j (j ∈ zone limite de k)
 *              y[i]   ∈ {0,1}  la cellule i est servie
 *              o[i]   ≥ 0      surcouverture de la cellule i (chevauchement)
 *   max  Σ w_i·y_i − α·Σ o_i − β·Σ d(j, prev_k)·x[j,k]
 *   s.c. Σ_j x[j,k] ≤ 1                    ∀k   (un couple, une position)
 *        Σ_{j,k} x[j,k] ≤ maxDrones             (arrêté préfectoral)
 *        y_i ≤ Σ_{(j,k) ∈ N(i)} x[j,k]     ∀i   (N(i) : couples capables à portée de i)
 *        o_i ≥ Σ_{(j,k) ∈ N(i)} x[j,k] − 1 ∀i
 *        x[j,k] = 1 si position imposée
 *
 * Conseils :
 *  - garder la signature `Solver` (voir @aeris/shared/engines.ts) ;
 *  - initialiser avec greedySolve (borne inférieure) et couper à ~3 s, retomber sur le glouton sinon ;
 *  - statut 'infaisable' + diagnostic explicite si HiGHS ne trouve rien.
 */
import type { SolveContext, SolveResult } from '@aeris/shared';
import { greedySolve } from './greedy';

export async function ilpSolve(ctx: SolveContext): Promise<SolveResult> {
  return greedySolve(ctx);
}
