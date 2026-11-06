import { defaultConfig, type SimConfig } from '@game/world';
import type { Config } from '../config.ts';

/** One tick is a minute; TIME_SCALE (development only) divides it. */
export function simConfigFor(config: Pick<Config, 'timeScale'>): SimConfig {
  return defaultConfig(60_000 / config.timeScale);
}
