/**
 * Solveur exact par programmation linéaire en nombres entiers (HiGHS, WASM).
 *
 * Modèle MCLP pondéré, pour une phase :
 *   variables  x[j,k] ∈ {0,1}  le couple k est placé en candidat j (j ∈ zone limite de k)
 *              u[i]   ∈ [0,r_i] drones utiles sur la cellule i (= min(n_i, r_i) une fois x entier)
 *              o[i]   ≥ 0      chevauchement superflu de la cellule i (au-delà des r_i voulus)
 *   max  Σ (w_i/r_i)·u_i − α·Σ w_i·o_i − Σ (β·d(j, prev_k) + γ − δ_jk)·x[j,k]
 *   s.c. Σ_j x[j,k] ≤ 1                    ∀k   (un couple, une position)
 *        Σ_{j,k} x[j,k] ≤ maxDrones             (arrêté préfectoral)
 *        u_i ≤ Σ_{(j,k) ∈ N(i)} x[j,k]     ∀i   (N(i) : couples capables à portée de i)
 *        o_i ≥ Σ_{(j,k) ∈ N(i)} x[j,k] − r_i ∀i (r_i : drones voulus, `cell.redundancy`)
 *        x[j,k] = 1 si position imposée
 * γ (coût d'engagement) n'est non nul qu'en « économie de moyens » ; δ = bonus zone prioritaire.
 *
 * Pour tenir dans le temps imparti, l'ILP travaille sur un modèle agrégé : cellules regroupées
 * par blocs de 300 m (et par capacités requises et redondance voulue), candidats tous les 600 m. Sa solution est
 * ensuite affinée par le recuit sur le modèle fin, puis comparée à celle du recuit seul
 * (borne inférieure) : on garde la meilleure. Si HiGHS échoue ou dépasse, on retombe sur le recuit.
 */
import highsLoader, { type Highs } from 'highs';
import { meetsRequirement, type SolveContext, type SolveResult } from '@aeris/shared';
import { distanceM } from '@aeris/geo';
import { anneal, seedOf } from './greedy';
import {
  buildProblem,
  candidateCost,
  isProblem,
  redundancyOf,
  score,
  toResult,
  type Problem,
} from './problem';

/** Temps total visé pour l'ILP (le contrat exige < 5 s, construction et recuit compris). */
const ILP_TIME_LIMIT_S = 3;
/** Écart d'optimalité accepté : au-delà, gagner 0,5 % ne vaut pas le temps de preuve. */
const MIP_REL_GAP = 0.005;
/** Taille des blocs agrégés et espacement des candidats de l'ILP, en mètres. */
const BLOCK_M = 300;
const ILP_CANDIDATE_SPACING_M = 600;

// Le module WASM est chargé une fois (lourd) ; chaque `solve` crée une instance HiGHS neuve.
let highsPromise: Promise<Highs> | undefined;
function loadHighs(): Promise<Highs> {
  highsPromise ??= highsLoader();
  return highsPromise;
}

const num = (v: number) => v.toFixed(6);

/** Écrit l'expression en plusieurs lignes (le format LP limite la longueur des lignes). */
function terms(parts: string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += 8) lines.push('  ' + parts.slice(i, i + 8).join(' '));
  return lines.join('\n');
}

interface Built {
  lp: string;
  /** Nom de variable x → (couple, candidat dans le modèle fin). */
  xVars: Map<string, [number, number]>;
}

/** Construit le programme agrégé au format CPLEX LP. */
function buildLp(p: Problem): Built | undefined {
  const { grid } = p.ctx;
  const block = Math.max(1, Math.round(BLOCK_M / grid.cellSizeM));
  const candStride = Math.max(1, Math.round(ILP_CANDIDATE_SPACING_M / grid.cellSizeM));

  // Groupes : bloc × capacités requises × redondance voulue, pondérés par la somme des poids.
  const groups = new Map<
    string,
    { w: number; r: number; x: number; y: number; n: number; cell: number }
  >();
  for (const c of grid.cells) {
    const w = p.weights[c.id]!;
    if (w <= 0) continue;
    const r = redundancyOf(p, c.id);
    const key = `${Math.floor(c.row / block)},${Math.floor(c.col / block)},${JSON.stringify(c.requires)},${r}`;
    const g = groups.get(key) ?? { w: 0, r, x: 0, y: 0, n: 0, cell: c.id };
    g.w += w;
    g.x += c.center[0];
    g.y += c.center[1];
    g.n++;
    groups.set(key, g);
  }
  const groupList = [...groups.values()].map((g) => ({
    w: g.w,
    r: g.r,
    center: [g.x / g.n, g.y / g.n] as [number, number],
    requires: grid.cells[g.cell]!.requires,
  }));

  const neighbors: string[][] = groupList.map(() => []);
  const xVars = new Map<string, [number, number]>();
  const objective: string[] = [];
  const perDrone: string[] = [];
  const all: string[] = [];
  const fixedRows: string[] = [];

  p.usable.forEach((u, k) => {
    const vars: string[] = [];
    u.candidates.forEach((pos, j) => {
      const cell = u.candidateCells[j];
      if (cell && (cell.row % candStride !== 0 || cell.col % candStride !== 0)) return;
      const name = `x${k}_${j}`;
      xVars.set(name, [k, j]);
      vars.push(name);
      const cost = candidateCost(p, k, j);
      if (Math.abs(cost) > 1e-6)
        objective.push(`${cost > 0 ? '-' : '+'} ${num(Math.abs(cost))} ${name}`);
      groupList.forEach((g, gi) => {
        if (meetsRequirement(u.model, g.requires) && distanceM(pos, g.center) <= u.radius)
          neighbors[gi]!.push(name);
      });
      if (u.fixed) fixedRows.push(` f${k}: ${name} = 1`);
    });
    if (vars.length === 0) return;
    perDrone.push(` a${k}:\n${terms(vars.map((v, i) => (i ? `+ ${v}` : v)))}\n  <= 1`);
    all.push(...vars);
  });
  if (all.length === 0) return undefined;

  // u = drones utiles (crédit partiel w/r chacun, jusqu'à r) ; o = chevauchement superflu.
  const coverRows: string[] = [];
  const bounds: string[] = [];
  groupList.forEach((g, gi) => {
    const nb = neighbors[gi]!;
    if (nb.length === 0) return;
    objective.push(`+ ${num(g.w / g.r)} u${gi}`, `- ${num(p.overlapPenalty * g.w)} o${gi}`);
    coverRows.push(` cu${gi}: u${gi}\n${terms(nb.map((v) => `- ${v}`))}\n  <= 0`);
    coverRows.push(` co${gi}:\n${terms(nb.map((v) => `+ ${v}`))}\n  - o${gi} <= ${g.r}`);
    bounds.push(` 0 <= u${gi} <= ${g.r}`);
  });
  if (objective.length === 0) return undefined;

  const lp = [
    'Maximize',
    ' obj:',
    terms(objective),
    'Subject To',
    ...perDrone,
    ` cap:\n${terms(all.map((v, i) => (i ? `+ ${v}` : v)))}\n  <= ${p.maxEngaged}`,
    ...coverRows,
    ...fixedRows,
    'Bounds',
    ...bounds,
    'Binaries',
    terms(all),
    'End',
  ].join('\n');
  return { lp, xVars };
}

export async function ilpSolve(ctx: SolveContext): Promise<SolveResult> {
  const t0 = Date.now();
  const problem = buildProblem(ctx);
  if (!isProblem(problem)) return problem;

  // Borne inférieure et solution de secours : le recuit seul.
  const seed = seedOf(ctx);
  const fallback = anneal(problem, { seed });
  const fallbackScore = score(problem, fallback);

  let note: string;
  let best = fallback;
  try {
    const built = buildLp(problem);
    if (!built) return toResult(problem, fallback, ['Solveur : recuit simulé (modèle ILP vide)']);
    const highs = await loadHighs();
    const remaining = ILP_TIME_LIMIT_S - (Date.now() - t0) / 1000;
    if (remaining < 0.3) {
      return toResult(problem, fallback, ['Solveur : recuit simulé (pas de temps pour l’ILP)']);
    }
    const sol = highs.solve(built.lp, {
      time_limit: remaining,
      mip_rel_gap: MIP_REL_GAP,
      output_flag: false,
    });
    if (sol.Status !== 'Optimal' && sol.Status !== 'Time limit reached') {
      return toResult(problem, fallback, [`Solveur : recuit simulé (ILP : ${sol.Status})`]);
    }
    const choice = new Int32Array(problem.usable.length).fill(-1);
    let found = false;
    for (const [name, [k, j]] of built.xVars) {
      const col = sol.Columns[name] as { Primal?: number } | undefined;
      if ((col?.Primal ?? 0) > 0.5) {
        choice[k] = j;
        found = true;
      }
    }
    if (!found && sol.Status !== 'Optimal') {
      return toResult(problem, fallback, ['Solveur : recuit simulé (ILP sans solution à temps)']);
    }
    // Affinage local sur le modèle fin (candidats tous les 300 m, cellules non agrégées).
    const polished = anneal(problem, { init: choice, seed, temperature: 0.01, iterations: 5000 });
    const polishedScore = score(problem, polished);
    const how = sol.Status === 'Optimal' ? 'optimal' : 'limite de temps atteinte';
    if (polishedScore >= fallbackScore) {
      best = polished;
      note = `Solveur : ILP HiGHS (${how}) affiné par recuit`;
    } else {
      note = `Solveur : recuit simulé, meilleur que l’ILP HiGHS (${how})`;
    }
  } catch (e) {
    note = `Solveur : recuit simulé (ILP en échec : ${e instanceof Error ? e.message : String(e)})`;
  }
  return toResult(problem, best, [note]);
}
