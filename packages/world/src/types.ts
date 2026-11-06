import type { AIRule, Attributes, CombatEvent, Outcome } from '@game/engine';

// ---------- world content ----------

export type Terrain = 'road' | 'plains' | 'forest' | 'hills' | 'swamp' | 'mountain' | 'water';

export interface Hex {
  col: number;
  row: number;
}

export interface MonsterSpawn {
  template: string;
  /** Inclusive range of how many to spawn (adjusted for party size). */
  min: number;
  max: number;
}

export interface EncounterDef {
  id: string;
  name: string;
  arena: string;
  monsters: MonsterSpawn[];
  weight: number;
}

export interface ZoneDef {
  id: string;
  name: string;
  minLevel: number;
  maxLevel: number;
  encounters: EncounterDef[];
  /** Zone is closed until this site (a boss dungeon) has been cleared. */
  unlockedBy?: string;
}

export interface StageDef {
  name: string;
  encounter: EncounterDef;
  /** Added to the dungeon's level for this stage. */
  levelOffset: number;
  boss?: boolean;
}

export interface DungeonDef {
  level: number;
  stages: StageDef[];
  /** 'free' = rest whenever hurt, 'limited' = `restLimit` rests per attempt, 'none' = never. */
  restPolicy: 'free' | 'limited' | 'none';
  restLimit?: number;
  rewardGold: number;
  rewardXp: number;
}

export interface SiteDef {
  id: string;
  name: string;
  kind: 'city' | 'dungeon' | 'boss_dungeon';
  col: number;
  row: number;
  dungeon?: DungeonDef;
}

export interface WorldDef {
  id: string;
  width: number;
  height: number;
  /** Row-major, width * height. */
  terrain: Terrain[];
  zoneOf: string[];
  zones: Record<string, ZoneDef>;
  sites: Record<string, SiteDef>;
  startCity: string;
}

// ---------- party ----------

export type Race = 'human' | 'elf' | 'dwarf' | 'orc';
export type ClassId = 'warrior' | 'mage' | 'priest' | 'ranger';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

export interface Member {
  id: string;
  name: string;
  race: Race;
  cls: ClassId;
  hp: number;
  mana: number;
  alive: boolean;
}

export interface Item {
  id: string;
  name: string;
  rarity: Rarity;
  itemLevel: number;
  value: number;
  favorite: boolean;
}

export interface Order {
  id: string;
  kind: 'goto';
  siteId: string;
}

export interface FightResult {
  outcome: Outcome;
  rounds: number;
  survivors: Array<{ id: string; hp: number; mana: number; alive: boolean }>;
  xp: number;
  gold: number;
  loot: Item[];
  events: CombatEvent[];
}

export type Activity =
  | { kind: 'start' }
  | { kind: 'dead' }
  | {
      kind: 'travel';
      from: Hex;
      toSite: string | null;
      path: Array<Hex & { ticks: number }>;
      i: number;
    }
  | {
      kind: 'fight';
      context: 'wild' | 'dungeon';
      title: string;
      boss: boolean;
      level: number;
      startedAt: number;
      result: FightResult;
    }
  | { kind: 'rest'; startedAt: number; ticks: number; forced: boolean };

export interface PartyState {
  id: string;
  name: string;
  mode: 'standard' | 'hardcore';
  status: 'active' | 'dead';
  seed: number;
  counter: number;
  level: number;
  xp: number;
  gold: number;
  pos: Hex;
  lastCity: string;
  members: Member[];
  bag: Item[];
  orders: Order[];
  activity: Activity;
  /** When the current activity completes (ms), or null when the party is dead. */
  nextAt: number | null;
  dungeon: { siteId: string; stage: number; restsUsed: number } | null;
  cleared: string[];
  forcedRest: boolean;
  settings: { restBelowPct: number };
  stats: { fights: number; wins: number; defeats: number; draws: number };
}

// ---------- feed (what the player sees when they return) ----------

export interface FeedEvent {
  at: number;
  kind: string;
  payload: Record<string, unknown>;
  /** Links a 'fight' event to its replay in AdvanceResult.replays. */
  replayKey?: string;
}

export interface ReplayOut {
  key: string;
  title: string;
  outcome: Outcome;
  /** Boss fights, defeats and epic drops are kept outside the normal ring buffer. */
  pinned: boolean;
  events: CombatEvent[];
}

export interface AdvanceResult {
  party: PartyState;
  events: FeedEvent[];
  replays: ReplayOut[];
}

export interface SimConfig {
  /** Length of one tick in ms (60000 in production, divided by TIME_SCALE in development). */
  tickMs: number;
  ticksPerRound: number;
  /** Random delay added to every activity so parties do not all wake on the same second. */
  jitterMs: number;
  /** Safety cap on activities processed in one advance() call (offline catch-up). */
  maxSteps: number;
  defeatGoldLossPct: number;
  defeatItemLossPct: number;
  reviveHpPct: number;
  bagSize: number;
  restMinTicks: number;
  restExtraTicks: number;
  travelTicksPerHex: number;
}

export interface MemberTemplate {
  name: string;
  race: Race;
  cls: ClassId;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  base: Attributes;
  growth: Attributes;
  move: number;
  skills: string[];
  ai: AIRule[];
}
