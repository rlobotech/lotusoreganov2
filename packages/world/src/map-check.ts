import { neighbors, stepCost } from './hex.ts';
import type { Hex } from './types.ts';
import { CHAR_BIOME, CHAR_OVERLAY, type WorldMap } from './world-map.ts';

/**
 * Checks a continent against the rules the world is built on (the map is fixed until it passes):
 *  - the sea rings the land, and every landmark and gate sits on open or crossing ground;
 *  - every region is made of land, joined to the first city once the gates leading to it are open;
 *  - a region is only reachable through its own gate: a closed region cannot be entered, and no
 *    walkable hex touches a hex of a different region except through a gate crossing;
 *  - a gate is a pass over mountains or a bridge or ford over a river, with open ground on both
 *    sides, and leads from an open region into the next;
 *  - no walkable hex is cut off from the rest (no sealed pockets);
 *  - crossings stand on the biome they open (fords and bridges on rivers, passes on mountains).
 * Climate lints (warnings) follow the design: ice and snow in the north, lava and ashlands in the
 * south, desert west of the mountains, forest and wetland on the coasts.
 */

export interface MapReport {
  errors: string[];
  warnings: string[];
  /** Walkable hexes of every region, by zone id. */
  sizes: Record<string, number>;
}

export function checkMap(map: WorldMap): MapReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { width, height } = map;
  const dims = { width, height };
  const biome = (c: number, r: number) => CHAR_BIOME[map.biomes[r]![c]!]!;
  const overlay = (c: number, r: number) => CHAR_OVERLAY[map.overlay[r]![c]!]!;
  const cost = (c: number, r: number) => stepCost(biome(c, r), overlay(c, r));
  const walkable = (c: number, r: number) => cost(c, r) !== Infinity;
  const zoneAt = (c: number, r: number) => map.regions[r]![c]!;
  const zoneOfId = new Map(map.zones.map((z) => [z.id, z]));
  const key = (h: Hex) => `${h.col},${h.row}`;

  // --- shape: sea ring, region characters ---
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const edge = r === 0 || c === 0 || r === height - 1 || c === width - 1;
      if (edge && biome(c, r) !== 'water') errors.push(`land on the edge at ${c},${r}`);
      const isSea = biome(c, r) === 'water';
      if (isSea !== (zoneAt(c, r) === '0')) {
        errors.push(`region and biome disagree at ${c},${r} (the sea is region 0, land is not)`);
      }
    }
  }

  // --- gates ---
  const chain = map.zones.map((z) => z.id);
  const gateInto = new Map<string, (typeof map.gates)[number]>();
  for (const g of map.gates) {
    const from = zoneOfId.get(g.from);
    const to = zoneOfId.get(g.to);
    if (!from || !to) {
      errors.push(`gate ${g.id} names an unknown region`);
      continue;
    }
    if (gateInto.has(g.to)) errors.push(`region ${g.to} has more than one gate`);
    gateInto.set(g.to, g);
    // A gate opens a region that comes later in the order than the one it leads from.
    if (chain.indexOf(g.from) >= chain.indexOf(g.to)) {
      errors.push(`gate ${g.id} leads into ${g.to} from ${g.from}, which opens later`);
    }
    const b = biome(g.col, g.row);
    const o = overlay(g.col, g.row);
    if (o === 'pass' ? b !== 'mountains' : o === 'bridge' || o === 'ford' ? b !== 'river' : true) {
      errors.push(
        `gate ${g.id} at ${g.col},${g.row} is a ${o} on ${b}: it must cross what it opens`,
      );
    }
    const around = neighbors(dims, { col: g.col, row: g.row });
    for (const side of [g.from, g.to]) {
      const ok = around.some(
        (n) => zoneAt(n.col, n.row) === zoneOfId.get(side)?.char && walkable(n.col, n.row),
      );
      if (!ok) errors.push(`gate ${g.id} has no open ground on the ${side} side`);
    }
  }
  const first = chain[0];
  for (const id of chain) {
    if (id !== first && !gateInto.has(id)) errors.push(`region ${id} has no gate`);
  }
  if (first && gateInto.has(first)) errors.push(`the first region ${first} must have no gate`);

  // --- walkable hexes of each region, and how the regions touch ---
  const sizes: Record<string, number> = Object.fromEntries(map.zones.map((z) => [z.id, 0]));
  const gateHexes = new Set(map.gates.map((g) => `${g.col},${g.row}`));
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const z = map.zones.find((x) => x.char === zoneAt(c, r));
      if (z && walkable(c, r)) sizes[z.id]!++;
      if (!walkable(c, r)) continue;
      // A walkable hex may only touch walkable hexes of another region through a gate crossing.
      for (const n of neighbors(dims, { col: c, row: r })) {
        if (!walkable(n.col, n.row) || zoneAt(n.col, n.row) === zoneAt(c, r)) continue;
        if (!gateHexes.has(key({ col: c, row: r })) && !gateHexes.has(key(n))) {
          errors.push(`regions touch outside a gate at ${c},${r} and ${n.col},${n.row}`);
        }
      }
    }
  }
  for (const z of map.zones) {
    if (sizes[z.id]! < 30) warnings.push(`region ${z.id} is small (${sizes[z.id]} walkable hexes)`);
  }

  // --- reachability from the first city, gate by gate ---
  const city = map.landmarks.find((l) => l.id === 'starting_city');
  if (!city) {
    errors.push('there is no starting_city landmark');
    return { errors, warnings, sizes };
  }
  if (!walkable(city.col, city.row)) errors.push('the starting city is not on open ground');
  const firstChar = map.zones[0]?.char;
  if (zoneAt(city.col, city.row) !== firstChar)
    errors.push('the starting city is not in the first region');

  /** Hexes reachable from the city when only `openZones` can be entered. */
  const reach = (openZones: Set<string>, shut?: string): Set<string> => {
    const seen = new Set<string>([key({ col: city.col, row: city.row })]);
    const stack: Hex[] = [{ col: city.col, row: city.row }];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const n of neighbors(dims, cur)) {
        if (seen.has(key(n)) || !walkable(n.col, n.row) || key(n) === shut) continue;
        if (!openZones.has(zoneAt(n.col, n.row))) continue;
        seen.add(key(n));
        stack.push(n);
      }
    }
    return seen;
  };
  const opened = new Set<string>();
  chain.forEach((id, i) => {
    const z = zoneOfId.get(id)!;
    // Before the gate leading into this region is opened it cannot be entered...
    if (i > 0) {
      // Walk with the region allowed but the hex of its gate shut: it must stay out of reach.
      const gate = gateInto.get(id);
      const before = reach(
        new Set([...opened, z.char]),
        gate ? `${gate.col},${gate.row}` : undefined,
      );
      const leaked = [...before].some((k) => {
        const [c, r] = k.split(',').map(Number) as [number, number];
        return zoneAt(c, r) === z.char;
      });
      if (leaked) errors.push(`region ${id} can be entered before its gate is open`);
    }
    opened.add(z.char);
    // ...and once it is open, every walkable hex of the regions opened so far is reachable.
    const after = reach(new Set(opened));
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (walkable(c, r) && opened.has(zoneAt(c, r)) && !after.has(`${c},${r}`)) {
          errors.push(
            `hex ${c},${r} in ${map.zones.find((x) => x.char === zoneAt(c, r))?.id} is cut off once ${id} is open`,
          );
        }
      }
    }
  });
  // The gate crossing of a region is reachable from its parent region only after that is open.
  for (const g of map.gates) {
    if (!walkable(g.col, g.row)) errors.push(`gate ${g.id} cannot be walked`);
  }

  // --- landmarks ---
  for (const l of map.landmarks) {
    if (biome(l.col, l.row) === 'water') errors.push(`landmark ${l.id} is in the sea`);
  }

  // --- crossings stand on what they open ---
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const o = overlay(c, r);
      const b = biome(c, r);
      if ((o === 'ford' || o === 'bridge') && b !== 'river')
        errors.push(`${o} on ${b} at ${c},${r}`);
      if (o === 'pass' && b !== 'mountains') errors.push(`pass on ${b} at ${c},${r}`);
      if (o === 'road' && !walkable(c, r)) errors.push(`road on ${b} at ${c},${r}`);
    }
  }

  // --- climate lints ---
  const where = (b: string) => {
    const out: Hex[] = [];
    for (let r = 0; r < height; r++)
      for (let c = 0; c < width; c++) if (biome(c, r) === b) out.push({ col: c, row: r });
    return out;
  };
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const cold = [...where('ice'), ...where('snow')];
  if (!(mean(cold.map((h) => h.row)) < height / 3))
    warnings.push('ice and snow should lie in the north');
  const hot = [...where('lava'), ...where('ashlands')];
  if (!(mean(hot.map((h) => h.row)) > (height * 2) / 3))
    warnings.push('lava and ash should lie in the south');
  const dry = [...where('desert'), ...where('savanna')];
  const ranges = where('mountains');
  if (dry.length && ranges.length) {
    const westOfRange = mean(dry.map((h) => h.col)) < mean(ranges.map((h) => h.col));
    if (!westOfRange) warnings.push('deserts should lie west of the mountain ranges');
  }
  return { errors, warnings, sizes };
}
