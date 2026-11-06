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
  /** What a city's shop sells. */
  shop?: ShopItem[];
  /** A boss dungeon only opens to a party that has taken this quest. */
  requiresQuest?: string;
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
  quests: Record<string, QuestDef>;
}

// ---------- party ----------

export type Race = 'human' | 'elf' | 'dwarf' | 'orc';
export type ClassId = 'warrior' | 'mage' | 'priest' | 'ranger';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

export type Slot = 'weapon' | 'offhand' | 'head' | 'body' | 'feet' | 'ring' | 'charm';
export const SLOTS: readonly Slot[] = [
  'weapon',
  'offhand',
  'head',
  'body',
  'feet',
  'ring',
  'charm',
];

/** Slots in each member's personal bag. */
export const PERSONAL_BAG_SIZE = 5;
/** Shared bag capacity of a new party. */
export const DEFAULT_BAG_SIZE = 40;

export interface Member {
  id: string;
  name: string;
  race: Race;
  cls: ClassId;
  hp: number;
  mana: number;
  alive: boolean;
  /** Worn items. Each item's `bonuses` add to the member's attributes. */
  equipment: Partial<Record<Slot, Item>>;
  /**
   * Personal bag (up to PERSONAL_BAG_SIZE). Only its owner moves items in or out, loot never lands
   * here by itself, and its items are safe from defeat losses and bag overflow.
   */
  bag: Item[];
  /** Attribute points the player has spent (on top of class, race and level growth). */
  alloc: Attributes;
  /** Unspent attribute points. */
  points: number;
  /** Spend new points automatically in the class's usual pattern. */
  autoAlloc: boolean;
  /** Skills this member can use (class skills for now; more are learned later). */
  skills: string[];
  /** The member's combat AI, edited by the player. */
  ai: AIRule[];
}

export interface Item {
  id: string;
  name: string;
  rarity: Rarity;
  itemLevel: number;
  value: number;
  favorite: boolean;
  /** Where it is worn. Items without a slot cannot be equipped (older saves). */
  slot?: Slot;
  bonuses?: Partial<Attributes>;
}

export interface ShopItem {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  itemLevel: number;
  bonuses: Partial<Attributes>;
  /** What one unit of the item sells for, and the basis of the buy price. */
  value: number;
  price: number;
}

export interface Order {
  id: string;
  /** 'goto' sends the party to a place; 'quest' works on a quest's current objective. */
  kind: 'goto' | 'quest';
  siteId?: string;
  questId?: string;
}

// ---------- quests ----------

export type Objective =
  /** Defeat `count` monsters of this kind (wild or dungeon), counted from acceptance. */
  | { type: 'kill'; template: string; count: number }
  /** Arrive at a place. */
  | { type: 'visit'; siteId: string }
  /** Clear a dungeon. */
  | { type: 'clear'; siteId: string };

export interface QuestReward {
  gold: number;
  xp: number;
  /** A guaranteed item, made from an item base like shop stock is. */
  item?: { base: string; itemLevel: number; rarity: Rarity };
}

export interface QuestDef {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  /** Quests that must be completed first. */
  requires?: string[];
  /** Objectives are worked through in order. */
  objectives: Objective[];
  reward: QuestReward;
  /** Can be taken again after completing it. */
  repeatable?: boolean;
}

export interface QuestProgress {
  id: string;
  /** One number per objective: kills so far, or 1 once a visit/clear is done. */
  progress: number[];
}

export interface FightResult {
  outcome: Outcome;
  rounds: number;
  survivors: Array<{ id: string; hp: number; mana: number; alive: boolean }>;
  xp: number;
  gold: number;
  loot: Item[];
  /** Monsters defeated by kind, for quest progress. Missing in fights saved before quests. */
  kills?: Record<string, number>;
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
  | { kind: 'rest'; startedAt: number; ticks: number; forced: boolean }
  /** Waiting in a city after an order, so the player can shop and manage. */
  | { kind: 'town'; startedAt: number; ticks: number };

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
  /** Shared bag capacity. Missing on older saves: SimConfig.bagSize applies. Raised by bag items. */
  bagSize?: number;
  orders: Order[];
  activity: Activity;
  /** When the current activity completes (ms), or null when the party is dead. */
  nextAt: number | null;
  dungeon: { siteId: string; stage: number; restsUsed: number } | null;
  cleared: string[];
  /** Cities the party has been to; only these can be teleported to. */
  visited: string[];
  quests: { active: QuestProgress[]; completed: string[] };
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
  /** Attribute points each member earns per level. */
  pointsPerLevel: number;
  /** How long the party waits in a city after an order before it goes back to hunting. */
  townStayTicks: number;
  teleportBaseCost: number;
  teleportCostPerHex: number;
  teleportTicks: number;
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
  /** The pattern attribute points follow when spent automatically (repeats). */
  pointOrder: Array<keyof Attributes>;
}
