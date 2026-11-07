import {
  weaponRange,
  type AIRule,
  type Attributes,
  type DamageType,
  type UnitDef,
  type WeaponKind,
} from '@game/engine';
import { armorResist } from './progression.ts';

/** Monsters hold a natural weapon so the skills that ask for one work: bows, blades, clubs. */
function naturalKind(t: MonsterTemplate): WeaponKind {
  if (t.skills.includes('shoot')) return 'bow';
  return t.weapon === 'smash' ? 'hammer' : t.weapon === 'piercing' ? 'dagger' : 'sword';
}

export interface MonsterTemplate {
  id: string;
  name: string;
  sprite: string;
  base: Attributes;
  growth: Attributes;
  move: number;
  skills: string[];
  ai: AIRule[];
  /** What its weapon deals (claws, bow, club...). */
  weapon: DamageType;
  /** Armor as shares of a full set of resistances; negative shares are weaknesses. */
  armor?: Partial<Record<DamageType, number>>;
}

const a = (str: number, dex: number, int: number, vit: number, wis: number): Attributes => ({
  str,
  dex,
  int,
  vit,
  wis,
});

export const MONSTERS: Record<string, MonsterTemplate> = {
  goblin: {
    id: 'goblin',
    name: 'Goblin',
    sprite: 'goblin',
    base: a(5, 6, 1, 5, 2),
    growth: a(0.7, 0.4, 0.05, 0.7, 0.1),
    move: 3,
    skills: ['attack'],
    ai: [{ skill: 'attack' }],
    weapon: 'cut',
    armor: { cut: 0.3, piercing: 0.2, light: -0.2 },
  },
  goblin_archer: {
    id: 'goblin_archer',
    name: 'Goblin Archer',
    sprite: 'goblin_archer',
    base: a(3, 8, 1, 3, 2),
    growth: a(0.4, 0.7, 0.05, 0.5, 0.1),
    move: 3,
    skills: ['shoot'],
    ai: [{ skill: 'shoot', order: 'lowest_hp' }],
    weapon: 'piercing',
    armor: { piercing: 0.1 },
  },
  wolf: {
    id: 'wolf',
    name: 'Wolf',
    sprite: 'wolf',
    base: a(6, 9, 1, 5, 1),
    growth: a(0.7, 0.6, 0.02, 0.6, 0.05),
    move: 4,
    skills: ['attack'],
    ai: [{ skill: 'attack', order: 'lowest_hp' }],
    weapon: 'piercing',
    armor: { cut: -0.2, fire: -0.3 },
  },
  orc_brute: {
    id: 'orc_brute',
    name: 'Orc Brute',
    sprite: 'orc_brute',
    base: a(9, 4, 1, 9, 2),
    growth: a(0.9, 0.2, 0.05, 0.9, 0.1),
    move: 3,
    skills: ['attack', 'stun_bash'],
    ai: [{ skill: 'stun_bash' }, { skill: 'attack' }],
    weapon: 'smash',
    armor: { cut: 0.8, piercing: 0.6, smash: 0.6, dark: -0.2 },
  },
  skeleton: {
    id: 'skeleton',
    name: 'Skeleton',
    sprite: 'skeleton',
    base: a(6, 5, 1, 6, 1),
    growth: a(0.8, 0.3, 0.02, 0.8, 0.05),
    move: 3,
    skills: ['attack'],
    ai: [{ skill: 'attack' }],
    weapon: 'cut',
    armor: { piercing: 1, cut: 0.6, smash: -0.5, dark: 1, light: -0.8, water: 0.4, fire: -0.2 },
  },
  goblin_king: {
    id: 'goblin_king',
    name: 'Goblin King',
    sprite: 'goblin_king',
    base: a(11, 6, 3, 14, 4),
    growth: a(1.0, 0.3, 0.1, 1.2, 0.2),
    move: 3,
    skills: ['attack', 'power_strike', 'war_cry'],
    ai: [
      { skill: 'war_cry', when: { selfManaAbovePct: 20 } },
      { skill: 'power_strike' },
      { skill: 'attack' },
    ],
    weapon: 'cut',
    armor: { cut: 0.8, piercing: 0.8, smash: 0.5, fire: 0.2 },
  },
  bone_lich: {
    id: 'bone_lich',
    name: 'Bone Lich',
    sprite: 'bone_lich',
    base: a(3, 5, 14, 9, 9),
    growth: a(0.1, 0.2, 1.3, 0.9, 0.7),
    move: 3,
    skills: ['staff_bolt', 'fireball', 'heal'],
    ai: [
      { skill: 'fireball', order: 'highest_hp' },
      { skill: 'heal', order: 'lowest_hp_pct', filter: { hpBelowPct: 50 } },
      { skill: 'staff_bolt' },
    ],
    weapon: 'smash',
    armor: { dark: 1.2, piercing: 0.8, cut: 0.5, smash: 0, light: -0.8, fire: 0.2, water: 0.3 },
  },
};

// ---------- high-level monsters (levels 20 to 100) ----------

type Family = 'tank' | 'skirmisher' | 'archer' | 'caster' | 'knight' | 'boss';

/** Attribute shapes of the monster families, tuned with the balance tool. */
const FAMILIES: Record<Family, { base: Attributes; growth: Attributes; move: number }> = {
  tank: { base: a(9, 4, 1, 9, 2), growth: a(0.9, 0.2, 0.05, 0.9, 0.1), move: 3 },
  skirmisher: { base: a(6, 9, 1, 5, 1), growth: a(0.7, 0.6, 0.02, 0.6, 0.05), move: 4 },
  archer: { base: a(3, 8, 1, 3, 2), growth: a(0.4, 0.7, 0.05, 0.5, 0.1), move: 3 },
  caster: { base: a(3, 5, 10, 7, 7), growth: a(0.1, 0.2, 0.95, 0.75, 0.5), move: 3 },
  knight: { base: a(8, 5, 2, 8, 3), growth: a(0.85, 0.3, 0.05, 0.85, 0.15), move: 3 },
  boss: { base: a(12, 6, 6, 15, 6), growth: a(1.05, 0.35, 0.5, 1.2, 0.4), move: 3 },
};

function monster(
  id: string,
  name: string,
  family: Family,
  weapon: DamageType,
  skills: string[],
  ai: AIRule[],
  armor: Partial<Record<DamageType, number>>,
): MonsterTemplate {
  const f = FAMILIES[family];
  return {
    id,
    name,
    sprite: id,
    base: f.base,
    growth: f.growth,
    move: f.move,
    skills,
    ai,
    weapon,
    armor,
  };
}

const HIGH: MonsterTemplate[] = [
  // Mirewood Fen (21 to 35): earth, poison and dark
  monster(
    'bog_lurker',
    'Bog Lurker',
    'tank',
    'smash',
    ['attack', 'crushing_blow'],
    [{ skill: 'crushing_blow' }, { skill: 'attack' }],
    { earth: 1, water: 0.6, smash: 0.5, fire: -0.5, cut: 0.2 },
  ),
  monster(
    'fen_wisp',
    'Fen Wisp',
    'caster',
    'smash',
    ['staff_bolt'],
    [{ skill: 'staff_bolt', order: 'lowest_hp' }],
    { electric: 1.2, light: 0.6, earth: -0.5, dark: -0.3, piercing: 0.3 },
  ),
  monster(
    'fen_witch',
    'Fen Witch',
    'caster',
    'smash',
    ['shadow_bolt', 'stone_spike', 'heal'],
    [
      { skill: 'heal', order: 'lowest_hp_pct', filter: { hpBelowPct: 50 } },
      { skill: 'stone_spike' },
      { skill: 'shadow_bolt' },
    ],
    { dark: 0.9, earth: 0.7, light: -0.6, fire: -0.2 },
  ),
  monster(
    'bog_hag',
    'Bog Hag',
    'boss',
    'smash',
    ['shadow_bolt', 'stone_spike', 'heal', 'war_cry', 'attack'],
    [
      { skill: 'war_cry', when: { selfManaAbovePct: 30 } },
      { skill: 'heal', order: 'lowest_hp_pct', filter: { hpBelowPct: 40 } },
      { skill: 'stone_spike', order: 'crowded' },
      { skill: 'shadow_bolt' },
    ],
    { dark: 1, earth: 1, light: -0.5, fire: -0.3, cut: 0.4 },
  ),

  // Frostpeak Reach (36 to 50): water, ice and heavy smash
  monster(
    'frost_wolf',
    'Frost Wolf',
    'skirmisher',
    'piercing',
    ['attack'],
    [{ skill: 'attack', order: 'lowest_hp' }],
    { water: 1, piercing: 0.3, fire: -0.6, cut: -0.1 },
  ),
  monster(
    'frost_archer',
    'Frost Archer',
    'archer',
    'piercing',
    ['shoot', 'volley', 'backstep_shot'],
    [
      { skill: 'backstep_shot', when: { enemyAdjacent: true } },
      { skill: 'volley', order: 'crowded' },
      { skill: 'shoot', order: 'lowest_hp' },
    ],
    { water: 0.8, piercing: 0.4, fire: -0.4 },
  ),
  monster(
    'ice_golem',
    'Ice Golem',
    'tank',
    'smash',
    ['attack', 'crushing_blow'],
    [{ skill: 'crushing_blow' }, { skill: 'attack' }],
    { water: 1.2, smash: 0.8, cut: 0.6, piercing: 0.8, fire: -0.6, electric: -0.2 },
  ),
  monster(
    'frost_giant',
    'Frost Giant',
    'boss',
    'smash',
    ['attack', 'crushing_blow', 'stun_bash', 'frost_shard', 'war_cry'],
    [
      { skill: 'war_cry', when: { selfManaAbovePct: 30 } },
      { skill: 'stun_bash' },
      { skill: 'crushing_blow' },
      { skill: 'frost_shard' },
      { skill: 'attack' },
    ],
    { water: 1.2, smash: 0.7, cut: 0.6, piercing: 0.6, fire: -0.5 },
  ),

  // Scorched Wastes (51 to 65): fire, blades and sand
  monster(
    'dune_raider',
    'Dune Raider',
    'knight',
    'cut',
    ['attack', 'lunge', 'whirlwind'],
    [{ skill: 'whirlwind', when: { enemiesAtLeast: 2 } }, { skill: 'lunge' }, { skill: 'attack' }],
    { cut: 0.5, piercing: 0.4, smash: 0.2, fire: 0.5, water: -0.4 },
  ),
  monster(
    'sand_scorpion',
    'Sand Scorpion',
    'skirmisher',
    'cut',
    ['attack', 'power_strike'],
    [{ skill: 'power_strike' }, { skill: 'attack', order: 'lowest_hp' }],
    { piercing: 0.6, cut: 0.6, earth: 0.5, water: -0.5, smash: -0.2 },
  ),
  monster(
    'flame_elemental',
    'Flame Elemental',
    'caster',
    'smash',
    ['ember'],
    [{ skill: 'ember', order: 'lowest_hp' }],
    { fire: 1.5, earth: 0.4, water: -0.9, electric: 0.2 },
  ),
  monster(
    'ash_drake',
    'Ash Drake',
    'boss',
    'cut',
    ['attack', 'whirlwind', 'fireball', 'war_cry'],
    [
      { skill: 'war_cry', when: { selfManaAbovePct: 30 } },
      { skill: 'fireball', order: 'crowded' },
      { skill: 'whirlwind', when: { enemiesAtLeast: 2 } },
      { skill: 'attack' },
    ],
    { fire: 1.5, cut: 0.8, piercing: 0.6, smash: 0.4, water: -0.6 },
  ),

  // Shadowmarch (66 to 80): dark, undead and plate
  monster(
    'shadow_wraith',
    'Shadow Wraith',
    'caster',
    'smash',
    ['shadow_bolt'],
    [{ skill: 'shadow_bolt', order: 'lowest_hp' }],
    { dark: 1.3, piercing: 1, cut: 1, smash: 0.2, light: -0.9, fire: -0.3 },
  ),
  monster(
    'bone_knight',
    'Bone Knight',
    'knight',
    'cut',
    ['attack', 'power_strike', 'whirlwind', 'war_cry'],
    [
      { skill: 'war_cry', when: { selfManaAbovePct: 30 } },
      { skill: 'whirlwind', when: { enemiesAtLeast: 2 } },
      { skill: 'power_strike' },
      { skill: 'attack' },
    ],
    { piercing: 1, cut: 0.8, dark: 1, smash: -0.4, light: -0.7, fire: -0.2 },
  ),
  monster(
    'shade_archer',
    'Shade Archer',
    'archer',
    'piercing',
    ['shoot', 'volley', 'backstep_shot'],
    [
      { skill: 'backstep_shot', when: { enemyAdjacent: true } },
      { skill: 'volley', order: 'crowded' },
      { skill: 'shoot', order: 'lowest_hp' },
    ],
    { dark: 0.9, piercing: 0.7, light: -0.6 },
  ),
  monster(
    'death_knight',
    'Death Knight',
    'boss',
    'cut',
    ['attack', 'power_strike', 'whirlwind', 'shadow_bolt', 'war_cry'],
    [
      { skill: 'war_cry', when: { selfManaAbovePct: 30 } },
      { skill: 'whirlwind', when: { enemiesAtLeast: 2 } },
      { skill: 'power_strike' },
      { skill: 'shadow_bolt' },
      { skill: 'attack' },
    ],
    { dark: 1.2, cut: 1, piercing: 1, smash: 0.2, light: -0.6 },
  ),

  // The Spire (81 to 100): light, void and arcane
  monster(
    'spire_seraph',
    'Spire Seraph',
    'caster',
    'smash',
    ['smite'],
    [{ skill: 'smite', order: 'lowest_hp' }],
    { light: 1.3, electric: 0.7, dark: -0.8, earth: -0.2 },
  ),
  monster(
    'void_stalker',
    'Void Stalker',
    'skirmisher',
    'piercing',
    ['stab', 'quick_cut', 'vanish_strike'],
    [
      { skill: 'vanish_strike', when: { enemyAdjacent: true } },
      { skill: 'quick_cut' },
      { skill: 'stab', order: 'lowest_hp' },
    ],
    { dark: 1, piercing: 0.4, light: -0.6, electric: -0.2 },
  ),
  monster(
    'arcane_construct',
    'Arcane Construct',
    'tank',
    'smash',
    ['attack', 'crushing_blow'],
    [{ skill: 'crushing_blow' }, { skill: 'attack' }],
    {
      cut: 1,
      piercing: 1,
      smash: 0.9,
      fire: 0.5,
      water: 0.5,
      electric: 0.5,
      earth: 0.5,
      dark: -0.4,
    },
  ),
  monster(
    'void_lord',
    'Void Lord',
    'boss',
    'smash',
    ['shadow_bolt', 'chain_lightning', 'crushing_blow', 'war_cry'],
    [
      { skill: 'war_cry', when: { selfManaAbovePct: 30 } },
      { skill: 'chain_lightning', order: 'crowded' },
      { skill: 'crushing_blow', when: { enemyAdjacent: true } },
      { skill: 'shadow_bolt' },
    ],
    { dark: 1.4, electric: 0.8, cut: 0.6, piercing: 0.6, smash: 0.6, light: -0.6 },
  ),
  monster(
    'the_eternal',
    'The Eternal',
    'boss',
    'smash',
    ['attack', 'crushing_blow', 'stun_bash', 'smite', 'shadow_bolt', 'big_heal', 'war_cry'],
    [
      { skill: 'war_cry', when: { selfManaAbovePct: 30 } },
      { skill: 'big_heal', order: 'lowest_hp_pct', filter: { hpBelowPct: 30 } },
      { skill: 'stun_bash' },
      { skill: 'shadow_bolt', order: 'lowest_hp' },
      { skill: 'smite', order: 'crowded' },
      { skill: 'crushing_blow' },
      { skill: 'attack' },
    ],
    {
      dark: 0.9,
      light: 0.9,
      fire: 0.6,
      water: 0.6,
      electric: 0.6,
      earth: 0.6,
      cut: 0.7,
      piercing: 0.7,
      smash: 0.7,
    },
  ),
];
for (const t of HIGH) MONSTERS[t.id] = t;

/**
 * Global difficulty knob for monsters, tuned with `pnpm --filter @game/world balance:levels`. It
 * rises a little with level because characters gain more from gear, schools and skills than the
 * plain attribute growth of monsters does; the curve flattens near level 100.
 */
export const MONSTER_POWER = 1.7;
export const monsterPower = (level: number): number =>
  MONSTER_POWER + 0.4 * (1 - Math.exp(-level / 25));

export function monsterAttributes(t: MonsterTemplate, level: number): Attributes {
  const at = (k: keyof Attributes) =>
    Math.max(1, Math.round((t.base[k] + t.growth[k] * level) * monsterPower(level)));
  return { str: at('str'), dex: at('dex'), int: at('int'), vit: at('vit'), wis: at('wis') };
}

export function monsterUnit(t: MonsterTemplate, id: string, level: number): UnitDef {
  return {
    id,
    name: t.name,
    team: 'enemy',
    level,
    attributes: monsterAttributes(t, level),
    move: t.move,
    skills: t.skills,
    ai: t.ai,
    sprite: t.sprite,
    weapon: weaponRange(level, t.weapon),
    weaponKind: naturalKind(t),
    resist: armorResist(t.armor ?? {}, level),
  };
}
