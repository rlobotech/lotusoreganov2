import { encounterPool, runLevel } from '../balance.ts';
import { STARTER_WORLD } from '../starter-world.ts';

// Usage: pnpm --filter @game/world balance:encounters [--fights 30] [--levels 10,40,80] [--own]
// Win and defeat rate of every encounter of the world at the same level as the party, to spot
// monsters that are far stronger or weaker than the rest. With --own, each zone's encounters are
// played at that zone's lowest, middle and highest level instead.
const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? def) : def;
};
const fights = Number(opt('fights', '30'));
const own = args.includes('--own');
const levels = opt('levels', '10,40,80').split(',').map(Number);

console.log('encounter (defeat% / share of health lost in wins)');
if (own) {
  for (const zone of Object.values(STARTER_WORLD.zones)) {
    const lv = [zone.minLevel, Math.round((zone.minLevel + zone.maxLevel) / 2), zone.maxLevel];
    console.log(`${zone.name}  (levels ${lv.join(', ')})`);
    for (const e of zone.encounters) {
      const cells = lv.map((level) => {
        const r = runLevel(level, { fights, encounters: [e] });
        return `${r.defeatPct.toFixed(0)}/${r.avgHpLostPct.toFixed(0)}`.padStart(9);
      });
      console.log(`  ${e.id.padEnd(30)}${cells.join('')}`);
    }
  }
} else {
  console.log(`${''.padEnd(32)}${levels.map((l) => `L${l}`.padStart(9)).join('')}`);
  for (const e of encounterPool()) {
    const cells = levels.map((level) => {
      const r = runLevel(level, { fights, encounters: [e] });
      return `${r.defeatPct.toFixed(0)}/${r.avgHpLostPct.toFixed(0)}`.padStart(9);
    });
    console.log(`${e.id.padEnd(32)}${cells.join('')}`);
  }
}
