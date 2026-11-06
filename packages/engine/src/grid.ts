import type { ArenaDef, Point } from './types.ts';

export interface Grid {
  width: number;
  height: number;
  blocked: Uint8Array;
}

export function makeGrid(arena: ArenaDef): Grid {
  const blocked = new Uint8Array(arena.width * arena.height);
  for (const p of arena.blocked) {
    if (p.x < 0 || p.y < 0 || p.x >= arena.width || p.y >= arena.height) {
      throw new Error(`Blocked tile out of bounds: ${p.x},${p.y}`);
    }
    blocked[p.y * arena.width + p.x] = 1;
  }
  return { width: arena.width, height: arena.height, blocked };
}

export function tileIndex(g: Grid, x: number, y: number): number {
  return y * g.width + x;
}

export function inBounds(g: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.width && y < g.height;
}

export function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Bresenham line between tile centres; blocked tiles strictly between the two
 * endpoints stop the line. Symmetric: LOS(a, b) === LOS(b, a).
 */
export function hasLineOfSight(g: Grid, a: Point, b: Point): boolean {
  const aFirst = a.y < b.y || (a.y === b.y && a.x <= b.x);
  const p = aFirst ? a : b;
  const q = aFirst ? b : a;
  let x = p.x;
  let y = p.y;
  const dx = Math.abs(q.x - x);
  const dy = Math.abs(q.y - y);
  const sx = x < q.x ? 1 : -1;
  const sy = y < q.y ? 1 : -1;
  let err = dx - dy;
  while (x !== q.x || y !== q.y) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    if ((x !== q.x || y !== q.y) && g.blocked[y * g.width + x]) return false;
  }
  return true;
}

// Fixed neighbour order keeps pathfinding deterministic.
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];

export interface Reach {
  /** Steps from the start tile, or -1 if unreachable. */
  dist: Int32Array;
  prev: Int32Array;
}

/** Breadth-first search over free tiles (4-directional). `occupied` tiles cannot be entered. */
export function reach(g: Grid, from: Point, occupied: ReadonlySet<number>): Reach {
  const n = g.width * g.height;
  const dist = new Int32Array(n).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const start = tileIndex(g, from.x, from.y);
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const cur = queue[head++]!;
    const cx = cur % g.width;
    const cy = Math.floor(cur / g.width);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(g, nx, ny)) continue;
      const ni = ny * g.width + nx;
      if (dist[ni] !== -1 || g.blocked[ni] || occupied.has(ni)) continue;
      dist[ni] = dist[cur]! + 1;
      prev[ni] = cur;
      queue[tail++] = ni;
    }
  }
  return { dist, prev };
}

/** Tiles to walk from the search start to `to` (start excluded). */
export function pathTo(g: Grid, r: Reach, to: number): Point[] {
  const path: Point[] = [];
  let cur = to;
  while (r.prev[cur] !== -1) {
    path.push({ x: cur % g.width, y: Math.floor(cur / g.width) });
    cur = r.prev[cur]!;
  }
  return path.reverse();
}
