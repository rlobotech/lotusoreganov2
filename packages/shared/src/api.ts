/** Response shapes of the game API, shared so the server and the web app cannot drift apart. */

export type SlotName = 'weapon' | 'offhand' | 'head' | 'body' | 'feet' | 'ring' | 'charm';
export type AttrName = 'str' | 'dex' | 'int' | 'vit' | 'wis';
export type AttrMap = Record<AttrName, number>;

export type DamageTypeName =
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

export interface DamageRange {
  type: DamageTypeName;
  min: number;
  max: number;
}

/** Combat stats an item may have, besides its attribute bonuses. */
export interface GearInfo {
  /** Attribute points the wearer needs (base and spent points; gear does not count). */
  requires?: Partial<AttrMap>;
  /** Weapons: the kind, hands, damage, and extra damage added to every hit. */
  kind?: 'sword' | 'dagger' | 'axe' | 'mace' | 'hammer' | 'staff' | 'bow';
  hands?: 1 | 2;
  weapon?: DamageRange;
  extra?: DamageRange[];
  /** Armor: resistance points per damage type. */
  resist?: Partial<Record<DamageTypeName, number>>;
}

export type CaravanKindName = 'mount' | 'pet' | 'bag' | 'tent';

export interface CaravanItemInfo {
  kind: CaravanKindName;
  /** 1 to 5. */
  tier: number;
  abilities?: Array<'scavenger' | 'swift'>;
}

export interface ItemInfo extends GearInfo {
  id: string;
  /** A caravan accessory: it is equipped in the Caravan tab, not worn by a character. */
  caravan?: CaravanItemInfo;
  /** A skill book: the id of the skill it teaches. */
  teaches?: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic';
  itemLevel: number;
  value: number;
  favorite: boolean;
  slot?: SlotName;
  bonuses?: Partial<AttrMap>;
}

export type TargetOrderName =
  | 'nearest'
  | 'farthest'
  | 'crowded'
  | 'lowest_hp'
  | 'highest_hp'
  | 'lowest_hp_pct'
  | 'strongest'
  | 'least_armor';

export type MoveModeName = 'toward' | 'away' | 'range' | 'stay';

/** The skill id of the basic weapon attack, whatever the weapon is. */
export const WEAPON_ATTACK_ID = 'weapon_attack';

export interface AiRuleInfo {
  /** A skill id, or 'weapon_attack'. Who it targets (self, enemy, ally) follows from the skill. */
  skill: string;
  order?: TargetOrderName;
  /** Conditions on the target. */
  filter?: {
    hpBelowPct?: number;
    hpAbovePct?: number;
    fullHealth?: boolean;
    lacksStatus?: string;
    hasStatus?: string;
  };
  /** Special conditions on the character and the battlefield. */
  when?: {
    selfHpBelowPct?: number;
    selfHpAbovePct?: number;
    selfManaAbovePct?: number;
    selfManaBelowPct?: number;
    selfHasStatus?: string;
    selfLacksStatus?: string;
    enemyAdjacent?: boolean;
    enemiesAtLeast?: number;
  };
  /** A move linked to the rule, before or after its skill. */
  move?: { when: 'before' | 'after'; mode: MoveModeName };
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
  derived: {
    speed: number;
    move: number;
    accuracy: number;
    evasion: number;
    crit: number;
  };
  /** What the worn gear does in a fight: weapon damage and resistances (points and percent). */
  combat: {
    weapon: DamageRange | null;
    extra: DamageRange[];
    resist: Partial<Record<DamageTypeName, { points: number; pct: number }>>;
  };
  points: number;
  autoAlloc: boolean;
  equipment: Partial<Record<SlotName, ItemInfo>>;
  /** Personal bag: only its owner moves items in or out, and it is safe from defeat losses. */
  bag: ItemInfo[];
  /** This character's own gold. */
  gold: number;
  /** The viewing player controls this character (solo: all of them). Others are look-only. */
  mine: boolean;
  skills: string[];
  /** Every school the character has skills in, with its level (the sum of its skills' levels, up to 100). */
  schools: SchoolInfo[];
  /** The level of every learned skill of the tree, with its progress towards the next level. */
  skillLevels: Record<string, { level: number; xp: number; next: number | null }>;
  /** The skills carried into a fight (the AI can use only these), and how many fit at this level. */
  equipped: string[];
  equipLimit: number;
  /** Carried skills that cannot be used with the gear worn now, with the reason (a missing weapon). */
  skillIssues: Record<string, string>;
  /** Skills still locked in those schools, with what is missing. */
  locked: Array<{ skill: string; missing: string }>;
  ai: AiRuleInfo[];
}

export interface SchoolInfo {
  id: string;
  name: string;
  /** 0 to `max`. */
  level: number;
  max: number;
}

export interface SkillInfo {
  id: string;
  name: string;
  kind: 'damage' | 'heal' | 'status';
  /** 'weapon' skills hit with the character's weapon; spells come with their own strength. */
  source: 'weapon' | 'spell';
  /** The damage type of a spell, or of a weapon skill that sets its own. Weapon skills use the weapon's. */
  damageType: string | null;
  /** The attribute that makes it stronger. */
  attr: string;
  power: number;
  range: number;
  manaCost: number;
  cooldown: number;
  side: 'enemy' | 'ally' | 'self';
  radius?: number;
  /** Steps back this many tiles after use, without provoking. */
  retreat?: number;
  /** Costs no action. */
  free?: boolean;
  status?: { id: string; kind: string; duration: number };
  /** The schools whose tree it is in (two for a dual skill). */
  schools: string[];
  bookOnly?: boolean;
  /** A passive mastery: always on, takes no slot. */
  passive?: boolean;
  /** What raises its level: damage, healing or uses. */
  measure: 'damage' | 'healing' | 'uses';
  /** What learning it needs (character level, school levels, other skills at levels). */
  requires: {
    charLevel?: number;
    schools?: Record<string, number>;
    skills?: Record<string, number>;
  };
  /** Skills with the same name in several schools (Slash) share a family. */
  family?: string;
  /** Only a proposal until the name is settled. */
  proposed?: boolean;
  /** Has a combat definition. A skill without one waits for its engine feature. */
  usable: boolean;
  /** Weapon kinds it needs in hand. */
  weapons?: string[];
}

export interface ShopEntry extends GearInfo {
  id: string;
  name: string;
  /** Missing for caravan accessories, which are not worn. */
  slot?: SlotName;
  caravan?: CaravanItemInfo;
  rarity: ItemInfo['rarity'];
  itemLevel: number;
  bonuses: Partial<AttrMap>;
  value: number;
  price: number;
}

export interface CityInfo {
  city: { id: string; name: string };
  stock: ShopEntry[];
  /** When the rotating part of the stock changes (ms since epoch). */
  rotatesAt: number;
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
  /** All gold carried by the party, and the part the viewer can spend. */
  gold: number;
  spendableGold: number;
  pos: { col: number; row: number };
  lastCity: string;
  members: MemberInfo[];
  bag: ItemInfo[];
  /** Items waiting for a free shared bag slot (quest rewards); they arrive on their own. */
  pendingItems: ItemInfo[];
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
  /** The party's accessories, one per kind, what they do now, and the carrier pet's state. */
  caravan: Partial<Record<CaravanKindName, ItemInfo>>;
  caravanEffects: {
    /** Extra world speed (0.1 = 10% faster), extra shared bag slots, faster recovery (fraction). */
    mountSpeed: number;
    bagSlots: number;
    tentHealing: number;
  };
  /** The tier tables (index 0 is tier 1), so the client can show what a tier does. */
  caravanTiers: {
    mountSpeed: number[];
    bagSlots: number[];
    tentHealing: number[];
    petSaleRate: number[];
    petBag: number[];
    petSpeed: number[];
  };
  pet: PetInfo;
  /** Set while the party is on a city or right next to it: it can trade there. */
  city: { id: string; name: string } | null;
  /** The party is waiting in town and can be sent on its way. */
  inTown: boolean;
  stats: { fights: number; wins: number; defeats: number; draws: number };
}

export interface PetInfo {
  /** A pet is equipped. The rest describes it. */
  equipped: boolean;
  tier: number;
  /** How many items it carries out, the share of the price it sells for, and its speed factor. */
  capacity: number;
  saleRate: number;
  speed: number;
  abilities: Array<'scavenger' | 'swift'>;
  /** The trip it is on, if any. `endsAt` is when it is back (ms since epoch). */
  trip: {
    phase: 'out' | 'back';
    city: string;
    items: number;
    buying: number;
    arriveAt: number;
    endsAt: number;
  } | null;
  /** Goods it brought back that wait for room in the shared bag. */
  waiting: ItemInfo[];
}

export interface PetShopInfo {
  city: { id: string; name: string };
  stock: ShopEntry[];
  /** One way, in minutes of game time (ticks), for the quote. */
  ticks: number;
  /** How long a tick is, in ms, so the client can show a duration. */
  tickMs: number;
}

export interface WorldInfo {
  id: string;
  width: number;
  height: number;
  terrain: string[];
  /** Parallel to `terrain`: 'none', 'road', 'ford', 'bridge' or 'pass'. */
  overlay: string[];
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
