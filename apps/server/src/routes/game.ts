import { randomInt, randomUUID } from 'node:crypto';
import { addOrderSchema, createPartySchema, seenSchema } from '@game/shared';
import { createParty, type PartyState, type SimConfig, type WorldDef } from '@game/world';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../auth/guard.ts';
import type { Pool } from '../db/pool.ts';
import { decompressEvents } from '../game/replays.ts';
import { publicWorld, summarize } from '../game/summary.ts';
import { HttpError } from '../http-error.ts';

interface Deps {
  pool: Pool;
  world: WorldDef;
  cfg: SimConfig;
}

const idParam = z.object({ id: z.uuid() });
const MAX_ORDERS = 10;

export async function gameRoutes(app: FastifyInstance, { pool, world }: Deps): Promise<void> {
  const auth = authenticate(pool);

  /** The party must exist and belong to the caller; anyone else gets a 404 (no existence leak). */
  async function ownedParty(req: FastifyRequest): Promise<{ id: string; state: PartyState }> {
    const { id } = idParam.parse(req.params);
    const res = await pool.query<{ id: string; state: PartyState }>(
      'SELECT id, state FROM parties WHERE id = $1 AND owner_user_id = $2',
      [id, req.user!.id],
    );
    const row = res.rows[0];
    if (!row) throw new HttpError(404, 'not_found', 'Party not found');
    return row;
  }

  /** Edits the party state under the same row lock the worker uses. */
  async function mutateParty(
    req: FastifyRequest,
    fn: (state: PartyState) => void,
  ): Promise<PartyState> {
    const { id } = idParam.parse(req.params);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<{ state: PartyState }>(
        'SELECT state FROM parties WHERE id = $1 AND owner_user_id = $2 FOR UPDATE',
        [id, req.user!.id],
      );
      const row = res.rows[0];
      if (!row) throw new HttpError(404, 'not_found', 'Party not found');
      fn(row.state);
      await client.query('UPDATE parties SET state = $2, updated_at = now() WHERE id = $1', [
        id,
        JSON.stringify(row.state),
      ]);
      await client.query('COMMIT');
      return row.state;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  app.get('/world', async () => publicWorld(world));

  app.post('/parties', { preHandler: auth }, async (req, reply) => {
    const input = createPartySchema.parse(req.body);
    const state = createParty({
      id: randomUUID(),
      name: input.name,
      mode: input.mode,
      members: input.members,
      seed: randomInt(1, 2 ** 31),
      now: Date.now(),
      world,
    });
    try {
      await pool.query(
        `INSERT INTO parties (id, owner_user_id, name, mode, world_id, state, next_tick_at)
         VALUES ($1,$2,$3,$4,$5,$6, to_timestamp($7::float8 / 1000.0))`,
        [
          state.id,
          req.user!.id,
          state.name,
          state.mode,
          world.id,
          JSON.stringify(state),
          state.nextAt,
        ],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new HttpError(409, 'party_limit', 'You already have an active party');
      }
      throw err;
    }
    return reply.code(201).send({ party: summarize(state, world) });
  });

  app.get('/parties/me', { preHandler: auth }, async (req) => {
    const res = await pool.query<{ state: PartyState }>(
      `SELECT state FROM parties WHERE owner_user_id = $1 ORDER BY (status = 'active') DESC, created_at DESC LIMIT 1`,
      [req.user!.id],
    );
    const row = res.rows[0];
    return { party: row ? summarize(row.state, world) : null };
  });

  app.get('/parties/:id', { preHandler: auth }, async (req) => {
    const { state } = await ownedParty(req);
    return { party: summarize(state, world) };
  });

  // ---- feed ("while you were away") ----

  app.get('/parties/:id/feed', { preHandler: auth }, async (req) => {
    const { id } = await ownedParty(req);
    const q = z
      .object({
        after: z.coerce.number().int().min(0).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      })
      .parse(req.query);
    let after = q.after;
    if (after === undefined) {
      const seen = await pool.query(
        'SELECT last_seen_event_id FROM user_party_seen WHERE user_id = $1 AND party_id = $2',
        [req.user!.id, id],
      );
      after = Number(seen.rows[0]?.last_seen_event_id ?? 0);
    }
    const res = await pool.query(
      `SELECT id, (extract(epoch from at) * 1000)::float8 AS at, kind, payload, replay_id
       FROM party_events WHERE party_id = $1 AND id > $2 ORDER BY id LIMIT $3`,
      [id, after, q.limit + 1],
    );
    const rows = res.rows.slice(0, q.limit);
    return {
      after,
      hasMore: res.rows.length > q.limit,
      events: rows.map((r) => ({
        id: Number(r.id),
        at: r.at,
        kind: r.kind,
        payload: r.payload,
        replayId: r.replay_id === null ? null : Number(r.replay_id),
      })),
    };
  });

  app.post('/parties/:id/feed/seen', { preHandler: auth }, async (req) => {
    const { id } = await ownedParty(req);
    const { upTo } = seenSchema.parse(req.body);
    const res = await pool.query(
      `INSERT INTO user_party_seen (user_id, party_id, last_seen_event_id)
       VALUES ($1, $2, LEAST($3::bigint, COALESCE((SELECT max(id) FROM party_events WHERE party_id = $2), 0)))
       ON CONFLICT (user_id, party_id) DO UPDATE
       SET last_seen_event_id = GREATEST(
         user_party_seen.last_seen_event_id,
         LEAST($3::bigint, COALESCE((SELECT max(id) FROM party_events WHERE party_id = $2), 0)))
       RETURNING last_seen_event_id`,
      [req.user!.id, id, upTo],
    );
    return { lastSeen: Number(res.rows[0].last_seen_event_id) };
  });

  // ---- replays ----

  app.get('/parties/:id/replays', { preHandler: auth }, async (req) => {
    const { id } = await ownedParty(req);
    const res = await pool.query(
      `SELECT id, title, outcome, pinned, created_at FROM combat_replays
       WHERE party_id = $1 ORDER BY id DESC LIMIT 200`,
      [id],
    );
    return {
      replays: res.rows.map((r) => ({
        id: Number(r.id),
        title: r.title,
        outcome: r.outcome,
        pinned: r.pinned,
        createdAt: r.created_at,
      })),
    };
  });

  app.get('/replays/:id', { preHandler: auth }, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const res = await pool.query(
      `SELECT r.id, r.title, r.outcome, r.pinned, r.engine_version, r.log_format_version, r.blob
       FROM combat_replays r JOIN parties p ON p.id = r.party_id
       WHERE r.id = $1 AND p.owner_user_id = $2`,
      [id, req.user!.id],
    );
    const row = res.rows[0];
    if (!row) throw new HttpError(404, 'not_found', 'Replay not found');
    return {
      id: Number(row.id),
      title: row.title,
      outcome: row.outcome,
      pinned: row.pinned,
      engineVersion: row.engine_version,
      logFormatVersion: row.log_format_version,
      events: decompressEvents(row.blob),
    };
  });

  // ---- orders ----

  app.post('/parties/:id/orders', { preHandler: auth }, async (req, reply) => {
    const { siteId } = addOrderSchema.parse(req.body);
    if (!world.sites[siteId]) throw new HttpError(404, 'unknown_site', 'No such place');
    const state = await mutateParty(req, (s) => {
      if (s.status !== 'active') throw new HttpError(409, 'party_dead', 'The party has fallen');
      if (s.orders.length >= MAX_ORDERS)
        throw new HttpError(409, 'too_many_orders', 'Order queue is full');
      if (s.orders.some((o) => o.siteId === siteId)) {
        throw new HttpError(409, 'duplicate_order', 'Already ordered');
      }
      s.orders.push({ id: randomUUID(), kind: 'goto', siteId });
    });
    return reply.code(201).send({ orders: state.orders });
  });

  app.delete('/parties/:id/orders/:orderId', { preHandler: auth }, async (req) => {
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.params);
    const state = await mutateParty(req, (s) => {
      const before = s.orders.length;
      s.orders = s.orders.filter((o) => o.id !== orderId);
      if (s.orders.length === before) throw new HttpError(404, 'not_found', 'Order not found');
    });
    return { orders: state.orders };
  });
}
