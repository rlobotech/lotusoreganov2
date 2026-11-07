import { createRng, runCombat, type Rng } from '@game/engine';
import { ARENAS } from './arenas.ts';
import { autoEquip, learnUnlocked } from './learning.ts';
import { starterGear } from './loot.ts';
import { MONSTERS, monsterUnit } from './monsters.ts';
import { CLASSES, grantPoints, memberDerived } from './progression.ts';
import { SKILL_TREE } from './skill-tree.ts';
import { SKILLS } from './skills.ts';
import { createParty, memberUnit } from './sim.ts';
import { STARTER_WORLD } from './starter-world.ts';
import type { ClassId, EncounterDef, PartyState, Rarity } from './types.ts';

/**
 * Balance tooling: plays the same fight over and over at any level from 1 to 100, so the curves of
 * characters and monsters can be tuned against numbers instead of feel. See `cli/balance-levels.ts`.
 */

export interface PartyAtLevelOptions {
  classes?: ClassId[];
  /** Quality of the gear: the class kit at the level, made of this rarity. */
  rarity?: Rarity;
}

const DEFAULT_CLASSES: ClassId[] = ['warrior', 'mage', 'priest', 'rogue'];

/** The level a character's skills have been trained to by `level` (one skill level per ten character levels). */
export const trainedSkillLevel = (level: number): number =>
  Math.min(10, Math.max(1, Math.ceil(level / 10)));

/**
 * A party as a player would have it at `level`: attribute points spent by the class pattern, the
 * class kit at that level, schools trained to match, and every skill those schools unlock.
 */
export function partyAtLevel(level: number, opts: PartyAtLevelOptions = {}): PartyState {
  const classes = opts.classes ?? DEFAULT_CLASSES;
  const p = createParty({
    id: 'balance',
    name: 'Balance',
    seed: 1,
    now: 0,
    world: STARTER_WORLD,
    members: classes.map((cls, i) => ({ name: `${cls}${i}`, race: 'human', cls })),
  });
  p.level = level;
  for (const m of p.members) {
    const cls = CLASSES[m.cls];
    grantPoints(m, (level - 1) * 1);
    m.equipment = starterGear(cls.kit, m.id, level, opts.rarity ?? 'common');
    // Every skill the character knows is trained to match its level, which unlocks more skills
    // (their requirements follow from the school levels), until nothing new opens up.
    const trained = trainedSkillLevel(level);
    for (let again = true; again;) {
      again = false;
      for (const id of m.skills) {
        if (SKILL_TREE[id] && (m.skillLevels[id] ?? 0) < trained) {
          m.skillLevels[id] = trained;
          again = true;
        }
      }
      if (learnUnlocked(m, level).length > 0) again = true;
    }
    // Carry what the AI uses first, then whatever else fits.
    m.equipped = [];
    autoEquip(m, level);
  }
  return p;
}

export interface FightStats {
  fights: number;
  winPct: number;
  defeatPct: number;
  avgRounds: number;
  /** Average share of the party's health lost in won fights. */
  avgHpLostPct: number;
}

/** Every normal encounter of the starter world, the pool the balance runs draw from. */
export function encounterPool(): EncounterDef[] {
  const seen = new Map<string, EncounterDef>();
  for (const z of Object.values(STARTER_WORLD.zones))
    for (const e of z.encounters) seen.set(e.id, e);
  return [...seen.values()];
}

export interface RunOptions {
  fights?: number;
  seed?: number;
  /** Monster level relative to the party's. */
  offset?: number;
  encounters?: EncounterDef[];
  party?: PartyAtLevelOptions;
}

/** Plays `fights` random encounters at `level` against a fresh full-health party each time. */
export function runLevel(level: number, opts: RunOptions = {}): FightStats {
  const fights = opts.fights ?? 60;
  const pool = opts.encounters ?? encounterPool();
  const rng: Rng = createRng((opts.seed ?? 1) * 7919 + level);
  const monsterLevel = Math.max(1, level + (opts.offset ?? 0));
  const base = partyAtLevel(level, opts.party);
  let wins = 0;
  let defeats = 0;
  let rounds = 0;
  let lost = 0;
  for (let f = 0; f < fights; f++) {
    const p = structuredClone(base);
    const enc = pool[rng.int(0, pool.length - 1)]!;
    const enemies = enc.monsters.flatMap((spawn, si) =>
      Array.from({ length: rng.int(spawn.min, spawn.max) }, (_, i) =>
        monsterUnit(MONSTERS[spawn.template]!, `e${si}_${i}`, monsterLevel),
      ),
    );
    const units = p.members.map((m) => memberUnit(p, m));
    const result = runCombat({
      seed: rng.int(1, 0x7fffffff),
      arena: ARENAS[enc.arena]!,
      units: [
        ...units.map((u) => ({ ...u, hp: undefined, mana: undefined })),
        ...enemies.slice(0, 6),
      ],
      skills: SKILLS,
    });
    rounds += result.rounds;
    if (result.outcome === 'victory') {
      wins++;
      const party = result.units.filter((u) => u.team === 'party');
      const maxOf = (id: string) =>
        memberDerived(
          p.members.find((m) => m.id === id)!,
          level,
        ).maxHp;
      const total = party.reduce((s, u) => s + maxOf(u.id), 0);
      lost += 1 - party.reduce((s, u) => s + u.hp, 0) / total;
    } else if (result.outcome === 'defeat') defeats++;
  }
  return {
    fights,
    winPct: (wins / fights) * 100,
    defeatPct: (defeats / fights) * 100,
    avgRounds: rounds / fights,
    avgHpLostPct: wins ? (lost / wins) * 100 : 100,
  };
}
