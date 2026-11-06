import { migrate } from '../src/db/migrate.ts';
import { createPool } from '../src/db/pool.ts';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://game:game_dev_password@127.0.0.1:5432/game_test';

export default async function setup() {
  process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
  const pool = createPool(TEST_DATABASE_URL);
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}
