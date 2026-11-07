/**
 * Dev tool: prints the saved continent (src/world-map-data.ts) as text, with its overlay and
 * landmarks, and can draw it to a picture with the game's palette.
 *
 *   node tools/print-map.ts [--preview out.png]
 */
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { CONTINENT } from '../src/continent.ts';
import { previewPng } from './trace-map.ts';

const rows = CONTINENT.biomes.map((r) => [...r]);
// Show overlays on top of the biome letters so roads, fords, bridges and passes can be seen.
const shown = rows.map((r, y) =>
  r.map((ch, x) => (CONTINENT.overlay[y]![x] === '.' ? ch : CONTINENT.overlay[y]![x]!)),
);
console.log(shown.map((r) => r.join('')).join('\n'));
console.log('');
for (const l of CONTINENT.landmarks) {
  console.log(
    `${l.id.padEnd(18)} col ${String(l.col).padStart(2)} row ${String(l.row).padStart(2)}  ${CONTINENT.biomes[l.row]![l.col]}`,
  );
}
const prev = process.argv.indexOf('--preview');
if (prev >= 0) {
  const png: PNG = previewPng(CONTINENT.biomes);
  writeFileSync(process.argv[prev + 1]!, PNG.sync.write(png));
}
