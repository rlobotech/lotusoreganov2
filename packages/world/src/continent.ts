import { parseWorldMap } from './world-map.ts';
import { WORLD_MAP } from './world-map-data.ts';

/** The traced continent (see world-map.ts for the format). */
export const CONTINENT = parseWorldMap(WORLD_MAP);
