import type { ArenaDef, Point } from '@game/engine';

/** Six party spawns on the left edge, six enemy spawns on the right, skipping blocked tiles. */
function makeArena(id: string, width: number, height: number, blocked: Point[]): ArenaDef {
  const isBlocked = (x: number, y: number) => blocked.some((b) => b.x === x && b.y === y);
  const spawnsAt = (cols: number[]): Point[] => {
    const out: Point[] = [];
    for (const x of cols) {
      for (let y = 1; y < height - 1 && out.length < 6; y++) {
        if (!isBlocked(x, y) && out.length < 6) out.push({ x, y });
      }
    }
    return out;
  };
  return {
    id,
    width,
    height,
    blocked,
    spawns: {
      party: spawnsAt([1, 0]),
      enemy: spawnsAt([width - 2, width - 1]),
    },
  };
}

const pillars = (...pts: Array<[number, number]>): Point[] => pts.map(([x, y]) => ({ x, y }));

export const ARENAS: Record<string, ArenaDef> = {
  clearing: makeArena('clearing', 10, 8, pillars([5, 2], [5, 3], [5, 4])),
  forest: makeArena('forest', 9, 8, pillars([3, 2], [3, 5], [4, 3], [5, 4], [6, 2], [6, 5])),
  crypt: makeArena('crypt', 12, 8, pillars([4, 2], [4, 5], [7, 2], [7, 5], [5, 3], [6, 4])),
  keep: makeArena('keep', 12, 9, pillars([5, 3], [6, 3], [5, 5], [6, 5], [3, 1], [8, 7])),
  fen: makeArena('fen', 11, 8, pillars([3, 3], [4, 5], [5, 2], [6, 4], [7, 6], [8, 3])),
  ice: makeArena('ice', 12, 8, pillars([4, 1], [4, 6], [5, 3], [6, 4], [7, 1], [7, 6])),
  dunes: makeArena('dunes', 13, 8, pillars([5, 2], [6, 5], [8, 3], [9, 6])),
  spire: makeArena('spire', 12, 9, pillars([4, 2], [4, 6], [7, 2], [7, 6], [5, 4], [6, 4])),
};
