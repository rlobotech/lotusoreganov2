# Tile Prompts: Arena (isometric) and World (hex)

## Where the game looks for the tiles

Battle floors are sheets in `apps/web/public/sprites/battle_tiles/<name>.png`, **4 by 4 tiles** (16 variations), each tile about 30 pixels wide with an isometric diamond top (about 15 to 16 pixels high) and a little thickness, tiles starting at x = 1, 34, 67, 100 and y = 5, 37, 70, 103. The scene scales a tile to the grid's 32 pixel width, picks a variation by position, and puts a plain grass colour under it so the seams stay green. `grass.png` is used for every arena for now; if the file is missing the floor is drawn in code. World (hex) tiles are not used yet: the map is drawn in code with flat biome colours.

32x32 tiles for the Pixel Lab "Tiles" tool. One generation (10 credits) makes a set of interchangeable variations of ONE material, which we pick between with the seeded RNG.

## Settings

### Arena tiles (combat grid)
- Tab: Tiles
- Tile shape: **Isometric**
- Tile size: 32px
- View angle: 45 (high top-down)
- Thickness: 0%
- Top/bottom pixels: 2px (classic)
- Outline mode: Outline (default)
- Color palette: AAP-64 for now, or paste a custom palette per biome (see "Palettes"). Max colours: No limit.
- Style tiles: upload up to 6 finished tiles from the first biome you like, so the other biomes match.

### World tiles (hex map)
- Tab: Tiles
- Tile shape: **Hex pointy-top** (rows offset by half a tile; matches the "odd-r" offset grid in the engine)
- Tile size: 32px
- View angle: 45 (high top-down)
- Thickness: 0%
- Everything else as above.

The description should name only the material and mood. Keep every biome dark-fantasy: muted, slightly desaturated, a little ominous.

## Arena tiles (isometric)
Paste one line per generation into Description.

| File name prefix | Description |
|---|---|
| `arena_grass` | mossy forest floor, dark green grass, small leaves and roots, muted dark fantasy |
| `arena_dirt` | packed dark brown dirt, pebbles, a few dry twigs |
| `arena_forest_deep` | dense dark forest undergrowth, ferns, fallen leaves, shadowed |
| `arena_stone` | weathered gray dungeon flagstones, cracks, moss in the gaps |
| `arena_crypt` | dark crypt floor, cracked bluish stone slabs, scattered bone dust |
| `arena_cave` | rough cave floor, dark rock, small crystals and rubble |
| `arena_swamp` | murky swamp ground, dark mud, shallow green water, reeds |
| `arena_snow` | trampled snow, pale blue shadows, dirty ice patches |
| `arena_sand` | desert sand, wind ripples, small cracked rocks |
| `arena_lava` | volcanic black rock with glowing orange cracks |
| `arena_cobble` | old town cobblestones, worn, mossy, dark wet look |
| `arena_wood` | dark wooden plank floor, worn boards, nails and stains |

Special arena tiles (separate generations, same settings):
- `arena_road`: dirt road with wheel ruts (works as a Paths-tab item too)
- `arena_water_shallow`: shallow dark water, ripples
- `arena_blood_altar`: boss arena center, stone with faint glowing runes

## World tiles (hex pointy-top)
Same format, hex shape. Each hex is one terrain, so describe it as a readable map symbol.

| File name prefix | Description |
|---|---|
| `world_plains` | open grassland with scattered tufts, muted green |
| `world_forest` | dense dark pine and oak forest canopy |
| `world_hills` | rolling grassy hills with a few rocks |
| `world_mountain` | jagged gray mountains with snow caps and shadows |
| `world_swamp` | dark bog with dead trees and green water |
| `world_desert` | sand dunes, dry, a few rocks |
| `world_snow` | snowy tundra with frozen pines |
| `world_lake` | dark deep water with small waves |
| `world_road` | dirt road crossing grassland |
| `world_ruins` | crumbled stone ruins in overgrown grass |
| `world_wasteland` | cracked gray earth, dead trees, volcanic glow in the distance |

Site markers (cities, dungeons, boss dungeons) are not flat tiles. They are small 32x32 object sprites drawn on top of a terrain hex: `site_city`, `site_dungeon`, `site_boss_dungeon`, `site_camp`. Make them with the same palette, using the Building tab if it fits, or as a Custom 32px object.

## Obstacles in combat
Blocked tiles and line-of-sight blockers are objects, not floor tiles: `obj_rock`, `obj_pillar`, `obj_tree`, `obj_wall`, `obj_barrel`, `obj_bones`. They are 32x32 (taller ones 32x48) with feet anchored at the tile's centre, like units.

## Palettes
- Quick start: AAP-64 for all tiles, so they work together.
- Better: pick one shared base palette of ~32 colours for tiles, units and VFX, then add a few biome colours (swamp green, lava orange, snow blue). The character palettes in `docs/art/characters_art.md` are per character, so units will not exactly match tiles; the final fix is a palette-remap pass in the asset pipeline.

## Where files go
Save generated PNGs under `assets/raw/tiles/arena/` and `assets/raw/tiles/world/`, using the file name prefixes above and a variation number (`arena_grass_01.png`, `arena_grass_02.png`, ...).
