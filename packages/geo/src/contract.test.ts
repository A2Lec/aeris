import { coverageContract, gridContract, metricsContract } from '@aeris/contracts';
import { coverageGeometry } from './coverage';
import { buildGrid } from './grid';
import { computeMetrics } from './metrics';

gridContract(buildGrid);
metricsContract(computeMetrics, buildGrid);
coverageContract(coverageGeometry, computeMetrics, buildGrid);
