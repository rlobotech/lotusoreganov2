import { CONTINENT } from './continent.ts';
import { highContent, TIERS } from './high-world.ts';
import { Layout } from './layout.ts';
import { shopItem } from './loot.ts';
import type { EncounterDef, QuestDef, SiteDef, WorldDef, ZoneDef } from './types.ts';
import { mapCells } from './world-map.ts';

// The land, the regions and where the gates are come from the continent map (world-map-data.ts).
const { terrain, overlay } = mapCells(CONTINENT);
const WIDTH = CONTINENT.width;
const HEIGHT = CONTINENT.height;

// Every hex belongs to a region; the sea (region 0) is counted with the first region, which is
// never locked, so the sea is never shown as closed.
const zoneIdOf = new Map(CONTINENT.zones.map((z) => [z.char, z.id]));
const zoneOf = CONTINENT.regions.flatMap((row) =>
  [...row].map((ch) => zoneIdOf.get(ch) ?? CONTINENT.zones[0]!.id),
);

// Where the places stand, in a fixed order so the layout is always the same.
const layout = new Layout();
const start = layout.startCity();
const places = new Map<
  string,
  {
    city: ReturnType<Layout['city']>;
    dungeon: ReturnType<Layout['city']>;
    boss: ReturnType<Layout['city']>;
  }
>();
const warren = layout.far('greenwood', [start]);
const keep = layout.guard('east_moors');
const stonebridgeAt = layout.city('east_moors');
const crypt = layout.far('east_moors', [stonebridgeAt]);
const order = TIERS.map((t) => t.id);
for (const [k, t] of TIERS.entries()) {
  const city = layout.city(t.id);
  const dungeon = layout.far(t.id, [city]);
  // The boss of a region stands on the pass into the next one (the last one lairs in its region).
  const next = order[k + 1];
  const boss = next ? layout.guard(next) : layout.far(t.id, [city, dungeon]);
  places.set(t.id, { city, dungeon, boss });
}

const enc = (e: Omit<EncounterDef, 'weight'> & { weight?: number }): EncounterDef => ({
  weight: 1,
  ...e,
});

const goblinPack = enc({
  id: 'goblin_pack',
  name: 'Goblin pack',
  arena: 'clearing',
  monsters: [
    { template: 'goblin', min: 2, max: 3 },
    { template: 'goblin_archer', min: 1, max: 1 },
  ],
  weight: 3,
});
const wolfPack = enc({
  id: 'wolf_pack',
  name: 'Wolf pack',
  arena: 'forest',
  monsters: [{ template: 'wolf', min: 3, max: 4 }],
  weight: 2,
});
const orcPatrol = enc({
  id: 'orc_patrol',
  name: 'Orc patrol',
  arena: 'clearing',
  monsters: [
    { template: 'orc_brute', min: 1, max: 2 },
    { template: 'goblin', min: 1, max: 2 },
  ],
  weight: 3,
});
const boneWalkers = enc({
  id: 'bone_walkers',
  name: 'Bone walkers',
  arena: 'crypt',
  monsters: [{ template: 'skeleton', min: 3, max: 4 }],
  weight: 2,
});
const keepGuards = enc({
  id: 'keep_guards',
  name: 'Keep guards',
  arena: 'keep',
  monsters: [
    { template: 'goblin', min: 2, max: 3 },
    { template: 'orc_brute', min: 1, max: 1 },
  ],
});
const kingsCourt = enc({
  id: 'kings_court',
  name: 'The Goblin King',
  arena: 'keep',
  monsters: [
    { template: 'goblin_king', min: 1, max: 1 },
    { template: 'goblin', min: 2, max: 2 },
    { template: 'goblin_archer', min: 1, max: 1 },
  ],
});
const lichCourt = enc({
  id: 'lich_court',
  name: 'The Bone Lich',
  arena: 'crypt',
  monsters: [
    { template: 'bone_lich', min: 1, max: 1 },
    { template: 'skeleton', min: 3, max: 3 },
  ],
});

// The Fen opens when the Old Crypt is cleared; each region after it opens with the last boss.
const high = highContent('old_crypt', 'into_the_crypt', (id) => places.get(id)!);

const zones: Record<string, ZoneDef> = {
  greenwood: {
    id: 'greenwood',
    name: 'Greenwood',
    minLevel: 1,
    maxLevel: 5,
    encounters: [goblinPack, wolfPack],
  },
  east_moors: {
    id: 'east_moors',
    name: 'East Moors',
    minLevel: 6,
    maxLevel: 20,
    encounters: [orcPatrol, boneWalkers, wolfPack],
    unlockedBy: 'goblin_keep',
  },
};

const sites: Record<string, SiteDef> = {
  oakhaven: {
    id: 'oakhaven',
    name: 'Oakhaven',
    kind: 'city',
    col: start.col,
    row: start.row,
    stock: { level: 3, tiers: [1, 2] },
    shop: [
      shopItem('Rusty Sword', 2, 'common'),
      shopItem('Iron Dagger', 2, 'common'),
      shopItem('Short Bow', 2, 'common'),
      shopItem('Gnarled Staff', 2, 'common'),
      shopItem('Wooden Shield', 2, 'common'),
      shopItem('Leather Cap', 2, 'common'),
      shopItem('Padded Vest', 3, 'uncommon'),
      shopItem('Cloth Robe', 3, 'uncommon'),
      shopItem('Worn Boots', 3, 'uncommon'),
      shopItem('Spell Tome', 3, 'uncommon'),
      shopItem('Copper Ring', 4, 'uncommon'),
      shopItem('Bone Charm', 4, 'uncommon'),
    ],
  },
  goblin_warren: {
    id: 'goblin_warren',
    name: 'Goblin Warren',
    kind: 'dungeon',
    col: warren.col,
    row: warren.row,
    dungeon: {
      level: 3,
      restPolicy: 'limited',
      restLimit: 1,
      rewardGold: 80,
      rewardXp: 150,
      stages: [
        { name: 'Entrance tunnel', encounter: goblinPack, levelOffset: 0 },
        { name: 'Wolf den', encounter: wolfPack, levelOffset: 0 },
        { name: 'Chieftain hall', encounter: keepGuards, levelOffset: 1, boss: true },
      ],
    },
  },
  goblin_keep: {
    id: 'goblin_keep',
    name: "Goblin King's Keep",
    kind: 'boss_dungeon',
    col: keep.col,
    row: keep.row,
    requiresQuest: 'goblin_king',
    dungeon: {
      level: 5,
      restPolicy: 'limited',
      restLimit: 2,
      rewardGold: 250,
      rewardXp: 800,
      stages: [
        { name: 'Gatehouse', encounter: goblinPack, levelOffset: 0 },
        { name: 'Barracks', encounter: keepGuards, levelOffset: 0 },
        { name: 'Throne approach', encounter: wolfPack, levelOffset: 1 },
        { name: 'Throne room', encounter: kingsCourt, levelOffset: 1, boss: true },
      ],
    },
  },
  stonebridge: {
    id: 'stonebridge',
    name: 'Stonebridge',
    kind: 'city',
    col: stonebridgeAt.col,
    row: stonebridgeAt.row,
    stock: { level: 9, tiers: [2, 3] },
    shop: [
      shopItem('Rusty Sword', 7, 'uncommon'),
      shopItem('Short Bow', 7, 'uncommon'),
      shopItem('Gnarled Staff', 7, 'uncommon'),
      shopItem('Wooden Shield', 7, 'uncommon'),
      shopItem('Leather Cap', 7, 'uncommon'),
      shopItem('Padded Vest', 8, 'uncommon'),
      shopItem('Cloth Robe', 8, 'uncommon'),
      shopItem('Worn Boots', 8, 'uncommon'),
      shopItem('Copper Ring', 9, 'rare'),
      shopItem('Bone Charm', 9, 'rare'),
    ],
  },
  old_crypt: {
    id: 'old_crypt',
    name: 'Old Crypt',
    kind: 'dungeon',
    col: crypt.col,
    row: crypt.row,
    dungeon: {
      level: 8,
      restPolicy: 'none',
      rewardGold: 300,
      rewardXp: 1200,
      stages: [
        { name: 'Ossuary', encounter: boneWalkers, levelOffset: 0 },
        { name: 'Catacombs', encounter: boneWalkers, levelOffset: 1 },
        { name: 'Lich vault', encounter: lichCourt, levelOffset: 1, boss: true },
      ],
    },
  },
};

const quests: Record<string, QuestDef> = {
  pest_control: {
    id: 'pest_control',
    name: 'Pest control',
    description: 'Goblins are raiding the farms around Oakhaven. Thin their numbers.',
    minLevel: 1,
    objectives: [{ type: 'kill', template: 'goblin', count: 8 }],
    reward: { gold: 60, xp: 160, caravan: { kind: 'pet', tier: 1 } },
  },
  wolves_at_the_door: {
    id: 'wolves_at_the_door',
    name: 'Wolves at the door',
    description: 'A wolf pack has been stalking travellers on the Greenwood roads.',
    minLevel: 1,
    objectives: [{ type: 'kill', template: 'wolf', count: 6 }],
    reward: { gold: 70, xp: 200, item: { base: 'Leather Cap', itemLevel: 3, rarity: 'uncommon' } },
  },
  scout_the_warren: {
    id: 'scout_the_warren',
    name: 'Scout the warren',
    description: 'Find the Goblin Warren and see what is in there.',
    minLevel: 2,
    objectives: [{ type: 'visit', siteId: 'goblin_warren' }],
    reward: { gold: 30, xp: 120 },
  },
  clear_the_warren: {
    id: 'clear_the_warren',
    name: 'Clear the Goblin Warren',
    description: 'Fight through the warren and break the chieftain.',
    minLevel: 3,
    requires: ['scout_the_warren'],
    objectives: [{ type: 'clear', siteId: 'goblin_warren' }],
    reward: { gold: 120, xp: 300, item: { base: 'Iron Dagger', itemLevel: 4, rarity: 'uncommon' } },
  },
  archers_toll: {
    id: 'archers_toll',
    name: "Archers' toll",
    description: 'Goblin archers pick off anyone on the east road. Silence them.',
    minLevel: 3,
    objectives: [{ type: 'kill', template: 'goblin_archer', count: 6 }],
    reward: { gold: 90, xp: 260, caravan: { kind: 'bag', tier: 1 } },
  },
  goblin_king: {
    id: 'goblin_king',
    name: 'The Goblin King',
    description:
      'The Goblin King rules from his keep. End his reign and the road to the Ashen Hills opens.',
    minLevel: 5,
    requires: ['clear_the_warren'],
    objectives: [{ type: 'clear', siteId: 'goblin_keep' }],
    reward: {
      gold: 300,
      xp: 900,
      item: { base: 'Bone Charm', itemLevel: 6, rarity: 'rare' },
      caravan: { kind: 'mount', tier: 2 },
    },
  },
  welcome_to_stonebridge: {
    id: 'welcome_to_stonebridge',
    name: 'Welcome to Stonebridge',
    description: 'With the keep fallen, travel to Stonebridge and meet the people of the hills.',
    minLevel: 6,
    requires: ['goblin_king'],
    objectives: [{ type: 'visit', siteId: 'stonebridge' }],
    reward: { gold: 80, xp: 300 },
  },
  orc_menace: {
    id: 'orc_menace',
    name: 'Orc menace',
    description: 'Orc brutes are raiding caravans in the East Moors.',
    minLevel: 6,
    requires: ['goblin_king'],
    objectives: [{ type: 'kill', template: 'orc_brute', count: 8 }],
    reward: { gold: 200, xp: 650 },
  },
  restless_dead: {
    id: 'restless_dead',
    name: 'Restless dead',
    description: 'The dead are walking near the old crypt. Put them back to rest.',
    minLevel: 7,
    requires: ['goblin_king'],
    objectives: [{ type: 'kill', template: 'skeleton', count: 10 }],
    reward: { gold: 220, xp: 750 },
  },
  into_the_crypt: {
    id: 'into_the_crypt',
    name: 'Into the crypt',
    description:
      'Descend into the Old Crypt and destroy whatever commands the dead. There is no rest down there.',
    minLevel: 8,
    requires: ['restless_dead'],
    objectives: [{ type: 'clear', siteId: 'old_crypt' }],
    reward: {
      gold: 400,
      xp: 1500,
      item: { base: 'Spell Tome', itemLevel: 9, rarity: 'epic' },
      caravan: { kind: 'tent', tier: 3 },
    },
  },
  goblin_bounty: {
    id: 'goblin_bounty',
    name: 'Goblin bounty',
    description: 'A standing bounty on goblins. Hand in as many as you like.',
    minLevel: 1,
    objectives: [{ type: 'kill', template: 'goblin', count: 10 }],
    reward: { gold: 50, xp: 120 },
    repeatable: true,
  },
};

export const STARTER_WORLD: WorldDef = {
  id: 'continent',
  width: WIDTH,
  height: HEIGHT,
  terrain,
  overlay,
  zoneOf,
  zones: { ...zones, ...high.zones },
  sites: { ...sites, ...high.sites },
  startCity: 'oakhaven',
  quests: { ...quests, ...high.quests },
};
