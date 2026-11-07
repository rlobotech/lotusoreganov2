import { shopItem } from './loot.ts';
import { xpToNext } from './progression.ts';
import type {
  CaravanKind,
  EncounterDef,
  QuestDef,
  Rarity,
  ShopItem,
  SiteDef,
  ZoneDef,
} from './types.ts';

/**
 * The high-level lands south of the Ashen Hills: five regions that carry the party from level 21 to
 * level 100. Everything here is generated from one table (`TIERS`) so the regions share a shape:
 * a city with a shop, a normal dungeon, a boss dungeon that unlocks the next region, three wild
 * encounters and a chain of quests. Terrain is generated deterministically (no random state), with a
 * road down column 3 and carved paths to every site, so every site is always reachable.
 */

export interface Tier {
  id: string;
  name: string;
  minLevel: number;
  maxLevel: number;
  city: string;
  dungeon: string;
  bossDungeon: string;
  /** Terrain characters picked at random for the region (see MAP legend in starter-world.ts). */
  palette: string;
  arena: string;
  /** Front-line, second and third monster of the region, its boss and the boss's court. */
  monsters: [string, string, string];
  boss: string;
  /** A last boss behind the first one (the final region only). */
  finalBoss?: string;
  /** Caravan accessory tiers the region's city sells (inclusive). */
  tiers: [number, number];
  /** What the boss quest gives besides gold and experience. */
  reward: { base: string; rarity: Rarity; caravan: { kind: CaravanKind; tier: number } };
}

export const TIERS: Tier[] = [
  {
    id: 'mirewood_fen',
    tiers: [3, 3],
    name: 'Mirewood Fen',
    minLevel: 21,
    maxLevel: 35,
    city: 'Reedhollow',
    dungeon: 'Sunken Barrow',
    bossDungeon: "Hag's Hollow",
    palette: 'sssff.s~h',
    arena: 'fen',
    monsters: ['bog_lurker', 'fen_witch', 'fen_wisp'],
    boss: 'bog_hag',
    reward: { base: 'Iron Mail', rarity: 'rare', caravan: { kind: 'mount', tier: 3 } },
  },
  {
    id: 'frostpeak_reach',
    tiers: [3, 4],
    name: 'Frostpeak Reach',
    minLevel: 36,
    maxLevel: 50,
    city: 'Rimewatch',
    dungeon: 'Glacier Caves',
    bossDungeon: 'Frostgiant Keep',
    palette: 'hhmm..h~f',
    arena: 'ice',
    monsters: ['ice_golem', 'frost_wolf', 'frost_archer'],
    boss: 'frost_giant',
    reward: { base: 'War Hammer', rarity: 'rare', caravan: { kind: 'tent', tier: 4 } },
  },
  {
    id: 'scorched_wastes',
    tiers: [4, 4],
    name: 'Scorched Wastes',
    minLevel: 51,
    maxLevel: 65,
    city: 'Cinderport',
    dungeon: 'Buried Temple',
    bossDungeon: 'Drake Roost',
    palette: '..hh.mm..~',
    arena: 'dunes',
    monsters: ['sand_scorpion', 'dune_raider', 'flame_elemental'],
    boss: 'ash_drake',
    reward: { base: 'Iron Axe', rarity: 'epic', caravan: { kind: 'pet', tier: 4 } },
  },
  {
    id: 'shadowmarch',
    tiers: [4, 5],
    name: 'Shadowmarch',
    minLevel: 66,
    maxLevel: 80,
    city: 'Gloamgate',
    dungeon: 'Haunted Bastion',
    bossDungeon: 'Throne of Dust',
    palette: 'ffsh.m~s.',
    arena: 'crypt',
    monsters: ['bone_knight', 'shade_archer', 'shadow_wraith'],
    boss: 'death_knight',
    reward: { base: 'Cloth Robe', rarity: 'epic', caravan: { kind: 'bag', tier: 4 } },
  },
  {
    id: 'the_spire',
    tiers: [5, 5],
    name: 'The Spire',
    minLevel: 81,
    maxLevel: 100,
    city: 'Skyhold',
    dungeon: 'Crystal Halls',
    bossDungeon: 'The Eternal Spire',
    palette: 'hmmh..~h.',
    arena: 'spire',
    monsters: ['arcane_construct', 'void_stalker', 'spire_seraph'],
    boss: 'void_lord',
    finalBoss: 'the_eternal',
    reward: { base: 'Spell Tome', rarity: 'epic', caravan: { kind: 'mount', tier: 5 } },
  },
];

/** Rows of the map each region takes. */
export const TIER_ROWS = 10;
/** Column of the road that links the regions. */
const ROAD_COL = 3;
const WIDTH = 14;

/** Where a region's sites are, relative to its first row. */
const CITY_AT = { col: ROAD_COL, row: 1 };
const DUNGEON_AT = { col: 7, row: 4 };
const BOSS_AT = { col: 10, row: 7 };

/** A small deterministic generator (no shared state), so the map is the same every time. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** The terrain rows of every region, to append to the starter map (which ends on a road). */
export function highMapRows(): string[] {
  const rows: string[] = [];
  TIERS.forEach((tier, k) => {
    const rnd = lcg(7919 * (k + 3));
    const grid: string[][] = Array.from({ length: TIER_ROWS }, () =>
      Array.from({ length: WIDTH }, () => tier.palette[Math.floor(rnd() * tier.palette.length)]!),
    );
    for (const row of grid) row[ROAD_COL] = 'R';
    // Paths from the road to the dungeons, so no site ever sits in a pocket.
    for (const at of [DUNGEON_AT, BOSS_AT]) {
      for (let c = ROAD_COL + 1; c <= at.col; c++) grid[at.row]![c] = '.';
    }
    for (const row of grid) rows.push(row.join(''));
  });
  return rows;
}

const baseRow = (k: number) => 10 + k * TIER_ROWS;

/** Which region a map row belongs to (rows from 10 on), or -1. */
export const tierOfRow = (row: number): number =>
  row < 10 ? -1 : Math.floor((row - 10) / TIER_ROWS);

const SHOP_BASES = [
  'Rusty Sword',
  'Iron Axe',
  'Oak Mace',
  'Short Bow',
  'Gnarled Staff',
  'War Hammer',
  'Wooden Shield',
  'Spell Tome',
  'Leather Cap',
  'Cloth Hood',
  'Padded Vest',
  'Iron Mail',
  'Cloth Robe',
  'Worn Boots',
  'Copper Ring',
  'Bone Charm',
];

function shopFor(level: number): ShopItem[] {
  return SHOP_BASES.map((name, i) => shopItem(name, level, i % 3 === 0 ? 'rare' : 'uncommon'));
}

const enc = (
  id: string,
  name: string,
  arena: string,
  monsters: EncounterDef['monsters'],
  weight = 1,
): EncounterDef => ({ id, name, arena, monsters, weight });

export interface HighContent {
  zones: Record<string, ZoneDef>;
  sites: Record<string, SiteDef>;
  quests: Record<string, QuestDef>;
}

/**
 * Zones, sites and quests of the high-level regions. `unlockedBy` is the site whose clearing opens
 * the first region, and `previousQuest` the quest that comes before the first welcome quest.
 */
export function highContent(unlockedBy: string, previousQuest: string): HighContent {
  const zones: Record<string, ZoneDef> = {};
  const sites: Record<string, SiteDef> = {};
  const quests: Record<string, QuestDef> = {};
  let openedBy = unlockedBy;
  let before = previousQuest;

  TIERS.forEach((t, k) => {
    const [m1, m2, m3] = t.monsters;
    const r0 = baseRow(k);
    const packA = enc(
      `${t.id}_vanguard`,
      `${t.name} vanguard`,
      t.arena,
      [
        { template: m1, min: 1, max: 2 },
        { template: m3, min: 1, max: 1 },
      ],
      3,
    );
    const packB = enc(
      `${t.id}_pack`,
      `${t.name} pack`,
      t.arena,
      [{ template: m2, min: 2, max: 3 }],
      2,
    );
    const packC = enc(
      `${t.id}_mixed`,
      `${t.name} warband`,
      t.arena,
      [
        { template: m1, min: 1, max: 1 },
        { template: m2, min: 1, max: 1 },
        { template: m3, min: 1, max: 1 },
      ],
      2,
    );
    const court = enc(`${t.id}_court`, `The ${nameOf(t.boss)}`, t.arena, [
      { template: t.boss, min: 1, max: 1 },
      { template: m1, min: 1, max: 2 },
      { template: m3, min: 1, max: 1 },
    ]);
    zones[t.id] = {
      id: t.id,
      name: t.name,
      minLevel: t.minLevel,
      maxLevel: t.maxLevel,
      encounters: [packA, packB, packC],
      unlockedBy: openedBy,
    };

    const dungeonLevel = t.minLevel + 4;
    const bossLevel = t.maxLevel - 2;
    const cityId = `${t.id}_city`;
    const dungeonId = `${t.id}_dungeon`;
    const bossId = `${t.id}_boss`;

    sites[cityId] = {
      id: cityId,
      name: t.city,
      kind: 'city',
      col: CITY_AT.col,
      row: r0 + CITY_AT.row,
      shop: shopFor(Math.round((t.minLevel + t.maxLevel) / 2)),
      stock: { level: Math.round((t.minLevel + t.maxLevel) / 2), tiers: t.tiers },
    };
    sites[dungeonId] = {
      id: dungeonId,
      name: t.dungeon,
      kind: 'dungeon',
      col: DUNGEON_AT.col,
      row: r0 + DUNGEON_AT.row,
      dungeon: {
        level: dungeonLevel,
        restPolicy: 'limited',
        restLimit: 1,
        rewardGold: dungeonLevel * 25,
        rewardXp: Math.round(xpToNext(dungeonLevel) * 0.35),
        stages: [
          { name: 'Outer passage', encounter: packA, levelOffset: 0 },
          { name: 'Deep tunnels', encounter: packB, levelOffset: 1 },
          { name: 'Warden chamber', encounter: packC, levelOffset: 2, boss: true },
        ],
      },
    };
    const bossStages = [
      { name: 'Gatehouse', encounter: packA, levelOffset: 0 },
      { name: 'Barracks', encounter: packC, levelOffset: 1 },
      { name: 'Inner sanctum', encounter: packB, levelOffset: 1 },
      { name: `${nameOf(t.boss)}'s lair`, encounter: court, levelOffset: 2, boss: true },
    ];
    if (t.finalBoss) {
      bossStages.push({
        name: `${nameOf(t.finalBoss)}'s throne`,
        encounter: enc(`${t.id}_final`, `The ${nameOf(t.finalBoss)}`, t.arena, [
          { template: t.finalBoss, min: 1, max: 1 },
          { template: m2, min: 1, max: 2 },
        ]),
        levelOffset: 3,
        boss: true,
      });
    }
    sites[bossId] = {
      id: bossId,
      name: t.bossDungeon,
      kind: 'boss_dungeon',
      col: BOSS_AT.col,
      row: r0 + BOSS_AT.row,
      requiresQuest: `${t.id}_boss`,
      dungeon: {
        level: bossLevel,
        restPolicy: 'limited',
        restLimit: 2,
        rewardGold: bossLevel * 50,
        rewardXp: Math.round(xpToNext(bossLevel) * 0.8),
        stages: bossStages,
      },
    };

    const xp = (f: number) => Math.round(xpToNext(t.minLevel) * f);
    const welcome = `${t.id}_welcome`;
    const hunt = `${t.id}_hunt`;
    const delve = `${t.id}_delve`;
    quests[welcome] = {
      id: welcome,
      name: `Welcome to ${t.city}`,
      description: `Travel to ${t.city}, the last safe roof before the wilds of ${t.name}.`,
      minLevel: t.minLevel,
      requires: [before],
      objectives: [{ type: 'visit', siteId: cityId }],
      reward: { gold: t.minLevel * 20, xp: xp(0.3) },
    };
    quests[hunt] = {
      id: hunt,
      name: `Cull the ${nameOf(m1)}s`,
      description: `${nameOf(m1)}s hold the roads of ${t.name}. Thin them out.`,
      minLevel: t.minLevel,
      requires: [welcome],
      objectives: [{ type: 'kill', template: m1, count: 12 }],
      reward: { gold: t.minLevel * 30, xp: xp(0.6) },
    };
    quests[delve] = {
      id: delve,
      name: `Into the ${t.dungeon}`,
      description: `Clear the ${t.dungeon} and report what lives there.`,
      minLevel: t.minLevel + 2,
      requires: [welcome],
      objectives: [{ type: 'clear', siteId: dungeonId }],
      reward: {
        gold: t.minLevel * 40,
        xp: xp(0.9),
        item: {
          base: SHOP_BASES[k % SHOP_BASES.length]!,
          itemLevel: t.minLevel + 4,
          rarity: 'rare',
        },
      },
    };
    quests[bossId] = {
      id: bossId,
      name: t.finalBoss ? `The end of ${nameOf(t.finalBoss)}` : `Slay the ${nameOf(t.boss)}`,
      description: `Take ${t.bossDungeon} and the way onward opens.`,
      minLevel: t.maxLevel - 6,
      requires: [hunt, delve],
      objectives: [{ type: 'clear', siteId: bossId }],
      reward: {
        gold: t.maxLevel * 60,
        xp: xp(2),
        item: { base: t.reward.base, itemLevel: t.maxLevel, rarity: t.reward.rarity },
        caravan: t.reward.caravan,
      },
    };

    openedBy = bossId;
    before = bossId;
  });

  return { zones, sites, quests };
}

function nameOf(template: string): string {
  return template
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
