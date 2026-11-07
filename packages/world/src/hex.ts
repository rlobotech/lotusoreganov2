import type { Hex, Overlay, Terrain, WorldDef } from './types.ts';

/** Pointy-top hexes in "odd-r" offset coordinates (odd rows are shifted half a hex right). */

export const hexKey = (h: Hex): string => `${h.col},${h.row}`;
export const sameHex = (a: Hex, b: Hex): boolean => a.col === b.col && a.row === b.row;

export function inWorld(w: { width: number; height: number }, h: Hex): boolean {
  return h.col >= 0 && h.row >= 0 && h.col < w.width && h.row < w.height;
}

export function neighbors(w: { width: number; height: number }, h: Hex): Hex[] {
  const odd = h.row & 1;
  const deltas = odd
    ? [
        [1, 0],
        [-1, 0],
        [1, -1],
        [0, -1],
        [1, 1],
        [0, 1],
      ]
    : [
        [1, 0],
        [-1, 0],
        [0, -1],
        [-1, -1],
        [0, 1],
        [-1, 1],
      ];
  return deltas
    .map(([dc, dr]) => ({ col: h.col + dc!, row: h.row + dr! }))
    .filter((n) => inWorld(w, n));
}

function toCube(h: Hex) {
  const x = h.col - (h.row - (h.row & 1)) / 2;
  const z = h.row;
  return { x, y: -x - z, z };
}

export function hexDistance(a: Hex, b: Hex): number {
  const p = toCube(a);
  const q = toCube(b);
  return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.z - q.z));
}

/**
 * Relative effort of entering a hex of each biome, multiplied by the base travel time per hex.
 * Infinity means the biome cannot be entered, unless an overlay opens it (see `stepCost`).
 */
export const BIOME_COST: Record<Terrain, number> = {
  plains: 1,
  savanna: 1,
  forest: 1.5,
  dense_forest: Infinity,
  hills: 1.5,
  swamp: 2,
  desert: 1.8,
  snow: 2,
  ice: 2.5,
  ashlands: 2,
  lava: Infinity,
  mountains: Infinity,
  river: Infinity,
  water: Infinity,
};

/** A road makes any open ground this much cheaper to cross. */
export const ROAD_FACTOR = 0.5;
/** What crossing costs where an overlay opens a blocked biome. */
export const CROSSING_COST = { ford: 3, bridge: 0.5, pass: 2 } as const;
/** Which blocked biome each crossing overlay opens. */
const OPENS: Record<'ford' | 'bridge' | 'pass', Terrain> = {
  ford: 'river',
  bridge: 'river',
  pass: 'mountains',
};

/** Effort to enter a hex of this biome with this overlay; Infinity if it cannot be entered. */
export function stepCost(terrain: Terrain, overlay: Overlay): number {
  if (overlay === 'ford' || overlay === 'bridge' || overlay === 'pass') {
    return OPENS[overlay] === terrain ? CROSSING_COST[overlay] : BIOME_COST[terrain];
  }
  const base = BIOME_COST[terrain];
  return overlay === 'road' ? base * ROAD_FACTOR : base;
}

export const tileIndex = (w: WorldDef, h: Hex): number => h.row * w.width + h.col;
export const terrainAt = (w: WorldDef, h: Hex): Terrain => w.terrain[tileIndex(w, h)]!;
export const overlayAt = (w: WorldDef, h: Hex): Overlay => w.overlay[tileIndex(w, h)]!;
export const costAt = (w: WorldDef, h: Hex): number => stepCost(terrainAt(w, h), overlayAt(w, h));
export const zoneAt = (w: WorldDef, h: Hex): string => w.zoneOf[tileIndex(w, h)]!;

export function siteAt(w: WorldDef, h: Hex) {
  return Object.values(w.sites).find((s) => s.col === h.col && s.row === h.row);
}

export function isZoneOpen(w: WorldDef, zoneId: string, cleared: readonly string[]): boolean {
  const zone = w.zones[zoneId];
  return !!zone && (!zone.unlockedBy || cleared.includes(zone.unlockedBy));
}

export function isPassable(w: WorldDef, h: Hex, cleared: readonly string[]): boolean {
  return inWorld(w, h) && costAt(w, h) !== Infinity && isZoneOpen(w, zoneAt(w, h), cleared);
}

export function travelTicks(w: WorldDef, h: Hex, ticksPerHex: number): number {
  return Math.max(1, Math.round(ticksPerHex * costAt(w, h)));
}

export interface PathStep extends Hex {
  ticks: number;
}

/** A binary min-heap of [priority, node] pairs (lazy deletion: stale entries are skipped). */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent]! <= key) break;
      keys[i] = keys[parent]!;
      vals[i] = vals[parent]!;
      i = parent;
    }
    keys[i] = key;
    vals[i] = val;
  }
  /** Removes the smallest entry and returns its node. */
  pop(): { key: number; val: number } {
    const { keys, vals } = this;
    const top = { key: keys[0]!, val: vals[0]! };
    const key = keys.pop()!;
    const val = vals.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1]! < keys[c]!) c++;
        if (keys[c]! >= key) break;
        keys[i] = keys[c]!;
        vals[i] = vals[c]!;
        i = c;
      }
      keys[i] = key;
      vals[i] = val;
    }
    return top;
  }
}

/** Cheapest route (Dijkstra with a binary heap, cost = travel ticks). Excludes the start; null if unreachable. */
export function findPath(
  w: WorldDef,
  from: Hex,
  to: Hex,
  cleared: readonly string[],
  ticksPerHex: number,
): PathStep[] | null {
  if (!isPassable(w, to, cleared)) return null;
  if (sameHex(from, to)) return [];
  const n = w.width * w.height;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const start = tileIndex(w, from);
  const goal = tileIndex(w, to);
  const heap = new MinHeap();
  dist[start] = 0;
  heap.push(0, start);
  let found = false;
  while (heap.size > 0) {
    const { key, val: cur } = heap.pop();
    if (key > dist[cur]!) continue; // a stale entry
    if (cur === goal) {
      found = true;
      break;
    }
    const here = { col: cur % w.width, row: Math.floor(cur / w.width) };
    for (const nb of neighbors(w, here)) {
      if (!isPassable(w, nb, cleared)) continue;
      const ni = tileIndex(w, nb);
      const d = key + travelTicks(w, nb, ticksPerHex);
      if (d < dist[ni]!) {
        dist[ni] = d;
        prev[ni] = cur;
        heap.push(d, ni);
      }
    }
  }
  if (!found) return null;
  const path: PathStep[] = [];
  for (let cur = goal; cur !== start; cur = prev[cur]!) {
    const hex = { col: cur % w.width, row: Math.floor(cur / w.width) };
    path.push({ ...hex, ticks: travelTicks(w, hex, ticksPerHex) });
  }
  return path.reverse();
}
