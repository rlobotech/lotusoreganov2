import type { Attributes, DamageType, Derived, WeaponDef } from './types.ts';

/**
 * Every number that changes with level lives here, so the level 1 to 100 curve is tuned in one
 * place. Targets (checked by tests): about 50 HP at level 1 and 5,000 to 10,000 at level 100.
 */
export const SCALING = {
  /** maxHp = (hpBase + hpPerVit * vit) * hpMult(level). */
  hpBase: 18,
  hpPerVit: 3.5,
  hpPerLevel: 0.13,
  /** Base value of a spell (and of a weapon of average quality) at level 1, and its growth. */
  spellBase: 6,
  weaponBase: 7,
  damagePerLevel: 0.5,
  /** Each point of a skill's attribute adds this much damage (2%). */
  attrBonus: 0.02,
  /** Weapons and spells roll within this share of their base value. */
  rollSpread: 0.15,
  /** Mana costs grow with level by this much per level. */
  manaCostPerLevel: 0.1,
  critMultiplier: 1.5,
  /** The off-hand weapon's strike is this share of a full hit. */
  offhandMultiplier: 0.7,
  /** A hit from hiding is this much stronger. */
  ambushMultiplier: 1.5,
  /** Resistance: points / (points + resistBase + resistPerLevel * level), capped. */
  resistBase: 30,
  resistPerLevel: 12,
  resistCap: 0.75,
  /** Hit chance when accuracy equals evasion, and its bounds (percent). */
  hitEven: 85,
  hitMin: 5,
  hitMax: 95,
} as const;

export const hpMult = (level: number): number => 1 + (level - 1) * SCALING.hpPerLevel;
export const damageMult = (level: number): number => 1 + (level - 1) * SCALING.damagePerLevel;

/** The base value of a spell at `level`, before power, attribute bonus and rolls. */
export const spellBase = (level: number): number => SCALING.spellBase * damageMult(level);

/** The damage range of an average weapon at `level`; `quality` scales it (1 = average). */
export function weaponRange(level: number, type: DamageType, quality = 1): WeaponDef {
  const avg = SCALING.weaponBase * damageMult(level) * quality;
  return {
    type,
    min: Math.max(1, Math.round(avg * (1 - SCALING.rollSpread))),
    max: Math.max(1, Math.round(avg * (1 + SCALING.rollSpread))),
  };
}

/** Damage multiplier of an attribute value (1 + 2% per point). */
export const attrMult = (value: number): number => 1 + value * SCALING.attrBonus;

export const manaCostMult = (level: number): number => 1 + (level - 1) * SCALING.manaCostPerLevel;

/** Resistance points to a share of damage taken off, from -1 (double damage) to the cap. */
export function resistPct(points: number, level: number): number {
  const k = SCALING.resistBase + SCALING.resistPerLevel * level;
  const share = Math.abs(points) / (Math.abs(points) + k);
  return points >= 0 ? Math.min(SCALING.resistCap, share) : -Math.min(1, share);
}

/** Resistance points a full set of armor gives against one type at `level` (the gear curve). */
export const armorPoints = (level: number): number => 6 * level + 10;

/** Chance (percent) that an attack with `accuracy` hits a target with `evasion`. */
export function hitChance(accuracy: number, evasion: number): number {
  const total = accuracy + evasion;
  const edge = total > 0 ? (100 * (accuracy - evasion)) / total : 0;
  return Math.min(SCALING.hitMax, Math.max(SCALING.hitMin, SCALING.hitEven + edge));
}

/** Attributes and level to derived stats. Placeholders to be tuned with the balance tools. */
export function derive(a: Attributes, level: number, move: number): Derived {
  return {
    maxHp: Math.round((SCALING.hpBase + SCALING.hpPerVit * a.vit) * hpMult(level)),
    maxMana: Math.round(10 + a.wis * 5 + a.int * 2),
    move,
    speed: 10 + a.dex,
    accuracy: 10 + a.dex * 2 + level * 3,
    evasion: 10 + a.dex * 1.5 + level * 3,
    crit: Math.min(50, 5 + a.dex * 0.1),
    manaRegen: 1 + Math.round(a.wis * 0.3),
  };
}
