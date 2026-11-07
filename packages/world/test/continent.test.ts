import { describe, expect, it } from 'vitest';
import { CONTINENT } from '../src/continent.ts';
import { neighbors } from '../src/hex.ts';
import {
  BIOME_CHARS,
  CHAR_BIOME,
  formatWorldMap,
  mapCells,
  OVERLAY_CHARS,
  parseWorldMap,
} from '../src/world-map.ts';

describe('the traced continent', () => {
  const m = CONTINENT;

  it('is a 40 by 40 grid of known biome and overlay characters', () => {
    expect(m.width).toBe(40);
    expect(m.height).toBe(40);
    for (const row of m.biomes) expect(row).toHaveLength(40);
    for (const row of m.overlay) expect(row).toHaveLength(40);
    const biomes = new Set(Object.values(BIOME_CHARS));
    for (const row of m.biomes) for (const ch of row) expect(biomes.has(ch), ch).toBe(true);
    const overlays = new Set(Object.values(OVERLAY_CHARS));
    for (const row of m.overlay) for (const ch of row) expect(overlays.has(ch), ch).toBe(true);
  });

  it('is surrounded by sea on every edge', () => {
    const sea = BIOME_CHARS.water;
    expect([...m.biomes[0]!].every((c) => c === sea)).toBe(true);
    expect([...m.biomes[m.height - 1]!].every((c) => c === sea)).toBe(true);
    for (const row of m.biomes) {
      expect(row[0]).toBe(sea);
      expect(row[m.width - 1]).toBe(sea);
    }
  });

  it('is one landmass, with the picture climate: ice in the north, lava in the south, desert in the west', () => {
    const land = (c: number, r: number) => m.biomes[r]![c] !== BIOME_CHARS.water;
    const cells: Array<[number, number]> = [];
    for (let r = 0; r < m.height; r++)
      for (let c = 0; c < m.width; c++) if (land(c, r)) cells.push([c, r]);
    const seen = new Set<string>([`${cells[0]![0]},${cells[0]![1]}`]);
    const stack = [cells[0]!];
    while (stack.length) {
      const [c, r] = stack.pop()!;
      for (const n of neighbors(m, { col: c, row: r })) {
        const key = `${n.col},${n.row}`;
        if (seen.has(key) || !land(n.col, n.row)) continue;
        seen.add(key);
        stack.push([n.col, n.row]);
      }
    }
    expect(seen.size).toBe(cells.length);
    expect(cells.length).toBeGreaterThan(500);

    const where = (biome: string) =>
      cells.filter(([c, r]) => m.biomes[r]![c] === biome).map(([c, r]) => ({ c, r }));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const ice = [...where(BIOME_CHARS.ice), ...where(BIOME_CHARS.snow)];
    const lava = where(BIOME_CHARS.lava);
    const desert = where(BIOME_CHARS.desert);
    expect(ice.length).toBeGreaterThan(10);
    expect(lava.length).toBeGreaterThan(5);
    expect(desert.length).toBeGreaterThan(30);
    expect(mean(ice.map((p) => p.r))).toBeLessThan(10); // north
    expect(mean(lava.map((p) => p.r))).toBeGreaterThan(28); // south
    expect(mean(desert.map((p) => p.c))).toBeLessThan(14); // west
  });

  it('places the picture landmarks on land, the first city centre-right', () => {
    const ids = m.landmarks.map((l) => l.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'starting_city',
        'goblin_keep',
        'old_crypt',
        'frost_giant',
        'sand_warden',
        'ancient_guardian',
        'swamp_lord',
        'dragon_wyrm',
      ]),
    );
    for (const l of m.landmarks) {
      expect(m.biomes[l.row]![l.col], l.id).not.toBe(BIOME_CHARS.water);
    }
    const city = m.landmarks.find((l) => l.id === 'starting_city')!;
    expect(city.col).toBeGreaterThan(m.width / 2);
    expect(city.row).toBeGreaterThan(m.height / 3);
    expect(city.row).toBeLessThan((2 * m.height) / 3);
  });
});

describe('the map text format', () => {
  it('round-trips and turns into world cells', () => {
    const text = '[biomes]\n~~~\n~.~\n\n[overlay]\n...\n.=.\n\n[landmarks]\nhome 1 1\n';
    const map = parseWorldMap(text);
    expect(formatWorldMap(map)).toBe(text);
    const cells = mapCells(map);
    expect(cells.terrain).toEqual(['water', 'water', 'water', 'water', 'plains', 'water']);
    expect(cells.overlay[4]).toBe('road');
    expect(CHAR_BIOME['f']).toBe('forest');
  });

  it('rejects ragged rows, unknown characters and mismatched blocks', () => {
    expect(() => parseWorldMap('[biomes]\n~~\n~\n')).toThrow();
    expect(() => parseWorldMap('[biomes]\n~?\n')).toThrow(/Unknown biome/);
    expect(() => parseWorldMap('[biomes]\n~~\n[overlay]\n.?\n')).toThrow(/Unknown overlay/);
    expect(() => parseWorldMap('[biomes]\n~~\n~~\n[overlay]\n..\n')).toThrow();
  });
});
