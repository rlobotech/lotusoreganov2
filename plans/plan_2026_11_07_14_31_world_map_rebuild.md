# World map rebuild

Status: in progress (phases 1 to 3 done, phase 4 next)


Goal: replace the 14x60 strip with an organic continent of about 40x40 hexes, like the picture the user generated (kept as the reference): the starter city in the centre-right, an irregular coast, bosses guarding passes, regions that unlock in a winding order (east, then south, then north of that, then west of the start) instead of one line south.

### Decisions
- **Built by tracing the user's image:** a dev-only tool lays a 40x36 pointy-top hex grid over the map part of the picture, samples each hex's colour, and classifies it against the legend palette. A rules pass (coast, rivers, dense forest) and manual fixes follow; the result is saved as fixed text data (`world-map` file) and is checked by a validator. The tool needs an image library (Pillow or sharp) as a dev dependency only.
- **Geography and progression are separate:** geography is biomes, mountains, rivers and coast. Progression is which passes are guarded and which region each boss opens. Regions are sets of hexes (`zoneOf`); a locked region stays closed until its gate boss is cleared (the existing `unlockedBy` mechanism). Natural barriers (mountains, rivers) surround a region, with exactly one guarded pass.
- **Overlays sit on top of a biome, which stays:** roads, fords, bridges, passes and sites (cities, dungeons, fortresses) are an overlay layer; the hex keeps its biome (a road through a forest is still forest for climate and monster purposes). Roads cost less, bridges and fords make a river hex crossable, a pass makes a mountain hex crossable.
- **Crossings:** rivers have free fords and bridges (slower than land) so a river never locks an area. Mountains always keep at least one intentional pass; passes and the big bridges are where the bosses stand. Every region is reachable (no sealed pockets).
- **Biomes matter for play:** each biome has a travel cost, and wild encounters follow the biome the party stands on, inside the region's level band.
- **Lava is impassable; the ground next to it is "Ashlands"** (grey ash and cinder fields, passable, slow). The picture's lava hexes become impassable lava.
- **Zones:** the picture's seven bosses (Goblin King's Keep, Old Crypt, Frost Giant, Sand Warden, Ancient Guardian, Swamp Lord, Dragon Wyrm) are kept, plus extra zones where my seven regions do not already cover the picture. Level bands are re-spread over 1 to 100 in unlock order.
- **Saves:** the game is pre-release, so parties are reset again when the new map lands.

### Terrain table (colours from the user's feedback)
| Biome | Hex | Passable | Travel cost |
|---|---|---|---|
| Plains | #8DBB45 | yes | 1 |
| Savanna | #D9C36B | yes | 1 |
| Forest | #278044 | yes | 1.5 |
| Dense forest | #174D32 | no | - |
| Hills | #777B37 | yes | 1.5 |
| Swamp | #568D79 | yes | 2 |
| Desert | #E6B653 | yes | 1.8 |
| Snow | #B8D8F5 | yes | 2 |
| Ice | #E6F2FF | yes | 2.5 |
| Ashlands (new) | grey-brown | yes | 2 |
| Lava | #F15A24 | no | - |
| Mountains | #777783 | no (except a pass) | - |
| River | #49B9F2 | no (except ford or bridge) | ford 3, bridge 0.5 |
| Coast water / ocean | #07509B | no | - |
Overlays: road (x0.5 on any passable biome), ford, bridge, pass (a mountain hex made passable, cost 2). The mount's speed bonus applies on top.

### Climate rules the traced map must follow (the validator lists breaches as warnings)
North: snow, ice, frozen forest. South: warmer, ending in volcanic mountains, lava and ashlands. West of the big mountain ranges: drier (desert, savanna). Coasts: forests and wetlands. Lowlands: plains. River basins: swamps, fertile plains, forest.

### Phases (one at a time, each verified before the next)
1. **Terrain model and rules:** `Terrain` becomes the biome list above; a separate overlay layer; passability and travel cost from biome plus overlay (`hex.ts`); the renderer uses the new palette and draws roads, fords, bridges and passes over the biome; the current world is converted to the new model so everything keeps working. **Performance:** the path search is a plain O(n^2) Dijkstra, which would be too slow on 1,440 hexes when the hunting-spot search tries many targets, so it becomes a binary-heap search. Tests for cost and passability rules.
2. **Tracing tool and draft map:** the dev tool, a draft 40x36 map from the picture, the rules pass, the map file format (biome characters plus an overlay and site layer) and a tool to print or preview it.
3. **Validator and gates:** tests that every site is reachable once its gates are open, a closed region cannot be reached before its boss, each region's only entrance is one guarded pass or bridge, no hex is a sealed pocket, rivers have crossings, and climate lints. The map is fixed until it passes.
4. **Regions and content:** the zone table (regions, their level bands re-spread over 1 to 100 in unlock order, the extra zones, boss sites on passes, quests and the unlock chain), cities and dungeons placed on suitable biomes, shops and encounters, new monsters for the extra zones (Sand Warden, Ancient Guardian, Swamp Lord, Dragon Wyrm and so on) using the monster families, quest chain, and re-checked balance with the harness.
5. **Biome gameplay:** biome travel costs in the sim, encounters tagged by biome (weights inside the region), hunting-spot choice that respects biome and level, mount and tent interaction, balance run.
6. **Map view polish and reset:** colours and overlays, a minimap or whole-continent view, the camera following the party, locked regions shown as fog, and the migration (parties reset).

### Phase 1 notes (what exists now)
- `Terrain` is the 14 biomes of the table above; `Overlay` (`none`, `road`, `ford`, `bridge`, `pass`) is a parallel `overlay` array on `WorldDef` (and in `WorldInfo` for the client). A road keeps the biome underneath.
- `hex.ts`: `BIOME_COST`, `ROAD_FACTOR` (0.5), `CROSSING_COST` (ford 3, bridge 0.5, pass 2), `stepCost(biome, overlay)`, `costAt`, `overlayAt`. A crossing only opens its own biome (ford and bridge: river, pass: mountains); lava, dense forest and the sea never open. `findPath` is Dijkstra with a binary heap (same costs as the old search, checked against it in a test).
- The current 14x60 world is converted: map text has a legend (`MAP_CODES`), `R` is plains with a road; mountains are now impassable (everything stays connected, tested); the high regions use themed biomes (snow and ice, desert and ashlands, dense forest). The world has the same size, so saved parties keep working until the new map lands.
- Renderer: the design palette for biomes, and roads, bridges, fords and passes drawn over them.
- Tests: `terrain.test.ts` (rules, crossings, heap vs plain search, speed, connectivity of the current world).

### Phase 2 notes (what exists now)
- The reference picture is kept in `docs/art/world_map_reference.png`.
- **Grid:** 40 columns by 40 rows (not 36: the continent needs a sea margin on every side, and the picture is taller than wide). Hex 29.4 px wide laid over the picture.
- **Tracing tool:** `pnpm --filter @game/world map:trace [--preview out.png] [--write]` (`packages/world/tools/trace-map.ts`, dev dependency `pngjs`). Each pixel in a hex votes for a biome by colour; the hex takes the winner. A rules pass makes the outer ring sea, smooths noise, drops lost islands, turns the ground next to lava into ashlands, and keeps only river lines of 4 to 9 hexes. A short list of hand fixes repaints the far-north ice that reads as water. `--write` saves `src/world-map-data.ts`.
- **Map file:** `src/world-map-data.ts` holds the text (`[biomes]`, `[overlay]`, `[landmarks]`); `src/world-map.ts` parses and formats it (biome characters, overlay characters `. = : # ^`); `src/continent.ts` exposes `CONTINENT`. `pnpm --filter @game/world map:print [--preview out.png]` prints it with its landmarks.
- **Landmarks:** the picture's eight labelled places (the starting city and the seven bosses) are traced to hexes.
- **The draft is not final.** Rivers come out as scattered patches (thin lines are hard to read from colour), there are no overlays yet (roads, fords, bridges, passes), and some landmarks sit on plains or ash rather than where the content wants them. Phase 3 fixes the map by hand until the validator passes; the data file is then edited directly, not re-traced.
- Tests: `continent.test.ts` (size, characters, sea ring, one landmass, ice in the north, lava in the south, desert in the west, landmarks, text format).

### Phase 3 notes (what exists now)
- **Proposed unlock order (to confirm with the user in phase 4):** 1 Greenwood (start), 2 East Moors, 3 Southern Fen, 4 Northern Woods (north of the east), 5 Western Highlands (west of the start), 6 Frozen North, 7 Sand Wastes, 8 Southwest Coast, 9 Ashen Volcano. Which region leads into which (the gates): 1 into 2, 3 and 5; 2 into 4; 4 into 6; 5 into 7 and 8; 3 into 9. The order is the order of levels; a party may meet a gate before the region it leads from is finished, so the boss quests must be chained in this order (existing `requiresQuest`).
- **Map pipeline:** `map:trace` writes the raw draft (`src/world-map-trace.ts`); `map:build` (`tools/build-map.ts`) shapes it into `src/world-map-data.ts` deterministically: open woods instead of dense forest, region seeds and a flood that is dear over rock (so borders follow mountains and rivers), a barrier on every border (river over low ground, mountains over high ground, dense forest in woods) with exactly one crossing, a pass over mountains or a bridge over a river, on every gate border, cut-off ground walled in, roads from the first city to every crossing. `map:check` prints the validator's report.
- **Map file** gained `[regions]` (a character per hex), `[zones]` (ordered list) and `[gates]` (`id col row from to`).
- **Validator** (`src/map-check.ts`, `checkMap`): sea ring; region and sea agree; each gate is a pass on mountains or a bridge/ford on a river, leads forward in the order, and has open ground on both sides; every region but the first has exactly one gate; no walkable hex touches another region except at a gate; with a region's gate shut it cannot be reached, and once opened every walkable hex of the opened regions is reachable (no sealed pockets); crossings stand on what they open; climate lints as warnings (ice north, lava south, desert west of the mountains).
- **Result:** the continent passes with no errors. One warning: East Moors has only 25 walkable hexes (the picture's eastern slate lands are mostly rock). Walkable hexes per region: 72, 25, 140, 87, 67, 88, 57, 75, 41.
- **Not yet:** interior rivers with fords (rivers exist only as region borders), the sites (cities, dungeons, boss dungeons) on the map, region content. The picture's landmarks were snapped onto open ground of the region they fall in (they are hints for phase 4, not sites).
- Tests: `map-check.test.ts` (the continent passes; unlock order; gates; walls; and the checker catches a missing crossing, a hole in a wall, a sealed pocket, land on the edge, a gateless region, a backwards gate, a city on rock, a ford on mountains).

### Open until the draft map exists
The exact unlock order and which image area each region becomes (to be proposed from the traced map and confirmed with the user), how many extra zones, their level bands, and whether to add real tile art later (the picture is the style target).

