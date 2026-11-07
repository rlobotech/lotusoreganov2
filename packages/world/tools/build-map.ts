/**
 * Dev tool: shapes the traced draft (src/world-map-trace.ts) into the game's continent.
 *
 *   node tools/build-map.ts [--preview out.png] [--write]
 *
 * It keeps the traced geography and then, deterministically:
 *   1. cleans the draft (dense forest only stays where it is a barrier; stray river patches and
 *      desert in the ice are repainted);
 *   2. splits the land into regions around seed hexes (the flood is cheaper over open ground, so
 *      the borders fall along mountains and rivers where the picture has them);
 *   3. raises a barrier on every border (a river over low ground, mountains over high ground,
 *      dense forest in the woods) and cuts exactly one crossing, a pass or a bridge, into the
 *      borders that lead from one region to the next;
 *   4. walls off any ground the barriers cut away from the rest, and lays roads from the first
 *      city to every crossing.
 * `--write` saves src/world-map-data.ts. The result is checked by src/map-check.ts.
 */
import { writeFileSync } from 'node:fs';
import { drawHexes, PALETTE } from './draw.ts';
import {
  BIOME_CHARS,
  CHAR_BIOME,
  formatWorldMap,
  neighborsOf,
  parseWorldMap,
} from '../src/world-map.ts';
import type { Gate, MapZone, WorldMap } from '../src/world-map.ts';
import { stepCost } from '../src/hex.ts';
import type { Overlay, Terrain } from '../src/types.ts';
import { TRACED_MAP } from '../src/world-map-trace.ts';

// ---------- the regions, in the order they open up ----------

interface ZoneSpec {
  id: string;
  name: string;
  seeds: Array<[number, number]>;
}

const ZONES: ZoneSpec[] = [
  { id: 'greenwood', name: 'Greenwood', seeds: [[27, 17]] },
  {
    id: 'east_moors',
    name: 'East Moors',
    seeds: [
      [35, 13],
      [33, 17],
    ],
  },
  {
    id: 'southern_fen',
    name: 'Southern Fen',
    seeds: [
      [18, 26],
      [28, 24],
    ],
  },
  {
    id: 'northern_woods',
    name: 'Northern Woods',
    seeds: [
      [31, 7],
      [24, 9],
    ],
  },
  {
    id: 'western_highlands',
    name: 'Western Highlands',
    seeds: [
      [17, 18],
      [13, 20],
    ],
  },
  {
    id: 'frozen_north',
    name: 'Frozen North',
    seeds: [
      [21, 4],
      [14, 6],
    ],
  },
  { id: 'sand_wastes', name: 'Sand Wastes', seeds: [[8, 12]] },
  {
    id: 'southwest_coast',
    name: 'Southwest Coast',
    seeds: [
      [8, 26],
      [11, 30],
    ],
  },
  {
    id: 'ashen_volcano',
    name: 'Ashen Volcano',
    seeds: [
      [24, 33],
      [28, 30],
    ],
  },
];

/** Which region leads into which: the gates (the unlock order is the order of ZONES). */
const LEADS: Array<[string, string]> = [
  ['greenwood', 'east_moors'],
  ['greenwood', 'southern_fen'],
  ['east_moors', 'northern_woods'],
  ['greenwood', 'western_highlands'],
  ['northern_woods', 'frozen_north'],
  ['western_highlands', 'sand_wastes'],
  ['western_highlands', 'southwest_coast'],
  ['southern_fen', 'ashen_volcano'],
];

const BLOCKED: ReadonlySet<Terrain> = new Set([
  'mountains',
  'lava',
  'water',
  'river',
  'dense_forest',
]);
const open = (t: Terrain) => !BLOCKED.has(t);

type Grid<T> = T[][];

function load(): { w: number; h: number; terrain: Grid<Terrain>; city: [number, number] } {
  const m = parseWorldMap(TRACED_MAP);
  const terrain: Grid<Terrain> = m.biomes.map((r) => [...r].map((ch) => CHAR_BIOME[ch]!));
  const city = m.landmarks.find((l) => l.id === 'starting_city')!;
  return { w: m.width, h: m.height, terrain, city: [city.col, city.row] };
}

/** Step 1: the draft cleaned for the game. */
function clean(terrain: Grid<Terrain>, w: number, h: number): void {
  const at = (c: number, r: number) => terrain[r]?.[c];
  // Dense forest only stays as a barrier (step 3); the open woods are plain forest.
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (terrain[r]![c] === 'dense_forest') terrain[r]![c] = 'forest';
      // Desert never lies in the far north: the picture has a tan icon in the ice there.
      if (terrain[r]![c] === 'desert' && r < 10 && c > 14) terrain[r]![c] = 'snow';
    }
  }
  // Scattered river patches become the ground around them (rivers come back as region borders).
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (terrain[r]![c] !== 'river') continue;
      const counts = new Map<Terrain, number>();
      for (const [nc, nr] of neighborsOf(w, h, c, r)) {
        const t = at(nc, nr)!;
        if (t === 'river' || t === 'water') continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      terrain[r]![c] = best ? best[0] : 'plains';
    }
  }
}

/** Step 2: one region per land hex (index into ZONES), by a flood that is dear over rock. */
function partition(terrain: Grid<Terrain>, w: number, h: number): Grid<number> {
  const region: Grid<number> = terrain.map((row) => row.map(() => -1));
  const dist: Grid<number> = terrain.map((row) => row.map(() => Infinity));
  const queue: Array<{ d: number; c: number; r: number; z: number }> = [];
  ZONES.forEach((z, zi) => {
    for (const [c, r] of z.seeds) {
      dist[r]![c] = 0;
      region[r]![c] = zi;
      queue.push({ d: 0, c, r, z: zi });
    }
  });
  while (queue.length) {
    queue.sort((a, b) => a.d - b.d || a.z - b.z);
    const cur = queue.shift()!;
    if (cur.d > dist[cur.r]![cur.c]!) continue;
    for (const [nc, nr] of neighborsOf(w, h, cur.c, cur.r)) {
      const t = terrain[nr]![nc]!;
      if (t === 'water') continue;
      const cost = t === 'mountains' || t === 'lava' ? 5 : 1;
      const d = cur.d + cost;
      if (d < dist[nr]![nc]!) {
        dist[nr]![nc] = d;
        region[nr]![nc] = cur.z;
        queue.push({ d, c: nc, r: nr, z: cur.z });
      }
    }
  }
  return region;
}

/** The blocked biome to raise on a border over this ground. */
function barrierFor(t: Terrain, gate: boolean): Terrain {
  if (BLOCKED.has(t)) return t;
  if (t === 'forest') return gate ? 'river' : 'dense_forest';
  if (t === 'plains' || t === 'savanna' || t === 'swamp') return 'river';
  return 'mountains';
}

interface Built {
  terrain: Grid<Terrain>;
  overlay: Grid<Overlay>;
  region: Grid<number>;
  gates: Gate[];
}

const key = (c: number, r: number) => `${c},${r}`;

/** Step 3: barriers on every border and one crossing on each gate border. */
function carve(terrain: Grid<Terrain>, region: Grid<number>, w: number, h: number): Built {
  const overlay: Grid<Overlay> = terrain.map((row) => row.map(() => 'none' as Overlay));
  const gateOf = new Map<string, [number, number]>();
  for (const [from, to] of LEADS) {
    const a = ZONES.findIndex((z) => z.id === from);
    const b = ZONES.findIndex((z) => z.id === to);
    gateOf.set(`${Math.min(a, b)}-${Math.max(a, b)}`, [a, b]);
  }
  const original = terrain.map((row) => [...row]);
  // For every pair of touching regions: the hexes of the later region along the border.
  const borders = new Map<string, Array<[number, number]>>();
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const z = region[r]![c]!;
      if (z < 0) continue;
      for (const [nc, nr] of neighborsOf(w, h, c, r)) {
        const o = region[nr]![nc]!;
        if (o < 0 || o >= z) continue;
        const k = `${o}-${z}`;
        if (!borders.has(k)) borders.set(k, []);
        const list = borders.get(k)!;
        if (!list.some(([lc, lr]) => lc === c && lr === r)) list.push([c, r]);
      }
    }
  }
  const barrier = new Set<string>();
  for (const [k, hexes] of borders) {
    const gate = gateOf.has(k);
    for (const [c, r] of hexes) {
      terrain[r]![c] = barrierFor(original[r]![c]!, gate);
      barrier.add(key(c, r));
    }
  }
  // One crossing on every gate border: the barrier hex in the middle of the border that has
  // open ground on both sides.
  const gates: Gate[] = [];
  for (const [k, [from, to]] of gateOf) {
    const hexes = borders.get(k)!;
    const open_ = (c: number, r: number) =>
      !barrier.has(key(c, r)) && open(original[r]![c]!) && region[r]![c] !== -1;
    const cands = hexes.filter(([c, r]) => {
      const around = neighborsOf(w, h, c, r);
      const early = around.some(
        ([nc, nr]) => region[nr]![nc] === Math.min(from, to) && open_(nc, nr),
      );
      const late = around.some(
        ([nc, nr]) => region[nr]![nc] === Math.max(from, to) && open_(nc, nr),
      );
      return early && late;
    });
    if (cands.length === 0)
      throw new Error(`No crossing candidate between ${ZONES[from]!.id} and ${ZONES[to]!.id}`);
    const mx = hexes.reduce((s, [c]) => s + c, 0) / hexes.length;
    const my = hexes.reduce((s, [, r]) => s + r, 0) / hexes.length;
    const [c, r] = cands.sort(
      (a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my),
    )[0]!;
    // Over rock the crossing is a pass; over water, a bridge.
    if (terrain[r]![c] !== 'mountains' && terrain[r]![c] !== 'river') terrain[r]![c] = 'river';
    overlay[r]![c] = terrain[r]![c] === 'mountains' ? 'pass' : 'bridge';
    gates.push({
      id: `gate_${ZONES[to]!.id}`,
      col: c,
      row: r,
      from: ZONES[from]!.id,
      to: ZONES[to]!.id,
    });
  }
  return { terrain, overlay, region, gates };
}

/** Ground cut off from the first city (with every gate open) is walled in. Returns how many hexes. */
function wallPockets(b: Built, w: number, h: number, city: [number, number]): number {
  const cost = (c: number, r: number) => stepCost(b.terrain[r]![c]!, b.overlay[r]![c]!);
  const seen = new Set<string>([key(city[0], city[1])]);
  const stack: Array<[number, number]> = [city];
  while (stack.length) {
    const [c, r] = stack.pop()!;
    for (const [nc, nr] of neighborsOf(w, h, c, r)) {
      if (seen.has(key(nc, nr)) || cost(nc, nr) === Infinity) continue;
      seen.add(key(nc, nr));
      stack.push([nc, nr]);
    }
  }
  let walled = 0;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (cost(c, r) === Infinity || seen.has(key(c, r))) continue;
      // Not reachable and not blocked: wall it in.
      b.terrain[r]![c] = barrierFor(b.terrain[r]![c]!, false);
      walled++;
    }
  }
  return walled;
}

/** Step 4: roads from the first city to both sides of every crossing. */
function roads(b: Built, w: number, h: number, city: [number, number]): void {
  const cost = (c: number, r: number) => stepCost(b.terrain[r]![c]!, b.overlay[r]![c]!);
  for (const g of b.gates) {
    // Cheapest route over the map as it is, preferring roads already laid.
    const dist: Grid<number> = b.terrain.map((row) => row.map(() => Infinity));
    const prev = new Map<string, [number, number]>();
    const queue: Array<[number, number, number]> = [[0, city[0], city[1]]];
    dist[city[1]]![city[0]] = 0;
    const goal: [number, number] = [g.col, g.row];
    while (queue.length) {
      queue.sort((a, c) => a[0] - c[0]);
      const [d, c, r] = queue.shift()!;
      if (d > dist[r]![c]!) continue;
      if (c === goal[0] && r === goal[1]) break;
      for (const [nc, nr] of neighborsOf(w, h, c, r)) {
        const step = cost(nc, nr);
        if (step === Infinity) continue;
        const nd = d + step;
        if (nd < dist[nr]![nc]!) {
          dist[nr]![nc] = nd;
          prev.set(key(nc, nr), [c, r]);
          queue.push([nd, nc, nr]);
        }
      }
    }
    let at: [number, number] | undefined = goal;
    while (at) {
      const [c, r] = at;
      if (b.overlay[r]![c] === 'none' && open(b.terrain[r]![c]!)) b.overlay[r]![c] = 'road';
      at = prev.get(key(c, r));
    }
  }
}

/** Moves the picture's landmarks onto open ground of the region they are in. */
function snapLandmarks(b: Built, w: number, h: number, hints: WorldMap['landmarks']) {
  return hints.map((l) => {
    const z = b.region[l.row]![l.col]!;
    const queue: Array<[number, number]> = [[l.col, l.row]];
    const seen = new Set<string>([key(l.col, l.row)]);
    while (queue.length) {
      const [c, r] = queue.shift()!;
      if (b.region[r]![c] === z && open(b.terrain[r]![c]!) && b.overlay[r]![c] === 'none') {
        return { id: l.id, col: c, row: r };
      }
      for (const [nc, nr] of neighborsOf(w, h, c, r)) {
        if (seen.has(key(nc, nr))) continue;
        seen.add(key(nc, nr));
        queue.push([nc, nr]);
      }
    }
    return l;
  });
}

// ---------- build ----------

export function build(): WorldMap {
  const { w, h, terrain, city } = load();
  clean(terrain, w, h);
  const region = partition(terrain, w, h);
  // Land the flood could not reach (a lone hex cut off from every seed) is sea.
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) if (region[r]![c]! < 0) terrain[r]![c] = 'water';
  }
  const b = carve(terrain, region, w, h);
  const walled = wallPockets(b, w, h, city);
  roads(b, w, h, city);
  const zones: MapZone[] = ZONES.map((z, i) => ({ char: String(i + 1), id: z.id, name: z.name }));
  const hints = parseWorldMap(TRACED_MAP).landmarks;
  console.error(`walled ${walled} cut-off hexes`);
  return {
    width: w,
    height: h,
    biomes: b.terrain.map((row) => row.map((t) => BIOME_CHARS[t]).join('')),
    overlay: b.overlay.map((row) =>
      row.map((o) => ({ none: '.', road: '=', ford: ':', bridge: '#', pass: '^' })[o]).join(''),
    ),
    landmarks: snapLandmarks(b, w, h, hints),
    regions: b.region.map((row) => row.map((z) => (z < 0 ? '0' : String(z + 1))).join('')),
    zones,
    gates: b.gates.sort(
      (x, y) => ZONES.findIndex((z) => z.id === x.to) - ZONES.findIndex((z) => z.id === y.to),
    ),
  };
}

const REGION_COLORS = [
  0xd04040, 0x40a0d0, 0xd0a040, 0xa060d0, 0x40c070, 0xf0f0f0, 0xd07030, 0x30b0b0, 0xc03090,
];

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!)
) {
  const map = build();
  const args = process.argv.slice(2);
  const prev = args.indexOf('--preview');
  if (prev >= 0) {
    const mix = (a: number, b: number, k: number) => {
      const ch = (s: number) => ((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k;
      return (Math.round(ch(16)) << 16) | (Math.round(ch(8)) << 8) | Math.round(ch(0));
    };
    const png = drawHexes(
      map.width,
      map.height,
      (c, r) => {
        const base = PALETTE[map.biomes[r]![c]!] ?? 0xff00ff;
        const z = map.regions[r]![c]!;
        const blocked = 'mrFl~'.includes(map.biomes[r]![c]!);
        return z === '0' || blocked ? base : mix(base, REGION_COLORS[Number(z) - 1]!, 0.55);
      },
      (c, r) => {
        const o = map.overlay[r]![c]!;
        return o === '=' ? 0x5a3d1a : o === '.' ? null : o === '^' ? 0xffffff : 0x000000;
      },
    );
    writeFileSync(args[prev + 1]!, PNGsync(png));
  }
  console.log(formatWorldMap(map));
  if (args.includes('--write')) {
    writeFileSync(
      new URL('../src/world-map-data.ts', import.meta.url),
      `export const WORLD_MAP = \`${formatWorldMap(map)}\`;\n`,
    );
    console.error('written src/world-map-data.ts');
  }
}

import { PNG } from 'pngjs';
function PNGsync(png: PNG): Buffer {
  return PNG.sync.write(png);
}
