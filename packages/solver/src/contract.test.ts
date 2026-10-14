import { solverContract } from '@aeris/contracts';
import { buildGrid } from '@aeris/geo';
import { greedySolve } from './greedy';

solverContract('greedy', greedySolve, { buildGrid });
