import type { Solver } from '@aeris/shared';
import { greedySolve } from './greedy';

export { greedySolve } from './greedy';

/** Point d'entrée utilisé par l'API : recuit simulé (le solveur exact HiGHS a été retiré). */
export const solve: Solver = greedySolve;
