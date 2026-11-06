import { STARTER_WORLD } from '@game/world';
import { buildApp } from './app.ts';
import { purgeExpiredSessions } from './auth/service.ts';
import { loadConfig } from './config.ts';
import { migrate } from './db/migrate.ts';
import { createPool } from './db/pool.ts';
import { simConfigFor } from './game/config.ts';
import { startWorker } from './game/worker.ts';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

const applied = await migrate(pool);
const sim = simConfigFor(config);
const app = await buildApp({ config, pool, sim });
if (applied.length > 0) app.log.info({ applied }, 'migrations applied');
if (config.timeScale !== 1)
  app.log.warn({ timeScale: config.timeScale }, 'TIME_SCALE active (dev only)');

// The scheduler: wakes parties whose activity has finished. Safe to run in several processes.
const worker = startWorker(
  { pool, world: STARTER_WORLD, cfg: sim },
  {
    intervalMs: config.timeScale === 1 ? 2000 : 500,
    log: (msg, err) => app.log.error({ err }, msg),
  },
);

const purge = setInterval(
  () => {
    purgeExpiredSessions(pool).catch((err) => app.log.error(err));
  },
  60 * 60 * 1000,
);
purge.unref();

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  clearInterval(purge);
  await worker.stop();
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.port, host: '0.0.0.0' });
