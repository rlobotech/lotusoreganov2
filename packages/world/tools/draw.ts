import { PNG } from 'pngjs';

/** Pointy-top hexes drawn to a picture, for the map tools. */
export const HEX_W = 29.4;
export const S = HEX_W / Math.sqrt(3);
export const ROW_STEP = 1.5 * S;

/** Biome colours by map character (the same palette the game draws with). */
export const PALETTE: Record<string, number> = {
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

/** Draws a `cols` by `rows` grid; `colorAt` gives each hex its colour (0xRRGGBB). */
export function drawHexes(
  cols: number,
  rows: number,
  colorAt: (col: number, row: number) => number,
  dotAt?: (col: number, row: number) => number | null,
): PNG {
  const w = Math.ceil((cols + 1) * HEX_W) + 4;
  const h = Math.ceil(rows * ROW_STEP + 2 * S) + 4;
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) png.data.writeUInt32BE(0x0d0b10ff, i * 4);
  const put = (x: number, y: number, rgb: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    png.data[i] = (rgb >> 16) & 255;
    png.data[i + 1] = (rgb >> 8) & 255;
    png.data[i + 2] = rgb & 255;
    png.data[i + 3] = 255;
  };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const rgb = colorAt(col, row);
      const cx = (col + 0.5 + 0.5 * (row & 1)) * HEX_W + 2;
      const cy = S + row * ROW_STEP + 2;
      for (let y = Math.floor(cy - S); y <= Math.ceil(cy + S); y++) {
        for (let x = Math.floor(cx - HEX_W / 2); x <= Math.ceil(cx + HEX_W / 2); x++) {
          // Inside a pointy-top hexagon (with a thin gap between hexes)?
          const dx = Math.abs(x - cx);
          const dy = Math.abs(y - cy);
          if (dx > HEX_W / 2 - 0.6 || dy > S - 0.6 || dx * Math.sqrt(3) + dy > 2 * S - 1.2)
            continue;
          put(x, y, rgb);
        }
      }
      const dot = dotAt?.(col, row);
      if (dot !== null && dot !== undefined) {
        for (let y = -4; y <= 4; y++) {
          for (let x = -4; x <= 4; x++)
            if (x * x + y * y <= 16) put(Math.round(cx + x), Math.round(cy + y), dot);
        }
      }
    }
  }
  return png;
}
