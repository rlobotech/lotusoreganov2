import { buildApp } from './app.ts';
import { purgeExpiredSessions } from './auth/service.ts';
import { loadConfig } from './config.ts';
import { migrate } from './db/migrate.ts';
import { createPool } from './db/pool.ts';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

const applied = await migrate(pool);
const app = await buildApp({ config, pool });
if (applied.length > 0) app.log.info({ applied }, 'migrations applied');

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
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.port, host: '0.0.0.0' });
