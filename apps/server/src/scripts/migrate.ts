import { loadConfig } from '../config.ts';
import { migrate } from '../db/migrate.ts';
import { createPool } from '../db/pool.ts';

const pool = createPool(loadConfig().databaseUrl);
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
} finally {
  await pool.end();
}
