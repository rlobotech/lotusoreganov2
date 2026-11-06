/** Bump LOG_FORMAT_VERSION only for breaking changes to the event log (see PLAN.md, Versioning). */
export const LOG_FORMAT_VERSION = 1;
export const ENGINE_VERSION = '0.1.0';
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

export type StatName = 'atk' | 'magic' | 'def' | 'res' | 'speed' | 'move';

export interface Derived {
  maxHp: number;
  maxMana: number;
  atk: number;
  magic: number;
  def: number;
  res: number;
  speed: number;
  move: number;
  /** Percent chance. */
  crit: number;
  /** Percent chance for physical attacks against this unit to miss (before clamping). */
  dodge: number;
  manaRegen: number;
}

// ---------- content definitions (data-driven, will move to packages/content) ----------

export type StatusDef =
  /** Damage per round at the end of the round: round(power / 10 * caster magic). */
  | { id: string; kind: 'dot'; duration: number; power: number }
  /** Healing per round at the end of the round, same formula as dot. */
  | { id: string; kind: 'hot'; duration: number; power: number }
  /** Flat modifier to a stat (negative for debuffs). */
  | { id: string; kind: 'mod'; duration: number; stat: StatName; amount: number }
  /** Skips the unit's next `duration` turns (counted in turns, not rounds). */
  | { id: string; kind: 'stun'; duration: number };

export interface SkillDef {
  id: string;
  name: string;
  kind: 'damage' | 'heal' | 'status';
  /** Which stat attacks/defends: physical uses atk/def and can miss, magical uses magic/res and never misses. */
  damageType: 'physical' | 'magical';
  /** 10 = 1.0x of the offensive stat. */
  power: number;
  /** Manhattan range in tiles. 1 = melee (adjacent). */
  range: number;
  manaCost: number;
  /** Rounds before it can be used again (counted from the round it was used). */
  cooldown: number;
  side: 'enemy' | 'ally' | 'self';
  /** Also hits every valid unit within this Manhattan radius of the target. */
  radius?: number;
  status?: StatusDef;
  /** Percent chance to apply `status` (default 100). */
  statusChance?: number;
  /** Name of the visual effect the client plays. */
  vfx?: string;
}

export interface TargetFilter {
  hpBelowPct?: number;
  hpAbovePct?: number;
  lacksStatus?: string;
  hasStatus?: string;
}

export interface AIRule {
  skill: string;
  /** How to pick among valid targets. Default 'nearest'. */
  order?: 'nearest' | 'lowest_hp' | 'highest_hp' | 'lowest_hp_pct';
  filter?: TargetFilter;
  /** Conditions on the acting unit itself. */
  when?: {
    selfHpBelowPct?: number;
    selfManaAbovePct?: number;
    selfManaBelowPct?: number;
  };
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
  | { t: 'move'; unit: string; path: Point[] }
  | {
      t: 'skill';
      unit: string;
      skill: string;
      target: string;
      x: number;
      y: number;
      vfx: string | null;
    }
  | { t: 'miss'; target: string; skill: string }
  | {
      t: 'damage';
      target: string;
      /** Unit id for skills, or a status id for damage over time. */
      source: string;
      skill: string;
      amount: number;
      crit: boolean;
      hp: number;
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
}
