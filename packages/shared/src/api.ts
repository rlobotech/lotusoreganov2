/** Response shapes of the game API, shared so the server and the web app cannot drift apart. */

export interface ItemInfo {
  id: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic';
  itemLevel: number;
  value: number;
  favorite: boolean;
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
}

export interface OrderInfo {
  id: string;
  kind: 'goto';
  siteId: string;
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
