import { defaultConfig, type PartyState } from '@game/world';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { createPool, type Pool } from '../src/db/pool.ts';
import { processDueParties } from '../src/game/worker.ts';

const DATABASE_URL = process.env.TEST_DATABASE_URL!;
const cfg = { ...defaultConfig(1000), maxSteps: 5000 };

let pool: Pool;
let app: FastifyInstance;

const members = [
  { name: 'Brann', race: 'dwarf', cls: 'warrior' },
  { name: 'Lyra', race: 'elf', cls: 'mage' },
  { name: 'Odo', race: 'human', cls: 'priest' },
  { name: 'Kesh', race: 'orc', cls: 'ranger' },
];

let n = 0;
async function signUp(): Promise<string> {
  n += 1;
  await pool.query('INSERT INTO invite_codes (code, uses_left) VALUES ($1, 1)', [`QINV-${n}`]);
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `q${n}@example.com`,
      username: `Quester_${n}`,
      password: 'correct horse battery',
      inviteCode: `QINV-${n}`,
    },
  });
  return String(res.headers['set-cookie']).split(';')[0]!;
}

async function newParty(cookie: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/parties',
    headers: { cookie },
    payload: { name: 'The Questers', members },
  });
  return res.json().party.id;
}

const call = (cookie: string, method: 'POST' | 'DELETE' | 'GET', url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie }, payload });

async function patch(id: string, fn: (s: PartyState) => void) {
  const s = (await pool.query('SELECT state FROM parties WHERE id = $1', [id])).rows[0]
    .state as PartyState;
  fn(s);
  await pool.query('UPDATE parties SET state = $2 WHERE id = $1', [id, JSON.stringify(s)]);
}

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

describe('quest log', () => {
  it('lists every quest with its status, objectives and reward', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    const { quests } = (await call(cookie, 'GET', `/parties/${id}/quests`)).json();
    const by = (q: string) => quests.find((x: { id: string }) => x.id === q);

    expect(by('pest_control')).toMatchObject({
      status: 'available',
      repeatable: false,
      objectives: [{ label: 'Defeat 8 Goblins', progress: 0, target: 8, done: false }],
      reward: { gold: 60, xp: 160 },
    });
    expect(by('clear_the_warren').status).toBe('locked');
    expect(by('clear_the_warren').reason).toMatch(/level|Scout the warren/);
    expect(by('goblin_bounty').repeatable).toBe(true);
    expect(by('goblin_king').opens).toBe("Goblin King's Keep");
    expect(by('wolves_at_the_door').reward.item).toMatchObject({ rarity: 'uncommon' });
  });

  it('accepting puts the quest in the summary and in the order list', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    const res = await call(cookie, 'POST', `/parties/${id}/quests/pest_control/accept`);
    expect(res.statusCode).toBe(200);
    const party = res.json().party;
    expect(party.quests.active).toHaveLength(1);
    expect(party.quests.active[0]).toMatchObject({ id: 'pest_control', status: 'active' });
    expect(party.orders[0]).toMatchObject({
      kind: 'quest',
      questId: 'pest_control',
      label: 'Quest: Pest control',
      targetSiteId: null,
    });

    expect(
      (await call(cookie, 'POST', `/parties/${id}/quests/pest_control/accept`)).statusCode,
    ).toBe(409);
    expect(
      (await call(cookie, 'POST', `/parties/${id}/quests/clear_the_warren/accept`)).statusCode,
    ).toBe(409);
    expect((await call(cookie, 'POST', `/parties/${id}/quests/nonsense/accept`)).statusCode).toBe(
      404,
    );
  });

  it('abandoning removes the quest and its order', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    await call(cookie, 'POST', `/parties/${id}/quests/pest_control/accept`);
    const res = await call(cookie, 'DELETE', `/parties/${id}/quests/pest_control`);
    expect(res.json().party.quests.active).toEqual([]);
    expect(res.json().party.orders).toEqual([]);
    expect((await call(cookie, 'DELETE', `/parties/${id}/quests/pest_control`)).statusCode).toBe(
      404,
    );
  });

  it("nobody else can read or change a party's quests", async () => {
    const owner = await signUp();
    const intruder = await signUp();
    const id = await newParty(owner);
    expect((await call(intruder, 'GET', `/parties/${id}/quests`)).statusCode).toBe(404);
    expect(
      (await call(intruder, 'POST', `/parties/${id}/quests/pest_control/accept`)).statusCode,
    ).toBe(404);
    expect((await call(owner, 'GET', `/parties/${id}/quests`)).statusCode).toBe(200);
  });

  it('shows quest orders pointing at a place, for the map', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    await patch(id, (s) => {
      s.level = 3;
      s.quests.completed = ['scout_the_warren'];
    });
    const res = await call(cookie, 'POST', `/parties/${id}/quests/clear_the_warren/accept`);
    expect(res.statusCode).toBe(200);
    expect(res.json().party.orders[0].targetSiteId).toBe('goblin_warren');
  });
});

describe('boss dungeons', () => {
  it('are public with the quest they need, and refuse a plain order without it', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    const world = (await app.inject({ method: 'GET', url: '/world' })).json();
    const keep = world.sites.find((s: { id: string }) => s.id === 'goblin_keep');
    expect(keep.requiresQuest).toEqual({ id: 'goblin_king', name: 'The Goblin King' });

    const refused = await call(cookie, 'POST', `/parties/${id}/orders`, { siteId: 'goblin_keep' });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe('quest_required');

    await patch(id, (s) => {
      s.level = 6;
      s.quests.completed = ['clear_the_warren'];
    });
    expect(
      (await call(cookie, 'POST', `/parties/${id}/quests/goblin_king/accept`)).statusCode,
    ).toBe(200);
    expect(
      (await call(cookie, 'POST', `/parties/${id}/orders`, { siteId: 'goblin_keep' })).statusCode,
    ).toBe(201);
  });
});

describe('playing', () => {
  it('the worker works on a kill quest, pays it out, and the feed and log show it', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    await call(cookie, 'POST', `/parties/${id}/quests/pest_control/accept`);

    await processDueParties({
      pool,
      world: (await import('@game/world')).STARTER_WORLD,
      cfg,
      now: () => Date.now() + 1800_000,
    });

    const feed = (await call(cookie, 'GET', `/parties/${id}/feed?after=0&limit=500`)).json();
    const done = feed.events.find((e: { kind: string }) => e.kind === 'quest_completed');
    expect(done.payload).toMatchObject({ questId: 'pest_control', name: 'Pest control', gold: 60 });

    const { quests } = (await call(cookie, 'GET', `/parties/${id}/quests`)).json();
    expect(quests.find((q: { id: string }) => q.id === 'pest_control').status).toBe('completed');
    const me = (await call(cookie, 'GET', '/parties/me')).json().party;
    expect(me.quests.completedCount).toBe(1);
    expect(me.quests.active).toEqual([]);
    expect(me.orders).toEqual([]);
  });
});
