import { shopItem } from './loot.ts';
import { xpToNext } from './progression.ts';
import type {
  CaravanKind,
  EncounterDef,
  QuestDef,
  Rarity,
  ShopItem,
  SiteDef,
  Terrain,
  ZoneDef,
} from './types.ts';

/**
 * The regions of the continent from the Southern Fen on, which carry the party from level 21 to
 * level 100. Everything here is generated from one table (`TIERS`) so the regions share a shape:
 * a city with a shop, a normal dungeon, a boss dungeon that unlocks the next region, three wild
 * encounters and a chain of quests. Where things stand comes from the map (see layout.ts): the
 * city and dungeon inside the region, and the boss dungeon on the pass that leads to the next one.
 * Tier ids are the ids of the regions on the map (world-map-data.ts).
 */

export interface Tier {
  /** The id of the region on the map. */
  id: string;
  name: string;
  minLevel: number;
  maxLevel: number;
  city: string;
  dungeon: string;
  bossDungeon: string;
  arena: string;
  /** The ground the region's pack (its second monster) lives on; the other encounters roam. */
  lairs: Terrain[];
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

/** In the order the regions open up (the order of the map's zones, after Greenwood and the East Moors). */
export const TIERS: Tier[] = [
  {
    id: 'southern_fen',
    lairs: ['swamp', 'forest'],
    tiers: [3, 3],
    name: 'Southern Fen',
    minLevel: 21,
    maxLevel: 35,
    city: 'Reedhollow',
    dungeon: 'Sunken Barrow',
    bossDungeon: "Hag's Hollow",
    arena: 'fen',
    monsters: ['bog_lurker', 'fen_witch', 'fen_wisp'],
    boss: 'bog_hag',
    reward: { base: 'Iron Mail', rarity: 'rare', caravan: { kind: 'mount', tier: 3 } },
  },
  {
    id: 'northern_woods',
    lairs: ['forest'],
    tiers: [3, 4],
    name: 'Northern Woods',
    minLevel: 36,
    maxLevel: 45,
    city: 'Thornwick',
    dungeon: 'Hollow Oak',
    bossDungeon: "Elder's Grove",
    arena: 'forest',
    monsters: ['dire_wolf', 'treant', 'forest_stalker'],
    boss: 'elder_treant',
    reward: { base: 'Short Bow', rarity: 'rare', caravan: { kind: 'pet', tier: 3 } },
  },
  {
    id: 'western_highlands',
    lairs: ['hills', 'plains'],
    tiers: [4, 4],
    name: 'Western Highlands',
    minLevel: 46,
    maxLevel: 55,
    city: 'Crag Hold',
    dungeon: 'Eagle Caves',
    bossDungeon: "Guardian's Gate",
    arena: 'spire',
    monsters: ['stone_gargoyle', 'rock_golem', 'storm_caller'],
    boss: 'ancient_guardian',
    reward: { base: 'Wooden Shield', rarity: 'rare', caravan: { kind: 'bag', tier: 3 } },
  },
  {
    id: 'frozen_north',
    lairs: ['snow', 'ice'],
    tiers: [4, 4],
    name: 'Frozen North',
    minLevel: 56,
    maxLevel: 65,
    city: 'Rimewatch',
    dungeon: 'Glacier Caves',
    bossDungeon: 'Frostgiant Keep',
    arena: 'ice',
    monsters: ['ice_golem', 'frost_wolf', 'frost_archer'],
    boss: 'frost_giant',
    reward: { base: 'War Hammer', rarity: 'rare', caravan: { kind: 'tent', tier: 4 } },
  },
  {
    id: 'sand_wastes',
    lairs: ['desert', 'savanna'],
    tiers: [4, 5],
    name: 'Sand Wastes',
    minLevel: 66,
    maxLevel: 75,
    city: 'Dustport',
    dungeon: 'Buried Temple',
    bossDungeon: "Warden's Citadel",
    arena: 'dunes',
    monsters: ['sand_scorpion', 'dune_raider', 'dust_mage'],
    boss: 'sand_warden',
    reward: { base: 'Iron Axe', rarity: 'epic', caravan: { kind: 'pet', tier: 4 } },
  },
  {
    id: 'southwest_coast',
    lairs: ['forest', 'swamp'],
    tiers: [5, 5],
    name: 'Southwest Coast',
    minLevel: 76,
    maxLevel: 85,
    city: 'Gloamgate',
    dungeon: 'Haunted Bastion',
    bossDungeon: 'Throne of Dust',
    arena: 'crypt',
    monsters: ['bone_knight', 'shade_archer', 'shadow_wraith'],
    boss: 'death_knight',
    reward: { base: 'Cloth Robe', rarity: 'epic', caravan: { kind: 'bag', tier: 4 } },
  },
  {
    id: 'ashen_volcano',
    lairs: ['ashlands', 'hills'],
    tiers: [5, 5],
    name: 'Ashen Volcano',
    minLevel: 86,
    maxLevel: 100,
    city: 'Cinderhold',
    dungeon: 'Magma Halls',
    bossDungeon: "The Dragon's Maw",
    arena: 'dunes',
    monsters: ['magma_hound', 'cinder_knight', 'flame_elemental'],
    boss: 'ash_drake',
    finalBoss: 'dragon_wyrm',
    reward: { base: 'Spell Tome', rarity: 'epic', caravan: { kind: 'mount', tier: 5 } },
  },
];

/** Where a tier's sites stand on the map. */
export interface TierPlace {
  city: { col: number; row: number };
  dungeon: { col: number; row: number };
  /** The boss dungeon, on the pass that leads on to the next region. */
  boss: { col: number; row: number };
}

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
export function highContent(
  unlockedBy: string,
  previousQuest: string,
  place: (tierId: string) => TierPlace,
): HighContent {
  const zones: Record<string, ZoneDef> = {};
  const sites: Record<string, SiteDef> = {};
  const quests: Record<string, QuestDef> = {};
  let openedBy = unlockedBy;
  let before = previousQuest;

  TIERS.forEach((t, k) => {
    const [m1, m2, m3] = t.monsters;
    const at = place(t.id);
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
    packB.biomes = t.lairs;
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
    // The boss and a small court (one front-liner and one caster or archer).
    const court = enc(`${t.id}_court`, `The ${nameOf(t.boss)}`, t.arena, [
      { template: t.boss, min: 1, max: 1 },
      { template: m1, min: 1, max: 1 },
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
      col: at.city.col,
      row: at.city.row,
      shop: shopFor(Math.round((t.minLevel + t.maxLevel) / 2)),
      stock: { level: Math.round((t.minLevel + t.maxLevel) / 2), tiers: t.tiers },
    };
    sites[dungeonId] = {
      id: dungeonId,
      name: t.dungeon,
      kind: 'dungeon',
      col: at.dungeon.col,
      row: at.dungeon.row,
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
      col: at.boss.col,
      row: at.boss.row,
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
