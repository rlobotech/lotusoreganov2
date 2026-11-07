import { describe, expect, it } from 'vitest';
import { CONTINENT } from '../src/continent.ts';
import { neighbors } from '../src/hex.ts';
import { checkMap } from '../src/map-check.ts';
import { BIOME_CHARS, CHAR_BIOME, formatWorldMap, parseWorldMap } from '../src/world-map.ts';
import type { WorldMap } from '../src/world-map.ts';

/** A copy of the continent that a test can damage. */
const clone = (): WorldMap => parseWorldMap(formatWorldMap(CONTINENT));

function setBiome(m: WorldMap, c: number, r: number, ch: string): void {
  m.biomes[r] = m.biomes[r]!.slice(0, c) + ch + m.biomes[r]!.slice(c + 1);
}
function setOverlay(m: WorldMap, c: number, r: number, ch: string): void {
  m.overlay[r] = m.overlay[r]!.slice(0, c) + ch + m.overlay[r]!.slice(c + 1);
}

const walkable = (m: WorldMap, c: number, r: number) => {
  const b = CHAR_BIOME[m.biomes[r]![c]!]!;
  return (
    !['mountains', 'river', 'lava', 'water', 'dense_forest'].includes(b) || m.overlay[r]![c] !== '.'
  );
};

describe('the continent passes the map rules', () => {
  const report = checkMap(CONTINENT);

  it('has no errors', () => {
    expect(report.errors).toEqual([]);
  });

  it('has nine regions in unlock order, each with room to hunt in', () => {
    expect(CONTINENT.zones.map((z) => z.id)).toEqual([
      'greenwood',
      'east_moors',
      'southern_fen',
      'northern_woods',
      'western_highlands',
      'frozen_north',
      'sand_wastes',
      'southwest_coast',
      'ashen_volcano',
    ]);
    for (const z of CONTINENT.zones) expect(report.sizes[z.id], z.id).toBeGreaterThanOrEqual(20);
  });

  it('opens the first four regions in the order east, south, north of the east, then west', () => {
    const into = (id: string) => CONTINENT.gates.find((g) => g.to === id)!;
    expect(into('east_moors').from).toBe('greenwood');
    expect(into('southern_fen').from).toBe('greenwood');
    expect(into('northern_woods').from).toBe('east_moors');
    expect(into('western_highlands').from).toBe('greenwood');
    const city = CONTINENT.landmarks.find((l) => l.id === 'starting_city')!;
    const at = (id: string) => into(id);
    // East of the city, south of it, north of the east, west of it.
    expect(at('east_moors').col).toBeGreaterThan(city.col);
    expect(at('southern_fen').row).toBeGreaterThan(city.row);
    expect(at('northern_woods').row).toBeLessThan(at('east_moors').row);
    expect(at('western_highlands').col).toBeLessThan(city.col);
  });

  it('gives every gate one crossing over what it opens, with open ground on both sides', () => {
    expect(CONTINENT.gates).toHaveLength(CONTINENT.zones.length - 1);
    for (const g of CONTINENT.gates) {
      const b = CONTINENT.biomes[g.row]![g.col]!;
      const o = CONTINENT.overlay[g.row]![g.col]!;
      expect(o === '^' ? b === BIOME_CHARS.mountains : b === BIOME_CHARS.river, g.id).toBe(true);
      expect(['^', '#']).toContain(o);
    }
  });

  it('is walled: no walkable hex touches another region except at a gate', () => {
    const gateKeys = new Set(CONTINENT.gates.map((g) => `${g.col},${g.row}`));
    for (let r = 0; r < CONTINENT.height; r++) {
      for (let c = 0; c < CONTINENT.width; c++) {
        if (!walkable(CONTINENT, c, r)) continue;
        for (const n of neighbors(CONTINENT, { col: c, row: r })) {
          if (!walkable(CONTINENT, n.col, n.row)) continue;
          if (CONTINENT.regions[n.row]![n.col] === CONTINENT.regions[r]![c]) continue;
          expect(gateKeys.has(`${c},${r}`) || gateKeys.has(`${n.col},${n.row}`)).toBe(true);
        }
      }
    }
  });
});

describe('the checker catches a broken map', () => {
  it('a gate that is not a crossing', () => {
    const m = clone();
    const g = m.gates[0]!;
    setOverlay(m, g.col, g.row, '.');
    const e = checkMap(m).errors.join('\n');
    expect(e).toMatch(/must cross what it opens/);
  });

  it('a hole in a wall lets a closed region be entered', () => {
    const m = clone();
    const gateKeys = new Set(m.gates.map((g) => `${g.col},${g.row}`));
    // A barrier hex of a region (not a gate) with open ground of two different regions beside it.
    let hole: [number, number] | null = null;
    for (let r = 1; r < m.height - 1 && !hole; r++) {
      for (let c = 1; c < m.width - 1 && !hole; c++) {
        if (walkable(m, c, r) || m.regions[r]![c] === '0' || gateKeys.has(`${c},${r}`)) continue;
        const zones = new Set(
          neighbors(m, { col: c, row: r })
            .filter((n) => walkable(m, n.col, n.row))
            .map((n) => m.regions[n.row]![n.col]),
        );
        // Open ground of the first region on one side, and of a region that is still closed (not one
        // of the three the first region leads into) on the other.
        if (zones.has('1') && [...zones].some((z) => ['4', '6', '7', '8', '9'].includes(z!))) {
          hole = [c, r];
        }
      }
    }
    expect(hole).not.toBeNull();
    setBiome(m, hole![0], hole![1], BIOME_CHARS.plains);
    const e = checkMap(m).errors.join('\n');
    expect(e).toMatch(/regions touch outside a gate/);
    expect(e).toMatch(/entered before its gate is open/);
  });

  it('a pocket of ground cut off from the rest', () => {
    const m = clone();
    const city = m.landmarks.find((l) => l.id === 'starting_city')!;
    let target: [number, number] | null = null;
    for (let r = 2; r < m.height - 2 && !target; r++) {
      for (let c = 2; c < m.width - 2 && !target; c++) {
        if (m.regions[r]![c] !== '1' || (c === city.col && r === city.row)) continue;
        const ns = neighbors(m, { col: c, row: r });
        if (
          walkable(m, c, r) &&
          ns.every((n) => walkable(m, n.col, n.row) && m.regions[n.row]![n.col] === '1')
        ) {
          target = [c, r];
        }
      }
    }
    expect(target).not.toBeNull();
    for (const n of neighbors(m, { col: target![0], row: target![1] })) {
      setBiome(m, n.col, n.row, BIOME_CHARS.mountains);
    }
    expect(checkMap(m).errors.join('\n')).toMatch(/cut off/);
  });

  it('land on the edge, a region with no gate, a backwards gate, a city on rock', () => {
    const edge = clone();
    setBiome(edge, 0, 5, BIOME_CHARS.plains);
    expect(checkMap(edge).errors.join('\n')).toMatch(/land on the edge/);

    const noGate = clone();
    noGate.gates.pop();
    expect(checkMap(noGate).errors.join('\n')).toMatch(/has no gate/);

    const backwards = clone();
    const g = backwards.gates[0]!;
    [g.from, g.to] = [g.to, g.from];
    expect(checkMap(backwards).errors.join('\n')).toMatch(/opens later/);

    const city = clone();
    const c = city.landmarks.find((l) => l.id === 'starting_city')!;
    setBiome(city, c.col, c.row, BIOME_CHARS.lava);
    expect(checkMap(city).errors.join('\n')).toMatch(/starting city is not on open ground/);
  });

  it('a ford on mountains and a pass on a river', () => {
    const m = clone();
    let done = 0;
    for (let r = 1; r < m.height - 1 && done < 2; r++) {
      for (let c = 1; c < m.width - 1 && done < 2; c++) {
        const b = m.biomes[r]![c];
        if (m.overlay[r]![c] !== '.') continue;
        if (b === BIOME_CHARS.mountains && done === 0) {
          setOverlay(m, c, r, ':');
          done++;
        } else if (b === BIOME_CHARS.river && done === 1) {
          setOverlay(m, c, r, '^');
          done++;
        }
      }
    }
    const e = checkMap(m).errors.join('\n');
    expect(e).toMatch(/ford on mountains/);
    expect(e).toMatch(/pass on river/);
  });
});
