/** Bump LOG_FORMAT_VERSION only for breaking changes to the event log (see PLAN.md, Versioning). */
export const LOG_FORMAT_VERSION = 3;
export const ENGINE_VERSION = '1.0.0';
/** Hard cap so a fight can never hang a tick. Reaching it ends the fight as a draw. */
export const MAX_ROUNDS = 50;

export type Team = 'party' | 'enemy';

export interface Point {
  x: number;
  y: number;
}

export interface Attributes {
  str: number;
  dex: number;
  int: number;
  vit: number;
  wis: number;
}

export type AttrName = keyof Attributes;

// ---------- damage types and resistances ----------

export type DamageType =
  | 'piercing'
  | 'smash'
  | 'cut'
  | 'blood'
  | 'fire'
  | 'water'
  | 'electric'
  | 'earth'
  | 'dark'
  | 'light';

export const PHYSICAL_TYPES: readonly DamageType[] = ['piercing', 'smash', 'cut', 'blood'];
export const MAGICAL_TYPES: readonly DamageType[] = [
  'fire',
  'water',
  'electric',
  'earth',
  'dark',
  'light',
];
export const DAMAGE_TYPES: readonly DamageType[] = [...PHYSICAL_TYPES, ...MAGICAL_TYPES];
export const isPhysical = (t: DamageType): boolean => PHYSICAL_TYPES.includes(t);

/** Resistance points per type (negative is a weakness). `resistPct` turns points into a percentage. */
export type Resistances = Partial<Record<DamageType, number>>;

// ---------- derived stats ----------

/** Stats a status can change. damage, accuracy and evasion are percentages; speed and move are flat. */
export type StatName = 'damage' | 'accuracy' | 'evasion' | 'speed' | 'move';

export interface Derived {
  maxHp: number;
  maxMana: number;
  /** Tiles of movement per turn. */
  move: number;
  /** Initiative: higher acts first in a round. */
  speed: number;
  accuracy: number;
  evasion: number;
  /** Percent chance. */
  crit: number;
  manaRegen: number;
}

// ---------- content definitions (data-driven, will move to packages/content) ----------

export type StatusDef =
  /** Damage per round at the end of the round: round(power / 10 * spell base * attribute bonus), resisted by `damageType`. */
  | { id: string; kind: 'dot'; duration: number; power: number; damageType: DamageType }
  /** Healing per round at the end of the round, same formula as dot. */
  | { id: string; kind: 'hot'; duration: number; power: number }
  /** Modifier to a stat (negative for debuffs). */
  | { id: string; kind: 'mod'; duration: number; stat: StatName; amount: number }
  /** Skips the unit's next `duration` turns (counted in turns, not rounds). */
  | { id: string; kind: 'stun'; duration: number };

/** What a weapon is. Skills can ask for one of several kinds. */
export type WeaponKind = 'sword' | 'dagger' | 'axe' | 'mace' | 'hammer' | 'staff' | 'bow';

/**
 * A unit a skill calls up. It fights on the caster's team until it dies, acts in the turn it was
 * called (last in line for that round),
 * and does not count when deciding whether a team has lost. Its attributes are shares of the
 * caster's (times the caster's `skillMods` power for the skill); its level is the caster's.
 */
export interface SummonDef {
  /** The kind of summon: at most `UnitDef.summonLimits[group]` (default 1) of a kind can be out at once. */
  group: string;
  name: string;
  sprite?: string;
  /** Each attribute as a share of the caster's (1 = the same; missing = a half). */
  shares: Partial<Attributes>;
  move: number;
  skills: string[];
  ai: AIRule[];
  /** Its weapon, for weapon skills: the damage type and quality (1 = a normal weapon of its level). */
  weapon?: { type: DamageType; quality: number };
}

export interface SkillDef {
  id: string;
  name: string;
  kind: 'damage' | 'heal' | 'status' | 'summon';
  /**
   * 'weapon': the hit uses the unit's weapon (its damage range and, unless `damageType` is set, its
   * type) and always needs an accuracy roll. 'spell': its strength comes from the unit's level.
   */
  source: 'weapon' | 'spell';
  /** Damage type. Required for spells that deal damage; weapon skills use the weapon's type by default. */
  damageType?: DamageType;
  /** The attribute that makes it stronger (a percentage bonus per point). */
  attr: AttrName;
  /** 10 = 1.0x of the base value. */
  power: number;
  /** Range in tiles (8-direction distance). 1 = melee (any of the 8 neighbours). */
  range: number;
  manaCost: number;
  /** Rounds before it can be used again (counted from the round it was used). */
  cooldown: number;
  side: 'enemy' | 'ally' | 'self';
  /** Also hits every valid unit within this many tiles of the target. */
  radius?: number;
  status?: StatusDef;
  /** Percent chance to apply `status` (default 100). */
  statusChance?: number;
  /** Spells never miss unless this is set (arrows, bolts): then they roll accuracy like a weapon. */
  dodgeable?: boolean;
  /** Costs no action: the unit can still act after using it. */
  free?: boolean;
  /** After the skill the user steps away from enemies, up to this many tiles, without provoking. */
  retreat?: number;
  /** For a 'summon' skill: the unit it calls up beside the caster. */
  summon?: SummonDef;
  /** Name of the visual effect the client plays. */
  vfx?: string;
  /** The unit must wear one of these kinds of weapon to use the skill. Absent: any (or none). */
  weapons?: WeaponKind[];
  /** The school the skill belongs to (data for the world: learning and school levels). */
  school?: string;
  /** How a character learns it by training: school level, and optionally another skill used N times. */
  unlock?: { level: number; skill?: string; uses?: number };
  /** Cannot be learned by training, only from a book. */
  bookOnly?: boolean;
}

/** How a rule picks among the valid targets (the first one wins). */
export type TargetOrder =
  /** Closest (the default), farthest, or the enemy/ally with the most of its own side around it. */
  | 'nearest'
  | 'farthest'
  | 'crowded'
  /** Lowest or highest current health, or lowest health share. */
  | 'lowest_hp'
  | 'highest_hp'
  | 'lowest_hp_pct'
  /** Highest strength, or the least total resistance ("least armor"). */
  | 'strongest'
  | 'least_armor';

export const TARGET_ORDERS: readonly TargetOrder[] = [
  'nearest',
  'farthest',
  'crowded',
  'lowest_hp',
  'highest_hp',
  'lowest_hp_pct',
  'strongest',
  'least_armor',
];

/** Conditions on the target. */
export interface TargetFilter {
  hpBelowPct?: number;
  hpAbovePct?: number;
  /** True: only a target at full health. */
  fullHealth?: boolean;
  lacksStatus?: string;
  hasStatus?: string;
}

/**
 * A move linked to a rule. `before` walks first and the rule only applies if the skill can then be
 * used; `after` walks with the movement left once the skill is done.
 * - toward: close in on the target. away: get clear of enemies (weighing opportunity attacks).
 * - range: keep as far from enemies as the skill's reach allows. stay: do not move at all.
 */
export type MoveMode = 'toward' | 'away' | 'range' | 'stay';
export const MOVE_MODES: readonly MoveMode[] = ['toward', 'away', 'range', 'stay'];

export interface RuleMove {
  when: 'before' | 'after';
  mode: MoveMode;
}

/** Special action: the unit's basic weapon attack, whatever it is. */
export const WEAPON_ATTACK = 'weapon_attack';

export interface AIRule {
  /** A skill id, or WEAPON_ATTACK. Who it targets (self, enemy, ally) follows from the skill. */
  skill: string;
  /** How to pick among valid targets. Default 'nearest'. */
  order?: TargetOrder;
  filter?: TargetFilter;
  /** Special conditions on the acting unit and the battlefield. */
  when?: {
    selfHpBelowPct?: number;
    selfHpAbovePct?: number;
    selfManaAbovePct?: number;
    selfManaBelowPct?: number;
    selfHasStatus?: string;
    selfLacksStatus?: string;
    /** True: only when an enemy stands next to the unit. False: only when none does. */
    enemyAdjacent?: boolean;
    /** At least this many enemies are still standing. */
    enemiesAtLeast?: number;
  };
  /** A move linked to this rule. Without one, ranged units still step back after shooting. */
  move?: RuleMove;
}

/** What a unit hits with. Skills of source 'weapon' roll between `min` and `max`. */
export interface WeaponDef {
  type: DamageType;
  min: number;
  max: number;
}

/** Extra damage added to every weapon hit (a fire sword adds fire damage). Resisted on its own. */
export interface ExtraDamage {
  type: DamageType;
  min: number;
  max: number;
}

export interface UnitDef {
  id: string;
  name: string;
  team: Team;
  level: number;
  attributes: Attributes;
  move: number;
  skills: string[];
  /** Evaluated top to bottom; the first rule that can be carried out this turn wins. */
  ai: AIRule[];
  sprite?: string;
  /** The weapon behind weapon skills. Default: a plain weapon of the unit's level that smashes. */
  weapon?: WeaponDef;
  /** The kind of weapon held, for skills that need one. Units without a kind hold none. */
  weaponKind?: WeaponKind;
  extraDamage?: ExtraDamage[];
  /**
   * Per-skill strength for this unit, from its skill and school levels: `power` multiplies the
   * damage or healing of the skill (1 = unchanged) and `rounds` is added to the duration of the
   * status it applies.
   */
  skillMods?: Record<string, { power?: number; rounds?: number }>;
  /** How many summons of each kind this unit may have out at once (default 1 per kind). */
  summonLimits?: Record<string, number>;
  /** Resistance points from armor and the like. */
  resist?: Resistances;
  /** Starting hp / mana when the unit enters the fight hurt. Default: full. */
  hp?: number;
  mana?: number;
}

export interface ArenaDef {
  id: string;
  width: number;
  height: number;
  blocked: Point[];
  spawns: { party: Point[]; enemy: Point[] };
}

export interface CombatInput {
  seed: number;
  arena: ArenaDef;
  units: UnitDef[];
  skills: Record<string, SkillDef>;
}

// ---------- event log ----------

export interface UnitSnapshot {
  id: string;
  name: string;
  team: Team;
  level: number;
  sprite: string | null;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
}

export type CombatEvent =
  | {
      t: 'start';
      formatVersion: number;
      engineVersion: string;
      seed: number;
      arena: { id: string; width: number; height: number; blocked: Point[] };
      units: UnitSnapshot[];
    }
  | { t: 'round'; n: number; order: string[] }
  | { t: 'turn'; unit: string }
  /** One stretch of walking. A walk is split where an opportunity attack interrupts it. */
  | { t: 'move'; unit: string; path: Point[]; retreat?: boolean }
  | {
      t: 'skill';
      unit: string;
      skill: string;
      target: string;
      x: number;
      y: number;
      vfx: string | null;
      /** An opportunity attack, made with the reaction instead of the unit's turn. */
      reaction?: boolean;
    }
  | {
      /** A summon appears beside its caster. It acts later in the same round, last in line. */
      t: 'summon';
      unit: string;
      caster: string;
      skill: string;
      name: string;
      team: Team;
      level: number;
      sprite: string | null;
      x: number;
      y: number;
      hp: number;
      maxHp: number;
      mana: number;
      maxMana: number;
    }
  | {
      t: 'miss';
      target: string;
      skill: string;
      /** The hit chance it failed, in percent. */
      chance: number;
    }
  | {
      t: 'damage';
      target: string;
      /** Unit id for skills, or a status id for damage over time. */
      source: string;
      skill: string;
      /** Damage after resistance. */
      amount: number;
      crit: boolean;
      hp: number;
      type: DamageType;
      /** Percent of the damage the target's resistance took off (negative: a weakness). */
      resist: number;
      /** Hit chance in percent, absent when the hit could not miss. */
      chance?: number;
      /** Extra damage from the weapon (a second, separately resisted part of the same hit). */
      extra?: boolean;
    }
  | { t: 'heal'; target: string; source: string; skill: string; amount: number; hp: number }
  | { t: 'status'; unit: string; status: string; on: boolean }
  | { t: 'skip'; unit: string; reason: 'stun' | 'wait' }
  | { t: 'death'; unit: string }
  | { t: 'end'; outcome: Outcome; rounds: number };

export type Outcome = 'victory' | 'defeat' | 'draw';

export interface FinalUnit {
  id: string;
  team: Team;
  /** Called up during the fight (it is not one of the units that started it). */
  summon?: boolean;
  hp: number;
  mana: number;
  alive: boolean;
}

export interface CombatResult {
  outcome: Outcome;
  rounds: number;
  events: CombatEvent[];
  units: FinalUnit[];
}

// ---------- internal runtime state ----------

export interface ActiveStatus {
  def: StatusDef;
  remaining: number;
  /** Snapshot of per-round amount for dot/hot. */
  amount: number;
  source: string;
}

export interface UnitState {
  def: UnitDef;
  id: string;
  team: Team;
  x: number;
  y: number;
  hp: number;
  mana: number;
  alive: boolean;
  base: Derived;
  cooldowns: Record<string, number>;
  statuses: ActiveStatus[];
  weapon: WeaponDef;
  extraDamage: ExtraDamage[];
  resist: Resistances;
  /** Still has this round's reaction (one per round). */
  reaction: boolean;
  /** Tiles of movement left this turn. */
  movesLeft: number;
  /** For a summon: the unit that called it up, and its kind. */
  owner?: string;
  group?: string;
}
