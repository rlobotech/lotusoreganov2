import { describe, expect, it } from 'vitest';
import {
  BIOME_COST,
  CROSSING_COST,
  findPath,
  hexKey,
  isPassable,
  neighbors,
  ROAD_FACTOR,
  stepCost,
  travelTicks,
} from '../src/hex.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import type { Overlay, Terrain, WorldDef } from '../src/types.ts';

type Cell = [Terrain, Overlay?];

/** A small one-region world from rows of [biome, overlay] cells, for rule tests. */
function tiny(rows: Cell[][]): WorldDef {
  const height = rows.length;
  const width = rows[0]!.length;
  return {
    id: 't',
    width,
    height,
    terrain: rows.flatMap((r) => r.map(([t]) => t)),
    overlay: rows.flatMap((r) => r.map(([, o]) => o ?? 'none')),
    zoneOf: Array<string>(width * height).fill('z'),
    zones: { z: { id: 'z', name: 'Z', minLevel: 1, maxLevel: 5, encounters: [] } },
    sites: {},
    startCity: 'none',
    quests: {},
  };
}

describe('biome and overlay rules', () => {
  it('blocks dense forest, lava, mountains, rivers and the sea on their own', () => {
    for (const t of ['dense_forest', 'lava', 'mountains', 'river', 'water'] as const) {
      expect(BIOME_COST[t], t).toBe(Infinity);
      expect(stepCost(t, 'none'), t).toBe(Infinity);
      expect(stepCost(t, 'road'), t).toBe(Infinity);
    }
  });

  it('lets only the right crossing open a blocked biome', () => {
    expect(stepCost('river', 'ford')).toBe(CROSSING_COST.ford);
    expect(stepCost('river', 'bridge')).toBe(CROSSING_COST.bridge);
    expect(stepCost('mountains', 'pass')).toBe(CROSSING_COST.pass);
    // A pass does nothing on a river, a ford does nothing on a mountain, nothing opens lava or sea.
    expect(stepCost('river', 'pass')).toBe(Infinity);
    expect(stepCost('mountains', 'ford')).toBe(Infinity);
    expect(stepCost('mountains', 'bridge')).toBe(Infinity);
    for (const o of ['ford', 'bridge', 'pass'] as const) {
      expect(stepCost('lava', o)).toBe(Infinity);
      expect(stepCost('water', o)).toBe(Infinity);
      expect(stepCost('dense_forest', o)).toBe(Infinity);
    }
  });

  it('has a travel cost for every open biome, and a road cuts it', () => {
    for (const t of Object.keys(BIOME_COST) as Terrain[]) {
      const base = BIOME_COST[t];
      if (base === Infinity) continue;
      expect(base, t).toBeGreaterThanOrEqual(1);
      expect(stepCost(t, 'road'), t).toBe(base * ROAD_FACTOR);
    }
    // The order of the design table.
    expect(BIOME_COST.plains).toBeLessThan(BIOME_COST.forest);
    expect(BIOME_COST.forest).toBeLessThan(BIOME_COST.swamp);
    expect(BIOME_COST.desert).toBeLessThan(BIOME_COST.snow);
    expect(BIOME_COST.snow).toBeLessThan(BIOME_COST.ice);
    // A bridge is faster than land, a ford slower.
    expect(CROSSING_COST.bridge).toBeLessThan(BIOME_COST.plains);
    expect(CROSSING_COST.ford).toBeGreaterThan(BIOME_COST.swamp);
  });

  it('a road keeps the biome underneath', () => {
    const w = tiny([
      [
        ['forest', 'road'],
        ['forest', 'none'],
      ],
    ]);
    expect(w.terrain[0]).toBe('forest');
    expect(travelTicks(w, { col: 0, row: 0 }, 10)).toBe(Math.round(10 * 1.5 * ROAD_FACTOR));
    expect(travelTicks(w, { col: 1, row: 0 }, 10)).toBe(15);
  });
});

describe('crossings in pathfinding', () => {
  const from = { col: 0, row: 0 };
  const goal = { col: 2, row: 0 };
  const row = (mid: Cell): WorldDef => tiny([[['plains'], mid, ['plains']]]);

  it('a river blocks the way until it has a ford or a bridge', () => {
    expect(findPath(row(['river']), from, goal, [], 10)).toBeNull();
    const bridge = findPath(row(['river', 'bridge']), from, goal, [], 10)!;
    const ford = findPath(row(['river', 'ford']), from, goal, [], 10)!;
    expect(bridge).not.toBeNull();
    expect(ford).not.toBeNull();
    expect(bridge[0]!.ticks).toBeLessThan(ford[0]!.ticks);
  });

  it('a mountain blocks the way until it has a pass; lava and dense forest never open', () => {
    expect(findPath(row(['mountains']), from, goal, [], 10)).toBeNull();
    expect(findPath(row(['mountains', 'pass']), from, goal, [], 10)).not.toBeNull();
    expect(findPath(row(['lava', 'pass']), from, goal, [], 10)).toBeNull();
    expect(findPath(row(['dense_forest', 'road']), from, goal, [], 10)).toBeNull();
    expect(isPassable(row(['mountains', 'pass']), { col: 1, row: 0 }, [])).toBe(true);
  });

  it('goes around a barrier through the only crossing', () => {
    const M: Cell = ['mountains'];
    const P: Cell = ['plains'];
    const w = tiny([
      [P, M, P],
      [P, M, P],
      [P, ['mountains', 'pass'], P],
      [P, M, P],
    ]);
    const path = findPath(w, from, goal, [], 10)!;
    expect(path.some((s) => s.col === 1 && s.row === 2)).toBe(true);
  });
});

/** The old quadratic search, as the reference the heap search must agree with. */
function slowCost(
  w: WorldDef,
  from: { col: number; row: number },
  to: { col: number; row: number },
) {
  const n = w.width * w.height;
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  const idx = (h: { col: number; row: number }) => h.row * w.width + h.col;
  dist[idx(from)] = 0;
  for (;;) {
    let cur = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dist[i]! < best) {
        best = dist[i]!;
        cur = i;
      }
    }
    if (cur === -1 || cur === idx(to)) break;
    done[cur] = 1;
    const here = { col: cur % w.width, row: Math.floor(cur / w.width) };
    for (const nb of neighbors(w, here)) {
      if (!isPassable(w, nb, [])) continue;
      const d = dist[cur]! + travelTicks(w, nb, 10);
      if (d < dist[idx(nb)]!) dist[idx(nb)] = d;
    }
  }
  return dist[idx(to)]!;
}

describe('heap pathfinding', () => {
  it('finds the same cost as the plain search on a random mixed map', () => {
    const kinds: Terrain[] = [
      'plains',
      'forest',
      'swamp',
      'hills',
      'desert',
      'snow',
      'mountains',
      'river',
      'lava',
    ];
    const overlays: Overlay[] = ['none', 'none', 'none', 'road', 'ford', 'bridge', 'pass'];
    let seed = 12345;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const rows = Array.from({ length: 14 }, () =>
      Array.from({ length: 18 }, (): Cell => [
        kinds[Math.floor(rnd() * kinds.length)]!,
        overlays[Math.floor(rnd() * overlays.length)]!,
      ]),
    );
    const w = tiny(rows);
    let checked = 0;
    for (let i = 0; i < 80; i++) {
      const from = { col: Math.floor(rnd() * 18), row: Math.floor(rnd() * 14) };
      const to = { col: Math.floor(rnd() * 18), row: Math.floor(rnd() * 14) };
      if (!isPassable(w, from, []) || !isPassable(w, to, [])) continue;
      const slow = slowCost(w, from, to);
      const path = findPath(w, from, to, [], 10);
      if (slow === Infinity) {
        expect(path).toBeNull();
      } else {
        expect(path).not.toBeNull();
        expect(path!.reduce((sum, x) => sum + x.ticks, 0)).toBe(slow);
        // A real route: every step is a neighbour of the one before.
        let prev = from;
        for (const st of path!) {
          expect(neighbors(w, prev).map(hexKey)).toContain(hexKey(st));
          prev = st;
        }
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(15);
  });

  it('crosses a 1,440 hex map quickly', () => {
    const big = tiny(
      Array.from({ length: 36 }, () => Array.from({ length: 40 }, (): Cell => ['plains'])),
    );
    const t0 = performance.now();
    for (let i = 0; i < 40; i++) {
      expect(findPath(big, { col: 0, row: 0 }, { col: 39, row: 35 }, [], 10)).not.toBeNull();
    }
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe('the current world on the new model', () => {
  it('has an overlay for every hex, with roads only on open ground and crossings on what they open', () => {
    expect(W.overlay).toHaveLength(W.width * W.height);
    expect(W.overlay.filter((o) => o === 'road').length).toBeGreaterThan(20);
    W.overlay.forEach((o, i) => {
      const t = W.terrain[i]!;
      if (o === 'road') expect(BIOME_COST[t]).not.toBe(Infinity);
      if (o === 'pass') expect(t).toBe('mountains');
      if (o === 'bridge' || o === 'ford') expect(t).toBe('river');
    });
  });

  it('every hex that can be walked is connected to the start once all gates are open', () => {
    const cleared = Object.values(W.sites)
      .filter((s) => s.kind !== 'city')
      .map((s) => s.id);
    const start = W.sites[W.startCity]!;
    const seen = new Set<string>([hexKey(start)]);
    const queue = [{ col: start.col, row: start.row }];
    while (queue.length) {
      const cur = queue.pop()!;
      for (const nb of neighbors(W, cur)) {
        if (seen.has(hexKey(nb)) || !isPassable(W, nb, cleared)) continue;
        seen.add(hexKey(nb));
        queue.push(nb);
      }
    }
    const lost: string[] = [];
    for (let row = 0; row < W.height; row++) {
      for (let col = 0; col < W.width; col++) {
        if (isPassable(W, { col, row }, cleared) && !seen.has(`${col},${row}`)) {
          lost.push(`${col},${row}`);
        }
      }
    }
    expect(lost).toEqual([]);
  });
});
