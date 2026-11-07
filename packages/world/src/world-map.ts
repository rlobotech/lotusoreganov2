import { neighbors } from './hex.ts';
import type { Overlay, Terrain } from './types.ts';

/**
 * The continent as fixed text data (see world-map-data.ts, first traced from the reference picture
 * by tools/trace-map.ts and then edited by hand). The text has three blocks:
 *
 *   [biomes]     one character per hex, one line per row (legend in BIOME_CHARS)
 *   [overlay]    the same grid: . nothing, = road, : ford, # bridge, ^ pass
 *   [landmarks]  `id col row` lines: places from the picture (bosses, the first city)
 */

export const BIOME_CHARS: Record<Terrain, string> = {
  plains: '.',
  savanna: 'S',
  forest: 'f',
  dense_forest: 'F',
  hills: 'h',
  swamp: 's',
  desert: 'd',
  snow: 'n',
  ice: 'i',
  ashlands: 'a',
  lava: 'l',
  mountains: 'm',
  river: 'r',
  water: '~',
};

export const OVERLAY_CHARS: Record<Overlay, string> = {
  none: '.',
  road: '=',
  ford: ':',
  bridge: '#',
  pass: '^',
};

export const CHAR_BIOME = Object.fromEntries(
  Object.entries(BIOME_CHARS).map(([k, v]) => [v, k as Terrain]),
) as Record<string, Terrain>;
export const CHAR_OVERLAY = Object.fromEntries(
  Object.entries(OVERLAY_CHARS).map(([k, v]) => [v, k as Overlay]),
) as Record<string, Overlay>;

export interface Landmark {
  id: string;
  col: number;
  row: number;
}

export interface WorldMap {
  width: number;
  height: number;
  /** One string per row. */
  biomes: string[];
  overlay: string[];
  landmarks: Landmark[];
}

export function parseWorldMap(text: string): WorldMap {
  const blocks: Record<string, string[]> = {};
  let current = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const head = /^\[(\w+)\]$/.exec(line);
    if (head) {
      current = head[1]!;
      blocks[current] = [];
    } else if (line && current) {
      blocks[current]!.push(line);
    }
  }
  const biomes = blocks.biomes ?? [];
  const overlay = blocks.overlay ?? biomes.map((r) => '.'.repeat(r.length));
  const width = biomes[0]?.length ?? 0;
  for (const rows of [biomes, overlay]) {
    if (rows.length !== biomes.length || rows.some((r) => r.length !== width)) {
      throw new Error('The world map blocks must be rectangular and the same size');
    }
  }
  for (const row of biomes) {
    for (const ch of row) if (!CHAR_BIOME[ch]) throw new Error(`Unknown biome character "${ch}"`);
  }
  for (const row of overlay) {
    for (const ch of row)
      if (!CHAR_OVERLAY[ch]) throw new Error(`Unknown overlay character "${ch}"`);
  }
  const landmarks = (blocks.landmarks ?? []).map((line) => {
    const [id, col, row] = line.split(/\s+/);
    if (!id || col === undefined || row === undefined) throw new Error(`Bad landmark: ${line}`);
    return { id, col: Number(col), row: Number(row) };
  });
  return { width, height: biomes.length, biomes, overlay, landmarks };
}

export function formatWorldMap(map: WorldMap): string {
  return [
    '[biomes]',
    ...map.biomes,
    '',
    '[overlay]',
    ...map.overlay,
    '',
    '[landmarks]',
    ...map.landmarks.map((l) => `${l.id} ${l.col} ${l.row}`),
    '',
  ].join('\n');
}

/** The biome and overlay arrays of a map, row-major, as the world definition wants them. */
export function mapCells(map: WorldMap): { terrain: Terrain[]; overlay: Overlay[] } {
  return {
    terrain: map.biomes.flatMap((r) => [...r].map((ch) => CHAR_BIOME[ch]!)),
    overlay: map.overlay.flatMap((r) => [...r].map((ch) => CHAR_OVERLAY[ch]!)),
  };
}

/** The neighbours of a hex as [col, row] pairs (a thin wrapper for tools working on grids). */
export function neighborsOf(
  width: number,
  height: number,
  col: number,
  row: number,
): Array<[number, number]> {
  return neighbors({ width, height }, { col, row }).map((h) => [h.col, h.row]);
}
