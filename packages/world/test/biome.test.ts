import { describe, expect, it } from 'vitest';
import { createRng } from '@game/engine';
import { findPath, hexDistance, shortestPaths, stepCost, terrainAt } from '../src/hex.ts';
import {
  AT_HOME,
  AWAY,
  encounterWeight,
  findHuntingSpot,
  homeShare,
  pickEncounter,
} from '../src/sim.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import type { EncounterDef, Hex, Overlay, Terrain, WorldDef } from '../src/types.ts';

const enc = (id: string, template: string, biomes?: Terrain[], weight = 2): EncounterDef => ({
  id,
  name: id,
  arena: 'clearing',
  monsters: [{ template, min: 1, max: 1 }],
  weight,
  ...(biomes ? { biomes } : {}),
});

/** A one-region world made from rows of biome cells. */
function tiny(rows: Terrain[][], encounters: EncounterDef[]): WorldDef {
  const height = rows.length;
  const width = rows[0]!.length;
  return {
    id: 't',
    width,
    height,
    terrain: rows.flat(),
    overlay: Array<Overlay>(width * height).fill('none'),
    zoneOf: Array<string>(width * height).fill('z'),
    zones: { z: { id: 'z', name: 'Z', minLevel: 1, maxLevel: 5, encounters } },
    sites: {},
    startCity: 'none',
    quests: {},
  };
}

describe('encounter weights by biome', () => {
  it('is untouched without tags, much higher at home and rare away', () => {
    const free = enc('free', 'goblin');
    const wolves = enc('wolves', 'wolf', ['forest', 'hills']);
    for (const t of ['plains', 'forest', 'desert'] as const) {
      expect(encounterWeight(free, t)).toBe(free.weight);
    }
    expect(encounterWeight(wolves, 'forest')).toBe(wolves.weight * AT_HOME);
    expect(encounterWeight(wolves, 'hills')).toBe(wolves.weight * AT_HOME);
    expect(encounterWeight(wolves, 'plains')).toBe(wolves.weight * AWAY);
    expect(AT_HOME).toBeGreaterThan(1);
    expect(AWAY).toBeGreaterThan(0); // still possible: wanderers
    expect(AWAY).toBeLessThan(1);
  });

  it('says how much of a pool lives on the ground', () => {
    const pool = [enc('a', 'goblin'), enc('b', 'wolf', ['forest'])];
    expect(homeShare(pool, 'forest')).toBe(1);
    expect(homeShare(pool, 'plains')).toBe(0.5);
    expect(homeShare([enc('c', 'wolf', ['forest'])], 'plains')).toBe(0);
    expect(homeShare([], 'plains')).toBe(1);
  });
});

describe('one search for every path', () => {
  it('gives the same routes and costs as the single-target search', () => {
    const from = { col: W.sites.oakhaven!.col, row: W.sites.oakhaven!.row };
    const tree = shortestPaths(W, from, [], 10);
    for (const id of ['goblin_warren', 'goblin_keep']) {
      const to = { col: W.sites[id]!.col, row: W.sites[id]!.row };
      const one = findPath(W, from, to, [], 10)!;
      expect(tree.pathTo(to)).toEqual(one);
      expect(tree.dist[to.row * W.width + to.col]).toBe(one.reduce((s, x) => s + x.ticks, 0));
    }
    expect(tree.pathTo(from)).toEqual([]);
    // A closed region is out of reach.
    const far = W.sites.southern_fen_city!;
    expect(tree.pathTo({ col: far.col, row: far.row })).toBeNull();
  });
});

describe('choosing where to hunt', () => {
  // The party stands at the left. Plains (cost 1) to its right, forest (1.5) above and below.
  //   F F F
  //   P . P P
  //   F F F
  const rows: Terrain[][] = [
    ['forest', 'forest', 'forest', 'forest'],
    ['plains', 'plains', 'plains', 'plains'],
    ['forest', 'forest', 'forest', 'forest'],
  ];
  const from: Hex = { col: 0, row: 1 };

  it('prefers ground its monsters live on when the price in travel is small', () => {
    const w = tiny(rows, [enc('wolves', 'wolf', ['forest'])]);
    const spot = findHuntingSpot(w, from, 3, [], 10, { maxDistance: 3 })!;
    expect(terrainAt(w, spot.hex)).toBe('forest');
  });

  it('does not care about ground when the monsters live anywhere', () => {
    const w = tiny(rows, [enc('goblins', 'goblin')]);
    const spot = findHuntingSpot(w, from, 3, [], 10, { maxDistance: 3 })!;
    expect(hexDistance(from, spot.hex)).toBe(1);
    expect(terrainAt(w, spot.hex)).toBe('plains');
  });

  it('hunting one monster goes to the ground it lives on, even when that is farther', () => {
    const w = tiny(rows, [enc('goblins', 'goblin', ['plains']), enc('wolves', 'wolf', ['forest'])]);
    const wolf = findHuntingSpot(w, from, 3, [], 10, { maxDistance: 3, template: 'wolf' })!;
    expect(terrainAt(w, wolf.hex)).toBe('forest');
    const goblin = findHuntingSpot(w, from, 3, [], 10, { maxDistance: 3, template: 'goblin' })!;
    expect(terrainAt(w, goblin.hex)).toBe('plains');
  });
});

describe('the encounters of the world sit on ground their region has', () => {
  it('every tagged encounter has at least one walkable hex of its ground in its region', () => {
    for (const zone of Object.values(W.zones)) {
      for (const e of zone.encounters) {
        if (!e.biomes) continue;
        let found = false;
        for (let i = 0; i < W.terrain.length && !found; i++) {
          if (W.zoneOf[i] !== zone.id || !e.biomes.includes(W.terrain[i]!)) continue;
          found = stepCost(W.terrain[i]!, W.overlay[i]!) !== Infinity;
        }
        expect(found, `${zone.id}: ${e.id} on ${e.biomes.join('/')}`).toBe(true);
      }
    }
  });

  it('every region has at least one untagged encounter, so no ground is ever empty', () => {
    for (const zone of Object.values(W.zones)) {
      expect(
        zone.encounters.some((e) => !e.biomes),
        zone.id,
      ).toBe(true);
    }
  });
});

describe('what a party meets by biome', () => {
  const zone = W.zones.greenwood!;
  const share = (biome: Terrain, name: string) => {
    const rng = createRng(7);
    let n = 0;
    const draws = 4000;
    for (let i = 0; i < draws; i++) {
      if (pickEncounter(rng, zone.encounters, biome).name.includes(name)) n++;
    }
    return n / draws;
  };

  it('wolves are met in the forest far more than on the plains', () => {
    const inForest = share('forest', 'Wolf');
    const onPlains = share('plains', 'Wolf');
    expect(inForest).toBeGreaterThan(0.5);
    expect(onPlains).toBeLessThan(0.2);
    expect(onPlains).toBeGreaterThan(0); // wanderers still turn up
  });

  it('a region with only free encounters is the same on every ground', () => {
    const free = [enc('a', 'goblin'), enc('b', 'orc_brute')];
    const rng1 = createRng(3);
    const rng2 = createRng(3);
    for (let i = 0; i < 50; i++) {
      expect(pickEncounter(rng1, free, 'forest').id).toBe(pickEncounter(rng2, free, 'desert').id);
    }
  });
});
