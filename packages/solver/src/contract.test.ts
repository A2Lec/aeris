import { solverContract } from '@aeris/contracts';
import { buildGrid } from '@aeris/geo';
import { greedySolve } from './greedy';
import { ilpSolve } from './ilp';

solverContract('greedy', greedySolve, { buildGrid });
solverContract('ilp', ilpSolve, { buildGrid });
