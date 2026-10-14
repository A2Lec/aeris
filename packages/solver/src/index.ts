import type { Solver } from '@aeris/shared';
import { ilpSolve } from './ilp';

export { greedySolve } from './greedy';
export { ilpSolve } from './ilp';

/** Point d'entrée utilisé par l'API : changer ici l'implémentation par défaut. */
export const solve: Solver = ilpSolve;
