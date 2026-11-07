import { CONTINENT } from './continent.ts';
import { hexDistance, neighbors, stepCost } from './hex.ts';
import type { Hex } from './types.ts';
import { CHAR_BIOME, CHAR_OVERLAY, type WorldMap } from './world-map.ts';

/**
 * Where the places of the world stand on the continent. Everything is derived from the map, so
 * moving a region or a gate on the map moves its city, dungeon and boss with it:
 *  - the first city is the map's `starting_city` landmark;
 *  - a region's city stands near the middle of its open ground, its dungeon as far from the
 *    places already there as the region allows;
 *  - the boss that opens a region stands on open ground next to that region's gate, on the side
 *    of the region that leads into it (the gate hex itself belongs to the closed region).
 */

const key = (h: Hex) => `${h.col},${h.row}`;

export class Layout {
  private taken = new Set<string>();
  readonly map: WorldMap;

  constructor(map: WorldMap = CONTINENT) {
    this.map = map;
    for (const g of map.gates) this.taken.add(`${g.col},${g.row}`);
  }

  private biome = (h: Hex) => CHAR_BIOME[this.map.biomes[h.row]![h.col]!]!;
  private overlay = (h: Hex) => CHAR_OVERLAY[this.map.overlay[h.row]![h.col]!]!;
  private charOf = (zoneId: string) => this.map.zones.find((z) => z.id === zoneId)!.char;

  /** Open ground of a region where a place can stand (not on a crossing, not beside one). */
  private candidates(zoneId: string): Hex[] {
    const char = this.charOf(zoneId);
    const dims = this.map;
    const out: Hex[] = [];
    for (let row = 0; row < this.map.height; row++) {
      for (let col = 0; col < this.map.width; col++) {
        const h = { col, row };
        if (this.map.regions[row]![col] !== char) continue;
        if (stepCost(this.biome(h), this.overlay(h)) === Infinity) continue;
        if (this.taken.has(key(h))) continue;
        const around = neighbors(dims, h);
        const nearGate = this.map.gates.some((g) => hexDistance(h, g) <= 1);
        const room = around.filter(
          (n) => stepCost(this.biome(n), this.overlay(n)) !== Infinity,
        ).length;
        if (!nearGate && room >= 4) out.push(h);
      }
    }
    return out;
  }

  private take(h: Hex): Hex {
    this.taken.add(key(h));
    return { col: h.col, row: h.row };
  }

  /** The hex of the first city. */
  startCity(): Hex {
    const c = this.map.landmarks.find((l) => l.id === 'starting_city')!;
    return this.take(c);
  }

  /** A region's city: the open hex nearest the middle of the region's open ground. */
  city(zoneId: string): Hex {
    const cands = this.candidates(zoneId);
    const mx = cands.reduce((s, h) => s + h.col, 0) / cands.length;
    const my = cands.reduce((s, h) => s + h.row, 0) / cands.length;
    cands.sort(
      (a, b) =>
        Math.hypot(a.col - mx, a.row - my) - Math.hypot(b.col - mx, b.row - my) ||
        a.row - b.row ||
        a.col - b.col,
    );
    return this.take(cands[0]!);
  }

  /** The open hex of a region farthest from the given places. */
  far(zoneId: string, from: Hex[]): Hex {
    const cands = this.candidates(zoneId);
    const score = (h: Hex) => Math.min(...from.map((f) => hexDistance(h, f)));
    cands.sort((a, b) => score(b) - score(a) || a.row - b.row || a.col - b.col);
    return this.take(cands[0]!);
  }

  /** The boss that opens `toZoneId` stands beside its gate, on the side of the region before it. */
  guard(toZoneId: string): Hex {
    const gate = this.map.gates.find((g) => g.to === toZoneId)!;
    const parent = this.charOf(gate.from);
    const options = neighbors(this.map, gate)
      .filter((n) => this.map.regions[n.row]![n.col] === parent)
      .filter((n) => stepCost(this.biome(n), this.overlay(n)) !== Infinity)
      .filter((n) => !this.taken.has(key(n)))
      .sort((a, b) => a.row - b.row || a.col - b.col);
    if (options.length === 0) throw new Error(`No room for the guard of ${toZoneId}`);
    return this.take(options[0]!);
  }
}
