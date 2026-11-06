import type { Hex, Terrain, WorldDef } from './types.ts';

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

/** Relative effort of entering a hex. Multiplied by the base travel time per hex. */
export const TERRAIN_COST: Record<Terrain, number> = {
  road: 0.5,
  plains: 1,
  forest: 1.5,
  hills: 1.5,
  swamp: 2,
  mountain: 3,
  water: Infinity,
};

export const tileIndex = (w: WorldDef, h: Hex): number => h.row * w.width + h.col;
export const terrainAt = (w: WorldDef, h: Hex): Terrain => w.terrain[tileIndex(w, h)]!;
export const zoneAt = (w: WorldDef, h: Hex): string => w.zoneOf[tileIndex(w, h)]!;

export function siteAt(w: WorldDef, h: Hex) {
  return Object.values(w.sites).find((s) => s.col === h.col && s.row === h.row);
}

export function isZoneOpen(w: WorldDef, zoneId: string, cleared: readonly string[]): boolean {
  const zone = w.zones[zoneId];
  return !!zone && (!zone.unlockedBy || cleared.includes(zone.unlockedBy));
}

export function isPassable(w: WorldDef, h: Hex, cleared: readonly string[]): boolean {
  return (
    inWorld(w, h) &&
    TERRAIN_COST[terrainAt(w, h)] !== Infinity &&
    isZoneOpen(w, zoneAt(w, h), cleared)
  );
}

export function travelTicks(w: WorldDef, h: Hex, ticksPerHex: number): number {
  return Math.max(1, Math.round(ticksPerHex * TERRAIN_COST[terrainAt(w, h)]));
}

export interface PathStep extends Hex {
  ticks: number;
}

/** Cheapest route (Dijkstra, cost = travel ticks). Excludes the start; null if unreachable. */
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
  const done = new Uint8Array(n);
  const start = tileIndex(w, from);
  const goal = tileIndex(w, to);
  dist[start] = 0;
  for (;;) {
    let cur = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dist[i]! < best) {
        best = dist[i]!;
        cur = i;
      }
    }
    if (cur === -1) return null;
    if (cur === goal) break;
    done[cur] = 1;
    const here = { col: cur % w.width, row: Math.floor(cur / w.width) };
    for (const nb of neighbors(w, here)) {
      if (!isPassable(w, nb, cleared)) continue;
      const ni = tileIndex(w, nb);
      const d = dist[cur]! + travelTicks(w, nb, ticksPerHex);
      if (d < dist[ni]!) {
        dist[ni] = d;
        prev[ni] = cur;
      }
    }
  }
  const path: PathStep[] = [];
  for (let cur = goal; cur !== start; cur = prev[cur]!) {
    const hex = { col: cur % w.width, row: Math.floor(cur / w.width) };
    path.push({ ...hex, ticks: travelTicks(w, hex, ticksPerHex) });
  }
  return path.reverse();
}
