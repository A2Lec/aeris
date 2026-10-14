import {
  coverageContract,
  gridContract,
  metricsContract,
  stabilityContract,
} from '@aeris/contracts';
import { coverageGeometry } from './coverage';
import { buildGrid } from './grid';
import { computeMetrics } from './metrics';
import { mesurerStabilite } from './stabilite';

gridContract(buildGrid);
metricsContract(computeMetrics, buildGrid);
coverageContract(coverageGeometry, computeMetrics, buildGrid);
stabilityContract(mesurerStabilite, buildGrid);
