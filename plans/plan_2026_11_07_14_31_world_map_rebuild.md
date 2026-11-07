# World map rebuild

Status: planned (phase 1 not started)


Goal: replace the 14x60 strip with an organic continent of about 40x36 hexes, like the picture the user generated (kept as the reference): the starter city in the centre-right, an irregular coast, bosses guarding passes, regions that unlock in a winding order (east, then south, then north of that, then west of the start) instead of one line south.

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

### Open until the draft map exists
The exact unlock order and which image area each region becomes (to be proposed from the traced map and confirmed with the user), how many extra zones, their level bands, and whether to add real tile art later (the picture is the style target).

