/**
 * Dev tool: traces the reference map picture into a hex map.
 *
 *   node tools/trace-map.ts <picture.png> [--preview out.png] [--write]
 *
 * It lays a pointy-top hex grid over the picture, classifies every pixel inside each hex into a
 * biome by its colour, and gives the hex the biome most of its pixels vote for. Rivers are found
 * from the bright blue pixels. A rules pass then cleans up noise, lost islands and the coast.
 * `--write` saves the result as src/world-map-data.ts (the fixed data the game reads); `--preview`
 * draws the traced map with the game's palette so it can be compared with the picture by eye.
 *
 * The saved map is then edited by hand (see world-map.ts); this tool is only the first draft.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { BIOME_CHARS, formatWorldMap, neighborsOf } from '../src/world-map.ts';

// ---------- grid laid over the picture ----------

export const COLS = 40;
export const ROWS = 40;
/** Where hex (0,0) is in the picture and how big a hex is (pointy-top, odd rows shifted right). */
const HEX_W = 29.4;
const X0 = 2;
const Y0 = -17;
const S = HEX_W / Math.sqrt(3);
const ROW_STEP = 1.5 * S;

const center = (col: number, row: number) => ({
  x: X0 + (col + 0.5 + 0.5 * (row & 1)) * HEX_W,
  y: Y0 + S + row * ROW_STEP,
});

// ---------- pixel classification ----------

type Kind =
  | 'water'
  | 'river'
  | 'plains'
  | 'savanna'
  | 'forest'
  | 'dense_forest'
  | 'hills'
  | 'swamp'
  | 'desert'
  | 'snow'
  | 'ice'
  | 'ashlands'
  | 'lava'
  | 'mountains'
  | 'other';

function hsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b) / 255;
  const mn = Math.min(r, g, b) / 255;
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (mx === r / 255) h = ((g - b) / 255 / d) % 6;
  else if (mx === g / 255) h = (b - r) / 255 / d + 2;
  else h = (r - g) / 255 / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function classify(r: number, g: number, b: number): Kind {
  const [h, s, l] = hsl(r, g, b);
  // Lava: bright orange.
  if (r > 190 && g < 140 && b < 90) return 'lava';
  // Blues: ocean, coast, rivers, ice.
  if (h >= 185 && h <= 235 && s > 0.2) {
    if (l < 0.42) return 'water';
    // Snow and ice are pale and washed out; river and coast water are a strong blue.
    if ((Math.max(r, g, b) - Math.min(r, g, b)) / 255 < 0.42 && l > 0.6) {
      return l > 0.82 ? 'ice' : 'snow';
    }
    return 'river';
  }
  if (l > 0.84 && b >= r - 8) return 'ice';
  if (l > 0.7 && b > r + 6 && s < 0.5) return 'snow';
  // Greys and dark slate: mountains and ash.
  if (s < 0.2) return l < 0.3 ? 'ashlands' : 'mountains';
  if (h >= 140 && h < 200 && s < 0.26 && l < 0.34) return 'ashlands';
  // Sand, savanna.
  if (h >= 28 && h < 52 && s > 0.35 && l > 0.45) return h < 44 ? 'desert' : 'savanna';
  if (h >= 15 && h < 52 && l <= 0.45) return 'hills'; // brown ground
  // Teal swamp.
  if (h >= 150 && h < 200) return l > 0.3 ? 'swamp' : 'forest';
  // Greens: dark tree crowns, olive hills, light grass.
  if (h >= 52 && h < 150) {
    if (l < 0.3) return 'forest';
    if (h < 75 && l < 0.45) return 'hills';
    return 'plains';
  }
  return 'other';
}

// ---------- landmarks ----------

/** Where the picture shows its labelled places (pixels of the picture), traced to hexes. */
const LANDMARK_PIXELS: Array<[string, number, number]> = [
  ['frost_giant', 682, 62],
  ['goblin_keep', 705, 236],
  ['starting_city', 800, 402],
  ['old_crypt', 988, 340],
  ['sand_warden', 278, 266],
  ['ancient_guardian', 486, 450],
  ['swamp_lord', 534, 665],
  ['dragon_wyrm', 786, 797],
];

function nearestHex(x: number, y: number): { col: number; row: number } {
  let best = { col: 0, row: 0 };
  let bestD = Infinity;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const c = center(col, row);
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bestD) {
        bestD = d;
        best = { col, row };
      }
    }
  }
  return best;
}

export const landmarks = () => LANDMARK_PIXELS.map(([id, x, y]) => ({ id, ...nearestHex(x, y) }));

// ---------- tracing ----------

type Tally = Partial<Record<Kind, number>>;

function sample(png: PNG, col: number, row: number): { tally: Tally; n: number } {
  const c = center(col, row);
  const R = S * 0.72;
  const tally: Tally = {};
  let n = 0;
  for (let y = Math.floor(c.y - R); y <= Math.ceil(c.y + R); y++) {
    for (let x = Math.floor(c.x - R); x <= Math.ceil(c.x + R); x++) {
      if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
      if (Math.hypot(x - c.x, y - c.y) > R) continue;
      const i = (y * png.width + x) * 4;
      const k = classify(png.data[i]!, png.data[i + 1]!, png.data[i + 2]!);
      tally[k] = (tally[k] ?? 0) + 1;
      n++;
    }
  }
  return { tally, n };
}

type Biome = Exclude<Kind, 'river' | 'other'>;

/** The first draft: one biome per hex, plus the hexes a river runs through. */
export function trace(png: PNG): { biomes: Biome[][]; rivers: boolean[][] } {
  const biomes: Biome[][] = [];
  const rivers: boolean[][] = [];
  for (let row = 0; row < ROWS; row++) {
    const b: Biome[] = [];
    const rv: boolean[] = [];
    for (let col = 0; col < COLS; col++) {
      const { tally, n } = sample(png, col, row);
      const share = (k: Kind) => (tally[k] ?? 0) / Math.max(1, n);
      let best: Biome;
      const wet = share('water') + share('river');
      if (wet >= 0.45 && share('river') + share('water') > 0.6) best = 'water';
      else if (share('lava') > 0.15) best = 'lava';
      else {
        // Ground that is not green wins when it fills a third of the hex.
        const special = (['snow', 'ice', 'desert', 'savanna', 'mountains', 'ashlands'] as const)
          .map((k) => [k, share(k)] as const)
          .sort((x, y) => y[1] - x[1])[0]!;
        if (special[1] > 0.33) best = special[0];
        else if (share('swamp') > 0.3) best = 'swamp';
        else if (share('forest') > 0.38) best = 'dense_forest';
        else if (share('forest') > 0.2) best = 'forest';
        else if (share('hills') > 0.3) best = 'hills';
        else best = wet > 0.5 ? 'water' : 'plains';
      }
      b.push(best);
      rv.push(share('river') > 0.065 && share('river') < 0.45 && best !== 'water');
    }
    biomes.push(b);
    rivers.push(rv);
  }
  return { biomes, rivers };
}

// ---------- rules pass ----------

/** Cleans up the first draft: noise, lost islands, ash around lava. Returns the grids as characters. */
export function rulesPass(biomes: Biome[][], rivers: boolean[][]): string[][] {
  const g = biomes.map((r) => [...r]) as Biome[][];
  const at = (c: number, r: number) => g[r]?.[c];
  // 0. The outer ring of the grid is always sea.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1) g[r]![c] = 'water';
    }
  }
  // 1. A hex whose every neighbour agrees on another biome takes that biome.
  for (let pass = 0; pass < 2; pass++) {
    const next = g.map((r) => [...r]) as Biome[][];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ns = neighborsOf(COLS, ROWS, c, r).map(([nc, nr]) => at(nc, nr)!);
        const counts = new Map<Biome, number>();
        for (const k of ns) counts.set(k, (counts.get(k) ?? 0) + 1);
        const [top, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
        if (top !== g[r]![c] && count >= (ns.length >= 6 ? 5 : ns.length)) next[r]![c] = top;
      }
    }
    for (let r = 0; r < ROWS; r++) g[r] = next[r]!;
  }
  // 2. Land that is not joined to the biggest landmass becomes sea (small islands are decoration).
  const seen = new Set<number>();
  let main: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = r * COLS + c;
      if (g[r]![c] === 'water' || seen.has(id)) continue;
      const comp: number[] = [];
      const stack = [[c, r]] as Array<[number, number]>;
      seen.add(id);
      while (stack.length) {
        const [cc, rr] = stack.pop()!;
        comp.push(rr * COLS + cc);
        for (const [nc, nr] of neighborsOf(COLS, ROWS, cc, rr)) {
          const nid = nr * COLS + nc;
          if (g[nr]![nc] === 'water' || seen.has(nid)) continue;
          seen.add(nid);
          stack.push([nc, nr]);
        }
      }
      if (comp.length > main.length) main = comp;
    }
  }
  const keep = new Set(main);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) if (!keep.has(r * COLS + c)) g[r]![c] = 'water';
  }
  // 3. Next to lava the ground is ash (passable), never bare rock or forest.
  const out = g.map((r) => [...r]) as Biome[][];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (g[r]![c] === 'lava' || g[r]![c] === 'water') continue;
      const nearLava = neighborsOf(COLS, ROWS, c, r).some(([nc, nr]) => g[nr]![nc] === 'lava');
      if (nearLava && g[r]![c] !== 'mountains') out[r]![c] = 'ashlands';
    }
  }
  // 4. Rivers: a river hex wedged against the sea is part of the coast, and a river must be a
  // line of 4 to 9 hexes per stretch (specks are shading, wide patches are coast water).
  const river = rivers.map((r) => [...r]);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const water = neighborsOf(COLS, ROWS, c, r).filter(([nc, nr]) => out[nr]![nc] === 'water');
      if (river[r]![c] && water.length >= 3) out[r]![c] = 'water';
    }
  }
  const seenRiver = new Set<number>();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = r * COLS + c;
      if (!river[r]![c] || seenRiver.has(id)) continue;
      const comp: Array<[number, number]> = [];
      const stack: Array<[number, number]> = [[c, r]];
      seenRiver.add(id);
      while (stack.length) {
        const [cc, rr] = stack.pop()!;
        comp.push([cc, rr]);
        for (const [nc, nr] of neighborsOf(COLS, ROWS, cc, rr)) {
          const nid = nr * COLS + nc;
          if (!river[nr]![nc] || seenRiver.has(nid)) continue;
          seenRiver.add(nid);
          stack.push([nc, nr]);
        }
      }
      if (comp.length < 4) for (const [cc, rr] of comp) river[rr]![cc] = false;
      // A wide patch of light blue is shallow coast water, not a river.
      if (comp.length >= 10) {
        for (const [cc, rr] of comp) {
          river[rr]![cc] = false;
          out[rr]![cc] = 'water';
        }
      }
    }
  }
  // Characters: biome letters, and a river overlay marker kept in a second grid.
  const chars = out.map((row, r) =>
    row.map((k, c) => (river[r]![c] && k !== 'water' && k !== 'lava' ? 'r' : BIOME_CHARS[k])),
  );
  return chars;
}

// ---------- hand fixes ----------

/**
 * Corrections the colours cannot make: the pale ice of the far north reads as water in the picture's
 * colours. Only sea and river hexes in these column ranges are repainted; land stays as traced.
 */
const PAINT: Array<{ row: number; from: number; to: number; biome: string }> = [
  { row: 3, from: 17, to: 25, biome: 'i' },
  { row: 4, from: 15, to: 26, biome: 'i' },
  { row: 5, from: 13, to: 25, biome: 'n' },
  { row: 6, from: 11, to: 22, biome: 'n' },
];

export function handFixes(rows: string[][]): string[][] {
  const out = rows.map((r) => [...r]);
  for (const p of PAINT) {
    for (let c = p.from; c <= p.to; c++) {
      if (out[p.row]![c] === '~' || out[p.row]![c] === 'r') out[p.row]![c] = p.biome;
    }
  }
  return out;
}

// ---------- preview ----------

const PALETTE: Record<string, number> = {
  '.': 0x8dbb45,
  S: 0xd9c36b,
  f: 0x278044,
  F: 0x174d32,
  h: 0x777b37,
  s: 0x568d79,
  d: 0xe6b653,
  n: 0xb8d8f5,
  i: 0xe6f2ff,
  a: 0x6e6862,
  l: 0xf15a24,
  m: 0x777783,
  r: 0x49b9f2,
  '~': 0x07509b,
};

export function previewPng(rows: string[]): PNG {
  const w = Math.ceil((COLS + 1) * HEX_W) + 4;
  const h = Math.ceil(ROWS * ROW_STEP + 2 * S) + 4;
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) png.data.writeUInt32BE(0x0d0b10ff, i * 4);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const ch = rows[row]![col]!;
      const rgb = PALETTE[ch] ?? 0xff00ff;
      const cx = (col + 0.5 + 0.5 * (row & 1)) * HEX_W + 2;
      const cy = S + row * ROW_STEP + 2;
      for (let y = Math.floor(cy - S); y <= Math.ceil(cy + S); y++) {
        for (let x = Math.floor(cx - HEX_W / 2); x <= Math.ceil(cx + HEX_W / 2); x++) {
          // Inside a pointy-top hexagon (with a thin gap between hexes)?
          const dx = Math.abs(x - cx);
          const dy = Math.abs(y - cy);
          if (dx > HEX_W / 2 - 0.6 || dy > S - 0.6 || dx * Math.sqrt(3) + dy > 2 * S - 1.2)
            continue;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const i = (y * w + x) * 4;
          png.data[i] = (rgb >> 16) & 255;
          png.data[i + 1] = (rgb >> 8) & 255;
          png.data[i + 2] = rgb & 255;
          png.data[i + 3] = 255;
        }
      }
    }
  }
  return png;
}

// ---------- command line ----------

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!)
) {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith('--') && a.endsWith('.png'));
  if (!input) throw new Error('usage: trace-map.ts <picture.png> [--preview out.png] [--write]');
  const png = PNG.sync.read(readFileSync(input));
  const { biomes, rivers } = trace(png);
  const rows = handFixes(rulesPass(biomes, rivers)).map((r) => r.join(''));
  const prev = args.indexOf('--preview');
  if (prev >= 0) writeFileSync(args[prev + 1]!, PNG.sync.write(previewPng(rows)));
  console.log(rows.join('\n'));
  if (args.includes('--write')) {
    const map = {
      width: COLS,
      height: ROWS,
      biomes: rows,
      overlay: rows.map((r) => '.'.repeat(r.length)),
      landmarks: landmarks(),
    };
    const file = new URL('../src/world-map-data.ts', import.meta.url);
    writeFileSync(
      file,
      `export const WORLD_MAP = \`${formatWorldMap(map)}\`;
`,
    );
    console.log('written src/world-map-data.ts');
  }
}
