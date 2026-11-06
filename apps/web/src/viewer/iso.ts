/** Isometric diamond tiles: 32 px wide, 16 px tall (see PLAN.md, Art spec). */
export const TILE_W = 32;
export const TILE_H = 16;
/** Height of a unit sprite above its feet, used for bounds and depth. */
export const UNIT_H = 32;

export interface Vec {
  x: number;
  y: number;
}

/** Centre of a grid tile in world (screen-space, unzoomed) pixels. */
export function gridToScreen(x: number, y: number): Vec {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

/** Higher draws in front. Tiles further down the screen are in front of those behind. */
export function depth(x: number, y: number): number {
  return x + y;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bounding box of the whole arena diamond, with headroom for sprites standing on the back row. */
export function arenaBounds(width: number, height: number): Bounds {
  const corners = [
    gridToScreen(0, 0),
    gridToScreen(width - 1, 0),
    gridToScreen(0, height - 1),
    gridToScreen(width - 1, height - 1),
  ];
  return {
    minX: Math.min(...corners.map((c) => c.x)) - TILE_W / 2,
    maxX: Math.max(...corners.map((c) => c.x)) + TILE_W / 2,
    minY: Math.min(...corners.map((c) => c.y)) - TILE_H / 2 - UNIT_H,
    maxY: Math.max(...corners.map((c) => c.y)) + TILE_H / 2,
  };
}
