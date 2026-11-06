import { shopItem } from './loot.ts';
import type { EncounterDef, SiteDef, Terrain, WorldDef, ZoneDef } from './types.ts';

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
    maxLevel: 10,
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
};
