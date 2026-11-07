import {
  weaponRange,
  type AIRule,
  type Attributes,
  type DamageType,
  type UnitDef,
} from '@game/engine';
import { armorResist } from './progression.ts';

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

/** Global difficulty knob for monsters, tuned with `pnpm --filter @game/world balance`. */
export const MONSTER_POWER = 1.3;

export function monsterAttributes(t: MonsterTemplate, level: number): Attributes {
  const at = (k: keyof Attributes) =>
    Math.max(1, Math.round((t.base[k] + t.growth[k] * level) * MONSTER_POWER));
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
    resist: armorResist(t.armor ?? {}, level),
  };
}
