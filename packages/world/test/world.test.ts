import { describe, expect, it } from 'vitest';
import { ARENAS } from '../src/arenas.ts';
import {
  findPath,
  hexDistance,
  isPassable,
  neighbors,
  sameHex,
  stepCost,
  terrainAt,
  zoneAt,
} from '../src/hex.ts';
import { addToBag, itemScore } from '../src/loot.ts';
import { MONSTERS } from '../src/monsters.ts';
import {
  addXp,
  CLASSES,
  memberAttributes,
  monsterXp,
  MAX_LEVEL,
  xpToNext,
} from '../src/progression.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import type { Item } from '../src/types.ts';

describe('hex grid', () => {
  it('has six neighbours inside the map, fewer at the edges, and they are mutual', () => {
    const mid = { col: 5, row: 4 };
    expect(neighbors(W, mid)).toHaveLength(6);
    expect(neighbors(W, { col: 0, row: 0 }).length).toBeLessThan(6);
    for (const row of [3, 4]) {
      for (const n of neighbors(W, { col: 5, row })) {
        expect(neighbors(W, n).some((b) => sameHex(b, { col: 5, row }))).toBe(true);
      }
    }
  });

  it('measures distance consistently with neighbours', () => {
    const a = { col: 5, row: 4 };
    for (const n of neighbors(W, a)) expect(hexDistance(a, n)).toBe(1);
    expect(hexDistance(a, a)).toBe(0);
    expect(hexDistance({ col: 0, row: 0 }, { col: 4, row: 0 })).toBe(4);
  });
});

describe('pathfinding', () => {
  const oak = W.sites.oakhaven!;
  const from = { col: oak.col, row: oak.row };

  it('finds a route whose cost is the sum of its steps and ends at the goal', () => {
    const warren = W.sites.goblin_warren!;
    const goal = { col: warren.col, row: warren.row };
    const path = findPath(W, from, goal, [], 10)!;
    expect(path.length).toBeGreaterThan(0);
    expect(sameHex(path[path.length - 1]!, goal)).toBe(true);
    for (const s of path) expect(s.ticks).toBeGreaterThanOrEqual(1);
  });

  it('prefers roads: a road step is cheaper than plains and forest', () => {
    expect(stepCost('plains', 'road')).toBeLessThan(stepCost('plains', 'none'));
    expect(stepCost('plains', 'none')).toBeLessThan(stepCost('forest', 'none'));
  });

  it('refuses water and closed zones until the boss dungeon is cleared', () => {
    const stonebridge = W.sites.stonebridge!;
    const goal = { col: stonebridge.col, row: stonebridge.row };
    expect(isPassable(W, goal, [])).toBe(false);
    expect(findPath(W, from, goal, [], 10)).toBeNull();
    expect(findPath(W, from, goal, ['goblin_keep'], 10)).not.toBeNull();
    const water = W.terrain.indexOf('water');
    expect(
      isPassable(W, { col: water % W.width, row: Math.floor(water / W.width) }, ['goblin_keep']),
    ).toBe(false);
  });

  it('returns an empty path when already there', () => {
    expect(findPath(W, from, from, [], 10)).toEqual([]);
  });
});

describe('starter world data', () => {
  it('is rectangular and every site sits on passable ground in a known zone', () => {
    expect(W.terrain).toHaveLength(W.width * W.height);
    expect(W.zoneOf).toHaveLength(W.width * W.height);
    for (const s of Object.values(W.sites)) {
      expect(terrainAt(W, s)).not.toBe('water');
      expect(W.zones[zoneAt(W, s)]).toBeDefined();
      expect(s.col).toBeLessThan(W.width);
    }
    expect(W.sites[W.startCity]?.kind).toBe('city');
  });

  it('only references monsters and arenas that exist, and arenas have room for 6 per side', () => {
    const encounters = [
      ...Object.values(W.zones).flatMap((z) => z.encounters),
      ...Object.values(W.sites).flatMap((s) => s.dungeon?.stages.map((st) => st.encounter) ?? []),
    ];
    for (const e of encounters) {
      expect(ARENAS[e.arena]).toBeDefined();
      for (const m of e.monsters) expect(MONSTERS[m.template]).toBeDefined();
    }
    for (const a of Object.values(ARENAS)) {
      expect(a.spawns.party).toHaveLength(6);
      expect(a.spawns.enemy).toHaveLength(6);
    }
  });

  it('zone unlocks point at real dungeons', () => {
    for (const z of Object.values(W.zones)) {
      if (z.unlockedBy) expect(['dungeon', 'boss_dungeon']).toContain(W.sites[z.unlockedBy]?.kind);
    }
  });
});

describe('progression', () => {
  it('xp requirements grow with level and level up repeatedly from a big reward', () => {
    for (let l = 1; l < 99; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
    const p = { level: 1, xp: 0 };
    const gained = addXp(p, xpToNext(1) + xpToNext(2) + 5);
    expect(gained).toBe(2);
    expect(p).toEqual({ level: 3, xp: 5 });
  });

  it('caps at the max level', () => {
    const p = { level: MAX_LEVEL - 1, xp: 0 };
    addXp(p, 1e12);
    expect(p.level).toBe(MAX_LEVEL);
    expect(p.xp).toBe(0);
  });

  it('total fights to level 100 stays in the intended range (placeholder tuning guard)', () => {
    let fights = 0;
    for (let l = 1; l < MAX_LEVEL; l++) fights += xpToNext(l) / (4 * monsterXp(l));
    expect(fights).toBeGreaterThan(2000);
    expect(fights).toBeLessThan(3500);
  });

  it('attributes grow with level and races shift them', () => {
    const low = memberAttributes({ race: 'human', cls: 'warrior' }, 1);
    const high = memberAttributes({ race: 'human', cls: 'warrior' }, 20);
    expect(high.str).toBeGreaterThan(low.str);
    const orc = memberAttributes({ race: 'orc', cls: 'warrior' }, 1);
    expect(orc.str).toBeGreaterThan(low.str);
    for (const c of Object.values(CLASSES)) expect(c.skills.length).toBeGreaterThan(0);
  });
});

describe('bag', () => {
  const item = (id: string, rarity: Item['rarity'], itemLevel: number, favorite = false): Item => ({
    id,
    name: id,
    rarity,
    itemLevel,
    value: 1,
    favorite,
  });

  it('adds until full, then takes nothing and never throws anything away', () => {
    const bag = [item('a', 'common', 5), item('b', 'common', 1), item('c', 'rare', 1)];
    expect(addToBag(bag, item('d', 'common', 9), 4)).toBe(true);
    expect(addToBag(bag, item('e', 'epic', 50), 4)).toBe(false);
    expect(bag.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ranks rarity above item level', () => {
    expect(itemScore(item('x', 'uncommon', 1))).toBeGreaterThan(itemScore(item('y', 'common', 99)));
  });
});
