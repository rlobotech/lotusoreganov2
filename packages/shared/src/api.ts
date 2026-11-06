/** Response shapes of the game API, shared so the server and the web app cannot drift apart. */

export type SlotName = 'weapon' | 'offhand' | 'head' | 'body' | 'feet' | 'ring' | 'charm';
export type AttrName = 'str' | 'dex' | 'int' | 'vit' | 'wis';
export type AttrMap = Record<AttrName, number>;

export interface ItemInfo {
  id: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic';
  itemLevel: number;
  value: number;
  favorite: boolean;
  slot?: SlotName;
  bonuses?: Partial<AttrMap>;
}

export interface AiRuleInfo {
  skill: string;
  order?: 'nearest' | 'lowest_hp' | 'highest_hp' | 'lowest_hp_pct';
  filter?: {
    hpBelowPct?: number;
    hpAbovePct?: number;
    lacksStatus?: string;
    hasStatus?: string;
  };
  when?: { selfHpBelowPct?: number; selfManaAbovePct?: number; selfManaBelowPct?: number };
}

export interface MemberInfo {
  id: string;
  name: string;
  race: string;
  cls: string;
  alive: boolean;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  /** Where the attributes come from: class/race/level, points spent, and worn gear. */
  attributes: { base: AttrMap; alloc: AttrMap; gear: AttrMap; total: AttrMap };
  derived: { atk: number; magic: number; def: number; res: number; speed: number; move: number };
  points: number;
  autoAlloc: boolean;
  equipment: Partial<Record<SlotName, ItemInfo>>;
  /** Personal bag: only its owner moves items in or out, and it is safe from defeat losses. */
  bag: ItemInfo[];
  skills: string[];
  ai: AiRuleInfo[];
}

export interface SkillInfo {
  id: string;
  name: string;
  kind: 'damage' | 'heal' | 'status';
  damageType: 'physical' | 'magical';
  power: number;
  range: number;
  manaCost: number;
  cooldown: number;
  side: 'enemy' | 'ally' | 'self';
  radius?: number;
  status?: { id: string; kind: string; duration: number };
}

export interface ShopEntry {
  id: string;
  name: string;
  slot: SlotName;
  rarity: ItemInfo['rarity'];
  itemLevel: number;
  bonuses: Partial<AttrMap>;
  value: number;
  price: number;
}

export interface CityInfo {
  city: { id: string; name: string };
  stock: ShopEntry[];
  teleports: Array<{ siteId: string; name: string; cost: number }>;
}

export interface OrderInfo {
  id: string;
  kind: 'goto' | 'quest';
  siteId?: string;
  questId?: string;
  /** "Go to Oakhaven" or "Quest: Pest control". */
  label: string;
  /** The place the order currently leads to (for the map), if it is a place. */
  targetSiteId: string | null;
}

export interface QuestObjectiveInfo {
  label: string;
  progress: number;
  target: number;
  done: boolean;
}

export interface QuestInfo {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  repeatable: boolean;
  status: 'available' | 'active' | 'completed' | 'locked';
  /** Why a locked quest cannot be taken yet. */
  reason?: string;
  objectives: QuestObjectiveInfo[];
  reward: { gold: number; xp: number; item?: { name: string; rarity: ItemInfo['rarity'] } };
  /** Set for quests that open a boss dungeon. */
  opens?: string;
}

export interface PartySummary {
  id: string;
  name: string;
  mode: 'standard' | 'hardcore';
  status: 'active' | 'dead';
  level: number;
  xp: number;
  xpToNext: number;
  gold: number;
  pos: { col: number; row: number };
  lastCity: string;
  members: MemberInfo[];
  bag: ItemInfo[];
  /** Shared bag capacity and personal bag capacity (per member). */
  bagSize: number;
  personalBagSize: number;
  orders: OrderInfo[];
  cleared: string[];
  dungeon: {
    siteId: string;
    stage: number;
    restsUsed: number;
    name?: string;
    stages?: number;
  } | null;
  /** What the party is doing now. `endsAt` is when it finishes (ms since epoch), null if never. */
  activity: { kind: string; label: string; endsAt: number | null };
  /** Quests being worked on, with progress, and how many have been completed. */
  quests: { active: QuestInfo[]; completedCount: number };
  /** Set while the party stands in a city it can use (shop, sell, teleport). */
  city: { id: string; name: string } | null;
  /** The party is waiting in town and can be sent on its way. */
  inTown: boolean;
  stats: { fights: number; wins: number; defeats: number; draws: number };
}

export interface WorldInfo {
  id: string;
  width: number;
  height: number;
  terrain: string[];
  zoneOf: string[];
  startCity: string;
  zones: Array<{
    id: string;
    name: string;
    minLevel: number;
    maxLevel: number;
    unlockedBy: string | null;
  }>;
  sites: Array<{
    id: string;
    name: string;
    kind: 'city' | 'dungeon' | 'boss_dungeon';
    col: number;
    row: number;
    dungeon?: { recommendedLevel: number; stages: number; restPolicy: string };
    /** A boss dungeon opens only to a party that has taken this quest. */
    requiresQuest?: { id: string; name: string };
  }>;
}

export interface FeedEntry {
  id: number;
  at: number;
  kind: string;
  payload: Record<string, unknown>;
  replayId: number | null;
}

export interface FeedPage {
  after: number;
  hasMore: boolean;
  events: FeedEntry[];
}

export interface ReplayListEntry {
  id: number;
  title: string;
  outcome: 'victory' | 'defeat' | 'draw';
  pinned: boolean;
  createdAt: string;
}
