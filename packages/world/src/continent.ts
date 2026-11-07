import { parseWorldMap } from './world-map.ts';
import { WORLD_MAP } from './world-map-data.ts';

/** The continent: traced from the reference picture, then shaped into regions with gates. */
export const CONTINENT = parseWorldMap(WORLD_MAP);
