import { randomBytes } from 'node:crypto';
import { loadConfig } from '../config.ts';
import { createPool } from '../db/pool.ts';

// Usage: pnpm --filter @game/server invite:create [uses] [days-valid] [code]
const uses = Number(process.argv[2] ?? 1);
const days = process.argv[3] ? Number(process.argv[3]) : null;
const code = process.argv[4] ?? randomBytes(5).toString('hex').toUpperCase();

if (!Number.isInteger(uses) || uses < 1 || (days !== null && !(days > 0))) {
  console.error('Usage: invite:create [uses>=1] [days-valid] [code]');
  process.exit(1);
}

const pool = createPool(loadConfig().databaseUrl);
try {
  await pool.query(
    `INSERT INTO invite_codes (code, uses_left, expires_at)
     VALUES ($1, $2, CASE WHEN $3::float8 IS NULL THEN NULL ELSE now() + ($3::float8 * interval '1 day') END)`,
    [code, uses, days],
  );
  console.log(`Invite code: ${code} (uses: ${uses}${days ? `, valid ${days} days` : ''})`);
} finally {
  await pool.end();
}
