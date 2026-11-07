import { defaultConfig, memberDerived, STARTER_WORLD, type PartyState } from '@game/world';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { createPool, type Pool } from '../src/db/pool.ts';

const DATABASE_URL = process.env.TEST_DATABASE_URL!;
const cfg = { ...defaultConfig(1000), maxSteps: 5000 };
const world = STARTER_WORLD;

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
  await pool.query('INSERT INTO invite_codes (code, uses_left) VALUES ($1, 1)', [`INV-${n}`]);
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `m${n}@example.com`,
      username: `Manager_${n}`,
      password: 'correct horse battery',
      inviteCode: `INV-${n}`,
    },
  });
  return String(res.headers['set-cookie']).split(';')[0]!;
}

async function newParty(cookie: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/parties',
    headers: { cookie },
    payload: { name: 'The Managers', members },
  });
  expect(res.statusCode).toBe(201);
  return res.json().party.id;
}

async function stateOf(id: string): Promise<PartyState> {
  return (await pool.query('SELECT state FROM parties WHERE id = $1', [id])).rows[0].state;
}

/** Edit the stored state directly to set up a scenario. */
async function patch(id: string, fn: (s: PartyState) => void) {
  const s = await stateOf(id);
  fn(s);
  await pool.query(
    `UPDATE parties SET state = $2, next_tick_at = to_timestamp($3::float8 / 1000.0) WHERE id = $1`,
    [id, JSON.stringify(s), s.nextAt ?? Date.now() + 3600_000],
  );
}

const sword = {
  id: 'sw1',
  name: 'Rusty Sword',
  rarity: 'common',
  itemLevel: 4,
  value: 20,
  favorite: false,
  slot: 'weapon',
  bonuses: { str: 3, dex: 1 },
};

const call = (
  cookie: string,
  method: 'POST' | 'PUT' | 'DELETE' | 'GET',
  url: string,
  payload?: object,
) => app.inject({ method, url, headers: { cookie }, payload });

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

describe('summary', () => {
  it('shows attributes, equipment, skills, ai and points for every member', async () => {
    const cookie = await signUp();
    await newParty(cookie);
    const { party } = (await call(cookie, 'GET', '/parties/me')).json();
    const m = party.members[0];
    expect(m.attributes.total.str).toBeGreaterThan(0);
    expect(m.attributes.base).toBeDefined();
    expect(m.equipment.weapon.weapon.max).toBeGreaterThan(0);
    expect(m.combat.weapon).toEqual(m.equipment.weapon.weapon);
    expect(Object.keys(m.combat.resist).length).toBeGreaterThan(0);
    expect(m.skills).toContain('attack');
    expect(m.ai.length).toBeGreaterThan(0);
    expect(m.autoAlloc).toBe(true);
    expect(party.inTown).toBe(false);
  });

  it('serves the skill catalog publicly', async () => {
    const res = await app.inject({ method: 'GET', url: '/content/skills' });
    expect(res.statusCode).toBe(200);
    const fire = res.json().skills.find((s: { id: string }) => s.id === 'fireball');
    expect(fire).toMatchObject({ manaCost: 8, range: 5, radius: 1 });
  });
});

describe('gear and bag', () => {
  it('equips, unequips, favorites and discards through the API', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    await patch(id, (s) => {
      for (const m of s.members) m.equipment = {};
      s.bag.push(sword as never, { ...sword, id: 'sw2' } as never);
    });
    const base = `/parties/${id}`;

    const eq = await call(cookie, 'POST', `${base}/equip`, { memberId: 'm1', itemId: 'sw1' });
    expect(eq.statusCode).toBe(200);
    const m = eq.json().party.members[0];
    expect(m.equipment.weapon.id).toBe('sw1');
    expect(m.attributes.gear.str).toBe(3);

    expect(
      (await call(cookie, 'POST', `${base}/equip`, { memberId: 'm1', itemId: 'nope' })).statusCode,
    ).toBe(404);
    expect(
      (await call(cookie, 'POST', `${base}/equip`, { memberId: 'zz', itemId: 'sw2' })).statusCode,
    ).toBe(404);

    const fav = await call(cookie, 'POST', `${base}/items/sw2/favorite`, { value: true });
    expect(fav.json().party.bag[0].favorite).toBe(true);
    expect((await call(cookie, 'DELETE', `${base}/items/sw2`)).statusCode).toBe(409);
    await call(cookie, 'POST', `${base}/items/sw2/favorite`, { value: false });
    expect((await call(cookie, 'DELETE', `${base}/items/sw2`)).json().party.bag).toHaveLength(0);

    const un = await call(cookie, 'POST', `${base}/unequip`, { memberId: 'm1', slot: 'weapon' });
    expect(un.json().party.members[0].equipment).toEqual({});
    expect(un.json().party.bag).toHaveLength(1);
    expect(
      (await call(cookie, 'POST', `${base}/unequip`, { memberId: 'm1', slot: 'sword' })).statusCode,
    ).toBe(400);
  });

  it('moves items between bags and worn slots, and sorts the shared bag', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    await patch(id, (s) => {
      for (const m of s.members) m.equipment = {};
      s.bag.push(
        sword as never,
        { ...sword, id: 'sw2', rarity: 'epic' } as never,
        { ...sword, id: 'sw3', slot: undefined } as never,
      );
    });
    const base = `/parties/${id}`;
    const move = (itemId: string, to: unknown) =>
      call(cookie, 'POST', `${base}/move`, { itemId, to });

    const first = (await call(cookie, 'GET', '/parties/me')).json().party;
    expect(first.bagSize).toBe(40);
    expect(first.personalBagSize).toBe(5);
    expect(first.members[0].bag).toEqual([]);

    const toPersonal = await move('sw1', { kind: 'personal', memberId: 'm2' });
    expect(toPersonal.statusCode).toBe(200);
    expect(toPersonal.json().party.members[1].bag.map((i: { id: string }) => i.id)).toEqual([
      'sw1',
    ]);
    expect(toPersonal.json().party.bag).toHaveLength(2);

    const worn = await move('sw1', { kind: 'equip', memberId: 'm1' });
    expect(worn.json().party.members[0].equipment.weapon.id).toBe('sw1');
    expect(worn.json().party.members[1].bag).toEqual([]);

    expect((await move('sw3', { kind: 'equip', memberId: 'm1' })).statusCode).toBe(409);
    expect((await move('nope', { kind: 'bag' })).statusCode).toBe(404);
    expect((await move('sw2', { kind: 'personal', memberId: 'zz' })).statusCode).toBe(404);
    expect((await move('sw2', { kind: 'spaceship' })).statusCode).toBe(400);

    const sorted = await call(cookie, 'POST', `${base}/sort-bag`);
    expect(sorted.json().party.bag.map((i: { id: string }) => i.id)).toEqual(['sw2', 'sw3']);
  });

  it("another player cannot move a party's items", async () => {
    const owner = await signUp();
    const intruder = await signUp();
    const id = await newParty(owner);
    await patch(id, (s) => void s.bag.push(sword as never));
    const res = await call(intruder, 'POST', `/parties/${id}/move`, {
      itemId: 'sw1',
      to: { kind: 'personal', memberId: 'm1' },
    });
    expect(res.statusCode).toBe(404);
    expect((await stateOf(id)).bag).toHaveLength(1);
  });

  it("another player's actions are refused", async () => {
    const owner = await signUp();
    const intruder = await signUp();
    const id = await newParty(owner);
    await patch(id, (s) => void s.bag.push(sword as never));
    const res = await call(intruder, 'POST', `/parties/${id}/equip`, {
      memberId: 'm1',
      itemId: 'sw1',
    });
    expect(res.statusCode).toBe(404);
    expect((await stateOf(id)).bag).toHaveLength(1);
  });
});

describe('points and combat AI', () => {
  it('spends points, resets them and toggles auto-spend', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    await patch(id, (s) => {
      s.members[0]!.points = 3;
      s.members[0]!.autoAlloc = false;
    });
    const base = `/parties/${id}/members/m1`;
    const ok = await call(cookie, 'POST', `${base}/allocate`, { alloc: { str: 2, dex: 1 } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().party.members[0]).toMatchObject({ points: 0 });
    expect(ok.json().party.members[0].attributes.alloc.str).toBe(2);
    expect((await call(cookie, 'POST', `${base}/allocate`, { alloc: { str: 1 } })).statusCode).toBe(
      409,
    );
    expect(
      (await call(cookie, 'POST', `${base}/allocate`, { alloc: { str: -1 } })).statusCode,
    ).toBe(400);

    const reset = await call(cookie, 'POST', `${base}/reset-points`);
    expect(reset.json().party.members[0].points).toBe(3);
    const auto = await call(cookie, 'POST', `${base}/auto-alloc`, { auto: true });
    expect(auto.json().party.members[0].autoAlloc).toBe(true);
  });

  it('saves valid AI rules, rejects invalid ones, and can reset to the class default', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    const url = `/parties/${id}/members/m1/ai`;
    const good = await call(cookie, 'PUT', url, {
      rules: [
        { skill: 'power_strike', when: { selfManaAbovePct: 40 } },
        { skill: 'attack', order: 'lowest_hp' },
      ],
    });
    expect(good.statusCode).toBe(200);
    expect(good.json().party.members[0].ai).toHaveLength(2);

    const bad = await call(cookie, 'PUT', url, { rules: [{ skill: 'fireball' }] });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe('bad_rules');
    expect((await call(cookie, 'PUT', url, { rules: 'x' })).statusCode).toBe(400);
    expect((await stateOf(id)).members[0]!.ai).toHaveLength(2);

    const reset = await call(cookie, 'POST', `${url}/reset`);
    expect(reset.json().party.members[0].ai[0].skill).toBe('war_cry');
  });
});

describe('orders', () => {
  it('reorders orders', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    for (const siteId of ['goblin_warren', 'oakhaven']) {
      await call(cookie, 'POST', `/parties/${id}/orders`, { siteId });
    }
    const orders = (await stateOf(id)).orders;
    const res = await call(cookie, 'POST', `/parties/${id}/orders/${orders[1]!.id}/move`, {
      dir: -1,
    });
    expect(res.json().party.orders.map((o: { siteId: string }) => o.siteId)).toEqual([
      'oakhaven',
      'goblin_warren',
    ]);
    expect(
      (await call(cookie, 'POST', `/parties/${id}/orders/zz/move`, { dir: 1 })).statusCode,
    ).toBe(404);
    expect(
      (await call(cookie, 'POST', `/parties/${id}/orders/${orders[0]!.id}/move`, { dir: 2 }))
        .statusCode,
    ).toBe(400);
  });
});

describe('city', () => {
  /** The party waits in Oakhaven, as it does after an order or a defeat. */
  async function inTown(id: string, gold = 500) {
    await patch(id, (s) => {
      s.activity = { kind: 'town', startedAt: Date.now(), ticks: 60 };
      s.nextAt = Date.now() + 3600_000;
      s.members[0]!.gold = gold;
      s.visited = ['oakhaven', 'stonebridge'];
    });
  }

  it('is closed while the party is out hunting', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    await patch(id, (s) => {
      s.activity = { kind: 'fight' } as never;
    });
    expect((await call(cookie, 'GET', `/parties/${id}/city`)).statusCode).toBe(409);
    expect(
      (await call(cookie, 'POST', `/parties/${id}/city/sell`, { itemIds: ['x'] })).statusCode,
    ).toBe(409);
  });

  it('shows the shop and teleports, sells and buys', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    await inTown(id);
    await patch(id, (s) => void s.bag.push({ ...sword, value: 40 } as never));
    const base = `/parties/${id}`;

    const info = (await call(cookie, 'GET', `${base}/city`)).json();
    expect(info.city.id).toBe('oakhaven');
    expect(info.stock.length).toBeGreaterThan(5);
    expect(info.teleports.map((t: { siteId: string }) => t.siteId)).toEqual(['stonebridge']);
    expect((await call(cookie, 'GET', `/parties/me`)).json().party.city.name).toBe('Oakhaven');

    const sold = await call(cookie, 'POST', `${base}/city/sell`, { itemIds: ['sw1'] });
    expect(sold.json().party.gold).toBe(540);
    expect(sold.json().party.bag).toHaveLength(0);

    const stock = info.stock[0];
    const bought = await call(cookie, 'POST', `${base}/city/buy`, { stockId: stock.id });
    expect(bought.json().party.gold).toBe(540 - stock.price);
    expect(bought.json().party.bag[0].name).toBe(stock.name);
    expect((await call(cookie, 'POST', `${base}/city/buy`, { stockId: 'nope' })).statusCode).toBe(
      404,
    );

    // Solo parties spend the gold of every character, so empty them all first.
    await patch(id, (s) => {
      for (const m of s.members) m.gold = 0;
      s.members[0]!.gold = 1;
    });
    expect((await call(cookie, 'POST', `${base}/city/buy`, { stockId: stock.id })).statusCode).toBe(
      409,
    );
    expect(
      (await call(cookie, 'POST', `${base}/city/teleport`, { siteId: 'stonebridge' })).statusCode,
    ).toBe(409);

    await patch(id, (s) => void (s.members[0]!.gold = 500));
    const tp = await call(cookie, 'POST', `${base}/city/teleport`, { siteId: 'stonebridge' });
    expect(tp.statusCode).toBe(200);
    expect(tp.json().party.city.name).toBe('Stonebridge');
    const events = await pool.query('SELECT kind FROM party_events WHERE party_id = $1', [id]);
    expect(events.rows.map((r) => r.kind)).toContain('teleport');
  });

  it('leaving town or a new order wakes the party immediately', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    await inTown(id);
    const before = (await pool.query('SELECT next_tick_at FROM parties WHERE id = $1', [id]))
      .rows[0].next_tick_at;
    expect(new Date(before).getTime()).toBeGreaterThan(Date.now() + 1800_000);

    await call(cookie, 'POST', `/parties/${id}/orders`, { siteId: 'goblin_warren' });
    const after = (await pool.query('SELECT next_tick_at FROM parties WHERE id = $1', [id])).rows[0]
      .next_tick_at;
    expect(new Date(after).getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    await inTown(id);
    const left = await call(cookie, 'POST', `/parties/${id}/town/leave`);
    expect(left.statusCode).toBe(200);
    // Not waiting in town (here: resting) there is nothing to leave.
    await patch(id, (s) => {
      s.activity = { kind: 'rest', startedAt: Date.now(), ticks: 5, forced: false };
    });
    expect((await call(cookie, 'POST', `/parties/${id}/town/leave`)).statusCode).toBe(409);
  });
});

describe('older saved parties', () => {
  it('load and play after the new fields are missing from the stored state', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    await patch(id, (s) => {
      const loose = s as unknown as Record<string, unknown>;
      delete loose.visited;
      for (const m of s.members as unknown as Array<Record<string, unknown>>) {
        delete m.equipment;
        delete m.alloc;
        delete m.ai;
        delete m.skills;
      }
    });
    const me = await call(cookie, 'GET', '/parties/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().party.members[0].ai.length).toBeGreaterThan(0);
    const d = memberDerived({ race: 'dwarf', cls: 'warrior' }, 1);
    expect(me.json().party.members[0].maxHp).toBe(d.maxHp);
    void world;
  });
});

describe('gold and ownership', () => {
  it('shows each character its own gold and who is yours', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    await patch(id, (s) => {
      s.members[0]!.gold = 30;
      s.members[1]!.gold = 12;
    });
    const p = (await call(cookie, 'GET', `/parties/${id}`)).json().party;
    expect(p.members.map((m: { gold: number }) => m.gold)).toEqual([30, 12, 0, 0]);
    expect(p.gold).toBe(42);
    expect(p.spendableGold).toBe(42);
    expect(p.members.every((m: { mine: boolean }) => m.mine)).toBe(true);
    expect(p.pendingItems).toEqual([]);
    // Creating the party gave every character to its creator.
    const stored = await stateOf(id);
    expect(stored.members.every((m) => m.ownerId)).toBe(true);
  });

  it('sends gold between characters', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    await patch(id, (s) => void (s.members[0]!.gold = 50));
    const url = `/parties/${id}/gold/send`;
    const ok = await call(cookie, 'POST', url, { fromId: 'm1', toId: 'm3', amount: 20 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().party.members.map((m: { gold: number }) => m.gold)).toEqual([30, 0, 20, 0]);
    const bad = (body: object) => call(cookie, 'POST', url, body).then((r) => r.statusCode);
    expect(await bad({ fromId: 'm1', toId: 'm3', amount: 31 })).toBe(409);
    expect(await bad({ fromId: 'm1', toId: 'zz', amount: 1 })).toBe(404);
    expect(await bad({ fromId: 'm1', toId: 'm1', amount: 1 })).toBe(400);
    expect(await bad({ fromId: 'm1', toId: 'm3', amount: 0 })).toBe(400);
    expect(await bad({ fromId: 'm1', toId: 'm3', amount: 1.5 })).toBe(400);
  });

  it('lets only the owner of a character touch its gold, gear and bag', async () => {
    const cookie = await signUp();
    const id = await newParty(cookie);
    await patch(id, (s) => {
      // Another player owns Lyra (m2) and her things.
      s.members[1]!.ownerId = '00000000-0000-0000-0000-000000000000';
      s.members[1]!.gold = 40;
      s.members[1]!.bag.push({ ...sword, id: 'lyra_sw' } as never);
      s.bag.push({ ...sword, id: 'shared_sw' } as never);
    });
    const p = (await call(cookie, 'GET', `/parties/${id}`)).json().party;
    expect(p.members.map((m: { mine: boolean }) => m.mine)).toEqual([true, false, true, true]);
    expect(p.spendableGold).toBe(0);

    const post = (path: string, body: object) =>
      call(cookie, 'POST', `/parties/${id}${path}`, body).then((r) => r.statusCode);
    // Taking from or giving to her gear and bag is refused; the shared bag is open to everyone.
    expect(await post('/gold/send', { fromId: 'm2', toId: 'm1', amount: 5 })).toBe(403);
    expect(await post('/move', { itemId: 'lyra_sw', to: { kind: 'bag' } })).toBe(403);
    expect(
      await post('/move', { itemId: 'shared_sw', to: { kind: 'personal', memberId: 'm2' } }),
    ).toBe(403);
    expect(await post('/equip', { memberId: 'm2', itemId: 'shared_sw' })).toBe(403);
    expect(await post('/members/m2/allocate', { alloc: { str: 1 } })).toBe(403);
    // Giving her gold and moving shared items among your own characters still works.
    await patch(id, (s) => void (s.members[0]!.gold = 10));
    expect(await post('/gold/send', { fromId: 'm1', toId: 'm2', amount: 5 })).toBe(200);
    expect(await post('/equip', { memberId: 'm1', itemId: 'shared_sw' })).toBe(200);
    expect((await stateOf(id)).members[1]!.gold).toBe(45);
  });
});
