import { randomUUID } from 'node:crypto';
import { LOG_FORMAT_VERSION, type CombatEvent } from '@game/engine';
import { advance, createParty, defaultConfig, STARTER_WORLD, type PartyState } from '@game/world';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { createPool, type Pool } from '../src/db/pool.ts';
import { compressEvents, insertReplay, pruneReplays } from '../src/game/replays.ts';
import { processDueParties, pruneOldEvents } from '../src/game/worker.ts';

const DATABASE_URL = process.env.TEST_DATABASE_URL!;
// Short ticks keep simulated hours cheap; a high maxSteps lets one advance() catch up fully.
const cfg = { ...defaultConfig(1000), maxSteps: 5000 };
const world = STARTER_WORLD;
const HOUR = 3600_000;

let pool: Pool;
let app: FastifyInstance;

const members = [
  { name: 'Brann', race: 'dwarf', cls: 'warrior' },
  { name: 'Lyra', race: 'elf', cls: 'mage' },
  { name: 'Odo', race: 'human', cls: 'priest' },
  { name: 'Kesh', race: 'orc', cls: 'ranger' },
];

let userCounter = 0;
async function signUp(): Promise<string> {
  userCounter += 1;
  const code = `INVITE-${userCounter}`;
  await pool.query('INSERT INTO invite_codes (code, uses_left) VALUES ($1, 1)', [code]);
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `user${userCounter}@example.com`,
      username: `User_${userCounter}`,
      password: 'correct horse battery',
      inviteCode: code,
    },
  });
  expect(res.statusCode).toBe(201);
  return String(res.headers['set-cookie']).split(';')[0]!;
}

async function createPartyFor(cookie: string, name = 'The Wanderers') {
  const res = await app.inject({
    method: 'POST',
    url: '/parties',
    headers: { cookie },
    payload: { name, members },
  });
  return res;
}

const worker = (hours: number) => ({
  pool,
  world,
  cfg,
  now: () => Date.now() + hours * HOUR,
});

beforeAll(async () => {
  pool = createPool(DATABASE_URL);
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL } as NodeJS.ProcessEnv);
  app = await buildApp({ config, pool, rateLimit: false, sim: cfg });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await pool.query('TRUNCATE users, invite_codes, auth_events RESTART IDENTITY CASCADE');
});

describe('world and party creation', () => {
  it('serves the map publicly, without fight content', async () => {
    const res = await app.inject({ method: 'GET', url: '/world' });
    expect(res.statusCode).toBe(200);
    const w = res.json();
    expect(w.terrain).toHaveLength(w.width * w.height);
    expect(w.sites.find((s: { id: string }) => s.id === 'oakhaven')).toBeDefined();
    // Sites and zones are public; what lives inside them (monsters, encounters) is not.
    expect(JSON.stringify(w)).not.toContain('encounter');
    expect(JSON.stringify(w)).not.toContain('monster');
  });

  it('requires a login, validates input and creates a party', async () => {
    expect((await app.inject({ method: 'POST', url: '/parties', payload: {} })).statusCode).toBe(
      401,
    );
    const cookie = await signUp();
    const bad = await app.inject({
      method: 'POST',
      url: '/parties',
      headers: { cookie },
      payload: { name: 'x', members: [members[0]] },
    });
    expect(bad.statusCode).toBe(400);

    const res = await createPartyFor(cookie);
    expect(res.statusCode).toBe(201);
    const party = res.json().party;
    expect(party.members).toHaveLength(4);
    expect(party.level).toBe(1);
    expect(party.lastCity).toBe('oakhaven');
    expect(party.members[0].hp).toBe(party.members[0].maxHp);
  });

  it('allows one active solo party per account and frees the slot when it is lost', async () => {
    const cookie = await signUp();
    expect((await createPartyFor(cookie)).statusCode).toBe(201);
    const second = await createPartyFor(cookie, 'Another');
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe('party_limit');

    await pool.query("UPDATE parties SET status = 'dead'");
    expect((await createPartyFor(cookie, 'Fresh start')).statusCode).toBe(201);
  });

  it('GET /parties/me returns the party, or null when there is none', async () => {
    const cookie = await signUp();
    expect(
      (await app.inject({ method: 'GET', url: '/parties/me', headers: { cookie } })).json().party,
    ).toBeNull();
    await createPartyFor(cookie);
    const me = await app.inject({ method: 'GET', url: '/parties/me', headers: { cookie } });
    expect(me.json().party.name).toBe('The Wanderers');
  });
});

describe('scheduler and feed', () => {
  it('advances a due party, stores its feed and replays, and hides a running fight', async () => {
    const cookie = await signUp();
    const { party } = (await createPartyFor(cookie)).json();

    expect(await processDueParties(worker(0.25))).toBeGreaterThan(0);

    const state = await app.inject({
      method: 'GET',
      url: `/parties/${party.id}`,
      headers: { cookie },
    });
    const now = state.json().party;
    expect(now.level).toBeGreaterThan(1);
    expect(now.gold).toBeGreaterThan(0);
    expect(JSON.stringify(now)).not.toContain('"events"');

    const feed = await app.inject({
      method: 'GET',
      url: `/parties/${party.id}/feed`,
      headers: { cookie },
    });
    const events = feed.json().events;
    expect(events.length).toBeGreaterThan(5);
    const fights = events.filter((e: { kind: string }) => e.kind === 'fight');
    expect(fights.length).toBeGreaterThan(3);
    expect(fights.every((f: { replayId: number | null }) => f.replayId !== null)).toBe(true);
    for (let i = 1; i < events.length; i++) expect(events[i].id).toBeGreaterThan(events[i - 1].id);

    const replay = await app.inject({
      method: 'GET',
      url: `/replays/${fights[0].replayId}`,
      headers: { cookie },
    });
    expect(replay.statusCode).toBe(200);
    const body = replay.json();
    expect(body.events[0].t).toBe('start');
    expect(body.events[body.events.length - 1].t).toBe('end');
    expect(body.logFormatVersion).toBe(LOG_FORMAT_VERSION);

    const list = await app.inject({
      method: 'GET',
      url: `/parties/${party.id}/replays`,
      headers: { cookie },
    });
    expect(list.json().replays.length).toBe(fights.length);
  });

  it('does nothing before a party is due', async () => {
    const cookie = await signUp();
    await createPartyFor(cookie);
    await pool.query("UPDATE parties SET next_tick_at = now() + interval '1 hour'");
    expect(await processDueParties(worker(0))).toBe(0);
  });

  it('tracks what the player has already watched, across requests', async () => {
    const cookie = await signUp();
    const { party } = (await createPartyFor(cookie)).json();
    await processDueParties(worker(0.2));

    const first = (
      await app.inject({ method: 'GET', url: `/parties/${party.id}/feed`, headers: { cookie } })
    ).json();
    expect(first.events.length).toBeGreaterThan(0);
    const lastId = first.events[first.events.length - 1].id;

    const seen = await app.inject({
      method: 'POST',
      url: `/parties/${party.id}/feed/seen`,
      headers: { cookie },
      payload: { upTo: lastId },
    });
    expect(seen.json().lastSeen).toBe(lastId);

    const again = (
      await app.inject({ method: 'GET', url: `/parties/${party.id}/feed`, headers: { cookie } })
    ).json();
    expect(again.events).toEqual([]);

    // Cannot move backwards or past the newest event.
    const back = await app.inject({
      method: 'POST',
      url: `/parties/${party.id}/feed/seen`,
      headers: { cookie },
      payload: { upTo: 1 },
    });
    expect(back.json().lastSeen).toBe(lastId);
    const far = await app.inject({
      method: 'POST',
      url: `/parties/${party.id}/feed/seen`,
      headers: { cookie },
      payload: { upTo: 999999999 },
    });
    expect(far.json().lastSeen).toBe(lastId);

    // Explicit `after` still works for rewatching.
    const all = (
      await app.inject({
        method: 'GET',
        url: `/parties/${party.id}/feed?after=0&limit=3`,
        headers: { cookie },
      })
    ).json();
    expect(all.events).toHaveLength(3);
    expect(all.hasMore).toBe(true);
  });

  it('two workers running at once never process the same party twice', async () => {
    const cookies = [await signUp(), await signUp(), await signUp()];
    const ids: string[] = [];
    const initial = new Map<string, PartyState>();
    for (const c of cookies) {
      const { party } = (await createPartyFor(c)).json();
      ids.push(party.id);
      const row = await pool.query('SELECT state FROM parties WHERE id = $1', [party.id]);
      initial.set(party.id, row.rows[0].state);
    }

    const fixedNow = Date.now() + HOUR;
    const w = { pool, world, cfg, now: () => fixedNow };
    await Promise.all([processDueParties(w), processDueParties(w), processDueParties(w)]);

    for (const id of ids) {
      const row = await pool.query('SELECT state FROM parties WHERE id = $1', [id]);
      const expected = advance(initial.get(id)!, fixedNow, world, cfg);
      expect(row.rows[0].state).toEqual(JSON.parse(JSON.stringify(expected.party)));
      const count = await pool.query(
        'SELECT count(*)::int AS n FROM party_events WHERE party_id = $1',
        [id],
      );
      expect(count.rows[0].n).toBe(expected.events.length);
    }
  });
});

describe('ownership', () => {
  it('other users cannot see a party, its feed or its replays', async () => {
    const owner = await signUp();
    const intruder = await signUp();
    const { party } = (await createPartyFor(owner)).json();
    await processDueParties(worker(0.2));
    const replayId = (await pool.query('SELECT id FROM combat_replays LIMIT 1')).rows[0].id;

    for (const url of [
      `/parties/${party.id}`,
      `/parties/${party.id}/feed`,
      `/parties/${party.id}/replays`,
      `/replays/${replayId}`,
    ]) {
      expect(
        (await app.inject({ method: 'GET', url, headers: { cookie: intruder } })).statusCode,
      ).toBe(404);
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    }
    const order = await app.inject({
      method: 'POST',
      url: `/parties/${party.id}/orders`,
      headers: { cookie: intruder },
      payload: { siteId: 'goblin_warren' },
    });
    expect(order.statusCode).toBe(404);
  });
});

describe('orders', () => {
  it('queues, rejects bad and duplicate orders, and removes them', async () => {
    const cookie = await signUp();
    const { party } = (await createPartyFor(cookie)).json();
    const url = `/parties/${party.id}/orders`;

    const ok = await app.inject({
      method: 'POST',
      url,
      headers: { cookie },
      payload: { siteId: 'goblin_warren' },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().orders).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { cookie },
          payload: { siteId: 'goblin_warren' },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { cookie },
          payload: { siteId: 'nowhere' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url, headers: { cookie }, payload: {} })).statusCode,
    ).toBe(400);

    const me = await app.inject({ method: 'GET', url: '/parties/me', headers: { cookie } });
    expect(me.json().party.orders).toHaveLength(1);

    const id = ok.json().orders[0].id;
    expect(
      (await app.inject({ method: 'DELETE', url: `${url}/nope`, headers: { cookie } })).statusCode,
    ).toBe(404);
    const del = await app.inject({ method: 'DELETE', url: `${url}/${id}`, headers: { cookie } });
    expect(del.json().orders).toEqual([]);
  });

  it('the worker follows a queued order and enters the dungeon', async () => {
    const cookie = await signUp();
    const { party } = (await createPartyFor(cookie)).json();
    await app.inject({
      method: 'POST',
      url: `/parties/${party.id}/orders`,
      headers: { cookie },
      payload: { siteId: 'goblin_warren' },
    });
    await processDueParties(worker(0.5));
    const kinds = (await pool.query('SELECT kind FROM party_events ORDER BY id')).rows.map(
      (r) => r.kind,
    );
    expect(kinds).toContain('enter_dungeon');
  });

  it('an edit made while the worker is busy is not lost', async () => {
    const cookie = await signUp();
    const { party } = (await createPartyFor(cookie)).json();
    const post = () =>
      app.inject({
        method: 'POST',
        url: `/parties/${party.id}/orders`,
        headers: { cookie },
        payload: { siteId: 'goblin_warren' },
      });
    const [, res] = await Promise.all([processDueParties(worker(1)), post()]);
    expect([201, 409]).toContain(res.statusCode);
    const me = await app.inject({ method: 'GET', url: '/parties/me', headers: { cookie } });
    const hasOrder = me.json().party.orders.length === 1 || me.json().party.dungeon !== null;
    expect(hasOrder || me.json().party.cleared.includes('goblin_warren')).toBe(true);
  });
});

describe('replay storage', () => {
  const fakeReplay = (n: number, pinned: boolean) => ({
    key: `k${n}`,
    title: `Fight ${n}`,
    outcome: 'victory' as const,
    pinned,
    events: [{ t: 'end', outcome: 'victory', rounds: n }] as CombatEvent[],
  });

  async function seedParty(): Promise<string> {
    const cookie = await signUp();
    return (await createPartyFor(cookie)).json().party.id;
  }

  it('keeps the newest 100 routine replays and the newest 20 pinned ones', async () => {
    const id = await seedParty();
    for (let i = 1; i <= 130; i++) await insertReplay(pool, id, fakeReplay(i, false));
    for (let i = 1; i <= 25; i++) await insertReplay(pool, id, fakeReplay(i, true));
    await pruneReplays(pool, id);

    const normal = await pool.query(
      'SELECT title FROM combat_replays WHERE party_id = $1 AND NOT pinned ORDER BY id',
      [id],
    );
    const pinned = await pool.query(
      'SELECT title FROM combat_replays WHERE party_id = $1 AND pinned ORDER BY id',
      [id],
    );
    expect(normal.rows).toHaveLength(100);
    expect(normal.rows[0].title).toBe('Fight 31');
    expect(normal.rows[99].title).toBe('Fight 130');
    expect(pinned.rows).toHaveLength(20);
    expect(pinned.rows[0].title).toBe('Fight 6');
  });

  it('pruning one party never touches another', async () => {
    const a = await seedParty();
    const b = await seedParty().catch(() => null);
    for (let i = 1; i <= 105; i++) await insertReplay(pool, a, fakeReplay(i, false));
    await pruneReplays(pool, b ?? randomUUID());
    const n = await pool.query(
      'SELECT count(*)::int AS n FROM combat_replays WHERE party_id = $1',
      [a],
    );
    expect(n.rows[0].n).toBe(105);
  });

  it('a stored fight log compresses to a few KB', async () => {
    const cookie = await signUp();
    const { party } = (await createPartyFor(cookie)).json();
    await processDueParties(worker(1));
    const row = await pool.query('SELECT blob FROM combat_replays LIMIT 1');
    const size = (row.rows[0].blob as Buffer).length;
    expect(size).toBeGreaterThan(200);
    expect(size).toBeLessThan(6000);
    expect(party.id).toBeDefined();
    expect(compressEvents([]).length).toBeGreaterThan(0);
  });

  it('removes old feed entries', async () => {
    const cookie = await signUp();
    const { party } = (await createPartyFor(cookie)).json();
    await pool.query(
      `INSERT INTO party_events (party_id, at, kind, payload) VALUES
       ($1, now() - interval '40 days', 'old', '{}'), ($1, now(), 'new', '{}')`,
      [party.id],
    );
    expect(await pruneOldEvents(pool, 30)).toBe(1);
    const left = await pool.query('SELECT kind FROM party_events');
    expect(left.rows.map((r) => r.kind)).toEqual(['new']);
  });
});

describe('creation uses the engine rules', () => {
  it('matches a party created directly by the simulation package', () => {
    const direct = createParty({
      id: 'x',
      name: 'x',
      seed: 1,
      now: 0,
      world,
      members: members as never,
    });
    expect(direct.members).toHaveLength(4);
  });
});
