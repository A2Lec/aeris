import { deconflictContract } from '@aeris/contracts';
import { buildGrid } from '@aeris/geo';
import { deconflict } from './index';

deconflictContract('v0 vertical', deconflict, { buildGrid });
