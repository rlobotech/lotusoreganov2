import { describe, expect, it } from 'vitest';
import { adjacent, distance, hasLineOfSight, makeGrid, pathTo, reach } from '../src/grid.ts';
import { openArena } from './helpers.ts';

describe('line of sight', () => {
  const wall = makeGrid(openArena(7, 5, [{ x: 3, y: 2 }]));

  it('is clear on an open grid and blocked by an obstacle between the points', () => {
    const open = makeGrid(openArena(7, 5));
    expect(hasLineOfSight(open, { x: 0, y: 2 }, { x: 6, y: 2 })).toBe(true);
    expect(hasLineOfSight(wall, { x: 0, y: 2 }, { x: 6, y: 2 })).toBe(false);
  });

  it('is not blocked by an obstacle off the line, or by the endpoints themselves', () => {
    expect(hasLineOfSight(wall, { x: 0, y: 0 }, { x: 6, y: 0 })).toBe(true);
    expect(hasLineOfSight(wall, { x: 2, y: 2 }, { x: 3, y: 2 })).toBe(true);
  });

  it('is symmetric', () => {
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 7; x++) {
        const a = { x: 0, y: 4 };
        const b = { x, y };
        expect(hasLineOfSight(wall, a, b)).toBe(hasLineOfSight(wall, b, a));
      }
    }
  });
});

describe('reach and paths', () => {
  it('finds shortest 8-direction paths around obstacles, never cutting a blocked corner', () => {
    const g = makeGrid(
      openArena(5, 3, [
        { x: 2, y: 0 },
        { x: 2, y: 1 },
      ]),
    );
    const r = reach(g, { x: 0, y: 0 }, new Set());
    const target = 0 * 5 + 4;
    expect(r.dist[target]).toBe(6);
    const path = pathTo(g, r, target);
    expect(path).toHaveLength(6);
    expect(path[path.length - 1]).toEqual({ x: 4, y: 0 });
  });

  it('treats occupied tiles as impassable and reports unreachable tiles', () => {
    const g = makeGrid(openArena(3, 1));
    const r = reach(g, { x: 0, y: 0 }, new Set([1]));
    expect(r.dist[2]).toBe(-1);
  });
});

describe('8-direction geometry', () => {
  it('counts a diagonal step as one tile and the 8 neighbours as adjacent', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 2 })).toBe(3);
    expect(adjacent({ x: 2, y: 2 }, { x: 3, y: 3 })).toBe(true);
    expect(adjacent({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(false);
    expect(adjacent({ x: 2, y: 2 }, { x: 4, y: 2 })).toBe(false);
    const r = reach(makeGrid(openArena(5, 5)), { x: 0, y: 0 }, new Set());
    expect(r.dist[4 * 5 + 4]).toBe(4);
  });

  it('does not squeeze a diagonal step between two blocked tiles or past one', () => {
    const g = makeGrid(openArena(3, 3, [{ x: 1, y: 0 }]));
    const r = reach(g, { x: 0, y: 0 }, new Set());
    // (0,0) to (1,1) would cut the corner of the blocked (1,0).
    expect(r.dist[1 * 3 + 1]).toBe(2);
  });
});
