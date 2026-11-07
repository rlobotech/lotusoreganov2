import { runLevel } from '../balance.ts';

// Usage: pnpm --filter @game/world balance:levels [--fights 60] [--offset 0] [--rarity common]
// Plays a full-gear party against monsters of the same level (or `offset` levels above) and
// prints how each level fares, so the level 1 to 100 curves can be tuned.
const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? def) : def;
};
const fights = Number(opt('fights', '60'));
const offset = Number(opt('offset', '0'));
const rarity = opt('rarity', 'common') as 'common' | 'uncommon' | 'rare' | 'epic';
const levels = [1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100];

console.log(
  `${fights} fights per level, monsters ${offset >= 0 ? '+' : ''}${offset} levels, ${rarity} gear`,
);
console.log('Level  win%  defeat%  rounds  hp lost in wins');
for (const level of levels) {
  const r = runLevel(level, { fights, offset, party: { rarity } });
  console.log(
    `${String(level).padStart(5)}  ${r.winPct.toFixed(0).padStart(4)}  ${r.defeatPct.toFixed(0).padStart(7)}  ${r.avgRounds.toFixed(1).padStart(6)}  ${r.avgHpLostPct.toFixed(0).padStart(6)}%`,
  );
}
