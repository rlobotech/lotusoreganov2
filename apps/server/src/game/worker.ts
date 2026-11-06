import {
  advance,
  type AdvanceResult,
  type PartyState,
  type SimConfig,
  type WorldDef,
} from '@game/world';
import type { Pool } from '../db/pool.ts';
import { insertReplay, pruneReplays, type Queryable } from './replays.ts';

export interface WorkerDeps {
  pool: Pool;
  world: WorldDef;
  cfg: SimConfig;
  /** Injectable clock for tests. */
  now?: () => number;
}

/** Writes the outcome of one advance() call. Must run inside the party's transaction. */
export async function persistAdvance(
  client: Queryable,
  partyId: string,
  result: AdvanceResult,
): Promise<void> {
  const q = client.query.bind(client);
  const { party, events, replays } = result;
  await q(
    `UPDATE parties
     SET state = $2, status = $3,
         next_tick_at = CASE WHEN $4::float8 IS NULL THEN NULL ELSE to_timestamp($4::float8 / 1000.0) END,
         updated_at = now()
     WHERE id = $1`,
    [partyId, JSON.stringify(party), party.status, party.nextAt],
  );
  const replayIds = new Map<string, number>();
  for (const r of replays) replayIds.set(r.key, await insertReplay(client, partyId, r));
  for (const e of events) {
    await q(
      `INSERT INTO party_events (party_id, at, kind, payload, replay_id)
       VALUES ($1, to_timestamp($2::float8 / 1000.0), $3, $4, $5)`,
      [
        partyId,
        e.at,
        e.kind,
        JSON.stringify(e.payload),
        e.replayKey ? (replayIds.get(e.replayKey) ?? null) : null,
      ],
    );
  }
  if (replays.length) await pruneReplays(client, partyId);
}

/**
 * Processes parties whose current activity has finished. Each party is handled in its own
 * transaction with `FOR UPDATE SKIP LOCKED`, so any number of workers can run at once without
 * ever processing the same party twice. Returns how many parties were advanced.
 */
export async function processDueParties(deps: WorkerDeps, limit = 200): Promise<number> {
  const now = (deps.now ?? Date.now)();
  let processed = 0;
  while (processed < limit) {
    const client = await deps.pool.connect();
    try {
      await client.query('BEGIN');
      const due = await client.query<{ id: string; state: PartyState }>(
        `SELECT id, state FROM parties
         WHERE status = 'active' AND next_tick_at <= to_timestamp($1::float8 / 1000.0)
         ORDER BY next_tick_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [now],
      );
      const row = due.rows[0];
      if (!row) {
        await client.query('COMMIT');
        break;
      }
      const result = advance(row.state, now, deps.world, deps.cfg);
      await persistAdvance(client, row.id, result);
      await client.query('COMMIT');
      processed += 1;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
  return processed;
}

/** Deletes feed entries older than `days` (replays are capped separately). */
export async function pruneOldEvents(pool: Pool, days = 30): Promise<number> {
  const res = await pool.query(
    `DELETE FROM party_events WHERE at < now() - ($1::int * interval '1 day')`,
    [days],
  );
  return res.rowCount ?? 0;
}

export interface WorkerHandle {
  stop(): Promise<void>;
}

/** Polls for due parties. One loop at a time; errors are logged and the loop carries on. */
export function startWorker(
  deps: WorkerDeps,
  opts: { intervalMs?: number; log?: (msg: string, err?: unknown) => void } = {},
): WorkerHandle {
  const interval = opts.intervalMs ?? 2000;
  let running = false;
  let stopped = false;
  let current: Promise<void> = Promise.resolve();
  let lastPrune = 0;

  const loop = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await processDueParties(deps);
      const t = Date.now();
      if (t - lastPrune > 3600_000) {
        lastPrune = t;
        await pruneOldEvents(deps.pool);
      }
    } catch (err) {
      opts.log?.('worker loop failed', err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => {
    current = loop();
  }, interval);
  current = loop();

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await current;
    },
  };
}
