import { gunzipSync, gzipSync } from 'node:zlib';
import { ENGINE_VERSION, LOG_FORMAT_VERSION, type CombatEvent } from '@game/engine';
import type { ReplayOut } from '@game/world';

/** Replays kept per party. Routine fights roll off the end; pinned ones have their own pool. */
export const REPLAY_RING = 100;
export const REPLAY_PINNED = 20;

export function compressEvents(events: CombatEvent[]): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(events)), { level: 9 });
}

export function decompressEvents(blob: Buffer): CombatEvent[] {
  return JSON.parse(gunzipSync(blob).toString('utf8')) as CombatEvent[];
}

/** The part of a pg Pool or PoolClient the game store needs. */
export interface Queryable {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Stores one replay and returns its id. */
export async function insertReplay(db: Queryable, partyId: string, r: ReplayOut): Promise<number> {
  const res = await db.query(
    `INSERT INTO combat_replays (party_id, title, outcome, pinned, engine_version, log_format_version, blob)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      partyId,
      r.title,
      r.outcome,
      r.pinned,
      ENGINE_VERSION,
      LOG_FORMAT_VERSION,
      compressEvents(r.events),
    ],
  );
  return Number(res.rows[0]!.id);
}

/** Keeps only the newest REPLAY_RING routine replays and REPLAY_PINNED pinned ones. */
export async function pruneReplays(db: Queryable, partyId: string): Promise<void> {
  for (const [pinned, keep] of [
    [false, REPLAY_RING],
    [true, REPLAY_PINNED],
  ] as const) {
    await db.query(
      `DELETE FROM combat_replays
       WHERE party_id = $1 AND pinned = $2
         AND id NOT IN (
           SELECT id FROM combat_replays WHERE party_id = $1 AND pinned = $2
           ORDER BY id DESC LIMIT $3
         )`,
      [partyId, pinned, keep],
    );
  }
}
