import { shopItem } from './loot.ts';
import type { EncounterDef, QuestDef, SiteDef, Terrain, WorldDef, ZoneDef } from './types.ts';

// r = road, . = plains, f = forest, h = hills, s = swamp, m = mountain, ~ = water
const MAP = [
  'mmmhh.ffff~~~~',
  'mmhh..fRfffh~~',
  'mh..ffRR.ffhh~',
  'h..fRRf..fhhhm',
  '.ff.R.ff..hhmm',
  '..f.RR....hhmm',
  '...fRf.sshhhmm',
  '..RRf..ssh.mmm',
  '.f.R..sssh.mmm',
  'ffRR.ss.hh.mmm',
];

const TERRAIN_CODES: Record<string, Terrain> = {
  R: 'road',
  '.': 'plains',
  f: 'forest',
  h: 'hills',
  s: 'swamp',
  m: 'mountain',
  '~': 'water',
};

const WIDTH = MAP[0]!.length;
const HEIGHT = MAP.length;

// Columns 0-7 are Greenwood, 8-13 are the Ashen Hills (closed until the Goblin King falls).
const zoneOf = MAP.flatMap((row) =>
  [...row].map((_, col) => (col < 8 ? 'greenwood' : 'ashen_hills')),
);

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

const zones: Record<string, ZoneDef> = {
  greenwood: {
    id: 'greenwood',
    name: 'Greenwood',
    minLevel: 1,
    maxLevel: 5,
    encounters: [goblinPack, wolfPack],
  },
  ashen_hills: {
    id: 'ashen_hills',
    name: 'Ashen Hills',
    minLevel: 6,
    maxLevel: 100,
    encounters: [orcPatrol, boneWalkers, wolfPack],
    unlockedBy: 'goblin_keep',
  },
};

const sites: Record<string, SiteDef> = {
  oakhaven: {
    id: 'oakhaven',
    name: 'Oakhaven',
    kind: 'city',
    col: 4,
    row: 5,
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
    col: 2,
    row: 2,
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
    col: 7,
    row: 3,
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
    col: 9,
    row: 4,
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
    col: 10,
    row: 7,
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
    description: 'Orc brutes are raiding caravans in the Ashen Hills.',
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
  id: 'starter',
  width: WIDTH,
  height: HEIGHT,
  terrain: MAP.flatMap((row) =>
    [...row].map((c) => {
      const t = TERRAIN_CODES[c];
      if (!t) throw new Error(`Unknown terrain code ${c}`);
      return t;
    }),
  ),
  zoneOf,
  zones,
  sites,
  startCity: 'oakhaven',
  quests,
};
