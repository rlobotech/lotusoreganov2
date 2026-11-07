/** Dev tool: checks the saved continent against the map rules and prints the report. */
import { checkMap } from '../src/map-check.ts';
import { CONTINENT } from '../src/continent.ts';

const report = checkMap(CONTINENT);
console.log('regions (walkable hexes):', report.sizes);
for (const w of report.warnings) console.log('warning:', w);
for (const e of report.errors.slice(0, 60)) console.log('ERROR:', e);
if (report.errors.length > 60) console.log(`... and ${report.errors.length - 60} more`);
console.log(`${report.errors.length} errors, ${report.warnings.length} warnings`);
process.exitCode = report.errors.length ? 1 : 0;
