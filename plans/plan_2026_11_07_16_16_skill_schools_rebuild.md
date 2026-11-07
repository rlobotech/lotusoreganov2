# Skill schools rebuild

Status: in progress (phases 1 to 6 done, phase 7 next)

Source: the user's spreadsheet, kept as `docs/skill_schools_sheet.csv`. This plan turns it into code.

## Decisions (from the user)

- **Delivery:** the framework first, with the 32 starter skills and all 11 classes; then the remaining skills added a few schools at a time (target 10 per school, 130 in all).
- **Skill levels:** one shared power formula for the 10 levels of every skill, plus optional special effects at chosen levels (for example +1 burn turn, a wider area). Skills only get a hand-made table if the user asks for one.
- **New combat features** (summons, stealth, dual wield, ricochet arrows) are built in this plan, one feature per phase.
- **New classes:** I propose the numbers (attributes, growth, kit, AI) and the user reviews. Sprites stay placeholders until the art arrives (ids are lowercase and match the sprite file names: `barbarian`, `paladin`, `warlock`, `necromancer`, `shaman`, `druid`).

## What the sheet says (the rules to code)

1. **Thirteen schools in a ring:** Bow, Air / Electric, Axe, Fire, Sword, Water, Staff, Mace, Light, Shield, Earth, Dagger, Dark (Dark is next to Bow). Adjacency only makes dual skills more likely.
2. **Eleven classes:** Warrior, Barbarian, Paladin, Priest, Mage, Warlock, Necromancer, Shaman, Druid, Ranger, Rogue, each with a starting weapon (Warrior sword and shield, Barbarian double axe or two-handed axe, Paladin two-handed mace, Priest mace, the five casters a staff, Ranger bow, Rogue dagger).
3. **Skills have 10 levels.** A skill levels up by being used: each skill has its own measure (damage caused, health recovered, number of uses, or whatever fits) and each level is harder than the last. Only skills in the character's AI gain experience.
4. **School level = the sum of its skills' levels, capped at 100.** A school with more than 10 skills reaches 100 sooner. Each school point gives 1% power to the school's skills. Power means damage or healing, or status length and strength (for example +1 burn turn per 20 points, so +5 at 100).
5. **Each school is a tree** with one or more starting skills. New skills unlock from requirements: character level, school level, and specific skills at specific levels (for example Ice Wall: Water 20, Ice Shard 5, Rain 3, character level 15). The hardest requirement is school level 80; the campaign is meant to end at level 80 to 82.
6. **Dual skills** need two schools (character level, both school levels, some skills). They appear in both trees, and their level counts for both schools. Rare skills can need non-adjacent schools (a Shaman skill from Fire, Earth and Air / Electric).
7. **A shared starter** (for example Slash in Axe, Sword and Dagger) is one skill id per school: separate levels in each tree (Axe Slash, Sword Slash, Dagger Slash).
8. **Masteries are passive.** Staff Mastery levels up from any elemental skill; weapon masteries level up from damage with that weapon. They mostly raise power, with extra bonuses at high levels.
9. **Weapon requirements are set skill by skill** (a poison-coat skill in Earth needs a dagger).
10. **A character carries only 6 to 8 skills at once** (6 at the start, 7 at character level 30, 8 at level 60).
11. **Nothing is locked to a class.** A class only gives starting skills. Others are learned from books (a Barbarian can learn Demonology), and gear can weaken a skill that is not cast with its weapon.

## Starting skills (from the sheet)

| School | Starting skills |
|---|---|
| Bow | Bow Mastery, Ricochet Arrow |
| Air / Electric | Gust, Lightning Bolt |
| Axe | Axe Dual Wield Mastery, Axe Two Handed Mastery, Slash |
| Fire | Fire Bolt, Summon Imp (needs Demonology Mastery 1; Fire + Dark) |
| Sword | Sword One Hand Mastery, Sword Two Handed Mastery, Slash |
| Water | Ice Bolt, Rain (proposed) |
| Staff | Staff Mastery, Staff Strike (proposed) |
| Mace | Mace One Hand Mastery, Mace Two Handed Mastery, Blunt Strike |
| Light | Less Heal, Holy Bolt |
| Shield | Shield Mastery, Defensive Stance |
| Earth | Poison Dart, Fortify |
| Dagger | Dagger Mastery, Slash |
| Dark | Demonology Mastery, Void Bolt, Dash, Necromancy Mastery, Summon Skeleton |

Class starts: Ranger (Bow Mastery, Ricochet Arrow), Warrior (Sword One and Two Handed Mastery, Slash, Shield Mastery, Defensive Stance), Barbarian (Axe Dual Wield and Two Handed Mastery, Slash), Paladin (Mace One and Two Handed Mastery, Blunt Strike, Less Heal), Priest (Mace One Hand Mastery, Blunt Strike, Less Heal, Holy Bolt), Mage (Staff Mastery, Fire Bolt, Ice Bolt, Lightning Bolt), Warlock (Staff Mastery, Demonology Mastery, Summon Imp, Void Bolt), Necromancer (Staff Mastery, Necromancy Mastery, Summon Skeleton), Shaman (Staff Mastery, Fire Bolt, Gust, Lightning Bolt), Druid (Staff Mastery, Poison Dart, Fortify), Rogue (Dagger Mastery, Slash, Dash).

Starter progress: 32 of 130 skills defined. Water and Staff are thin; Rain and Staff Strike are only proposals.

## What exists now (and how it maps)

- 11 schools (sword, axe, hammer, dagger, bow, fire, water, electric, earth, dark, light), about 30 skills in `packages/world/src/skills.ts`, a school level from experience capped at 20, skills unlocked by school level plus "use skill N times" (`learning.ts`), books (`Item.teaches`), 5 classes with a kit and AI in `progression.ts`, AI rules in the AI tab.
- Mapping: `hammer` becomes **Mace**; `electric` becomes **Air / Electric**; **Staff** and **Shield** are new schools (staffs used to train nothing); the cap of 20 and the school experience curve go away.
- Saved characters are not migrated: the game is pre-release and parties are reset (a migration like `0003`).

## Phases

1. **Rules and data model** (`packages/world`, shared types). School list and ring adjacency; `SkillDef` gets `schools` (one or two), `levels` (10), `requires` (character level, school levels, skill levels), a `measure` (what raises its level) and a per-level `effects` list; a member stores a level and experience per skill; school level is the capped sum; school power is 1% per point. The shared power curve, the level-up cost curve per measure, the equipped-skill limit (6, 7 at level 30, 8 at level 60), and "only skills in the AI earn experience". Unit tests for every rule above (sum and cap, dual skills counting for both schools, shared starters being separate per school, requirements, the experience gate).
2. **Catalogue migration.** Move the existing skills into the new schools and levels, add the 32 starter skills (new ones that are only data first), set the 11 classes' starting skills and weapons. Rename the old ids only where the sheet requires it (keep ids stable otherwise). Balance with `balance:levels` and `balance:encounters`.
3. **Learning and books.** Unlock by the new requirements (tree view data: what a skill still needs); books teach any skill and the book requirement follows the tree; gear weakens a skill cast with the wrong weapon.
4. **Skills UI.** The circular wheel described above. The Spellbook shows each school as a tree (dual skills in both trees, locked skills with their missing requirements), skill levels and progress, equipped slots (6 to 8), and the AI tab only offers equipped skills. Phone-friendly.
5. **New classes.** Barbarian, Paladin, Warlock, Necromancer, Shaman, Druid: attributes and growth, kit, starting AI, character creation list. Proposed numbers go in this file for review before coding. Placeholder sprites.
6. **Engine: summons** (Summon Imp, Summon Skeleton): units added mid-fight for the caster's team, not counted in party size, with a limit per kind (one demon; skeletons one, then two, then three with Necromancy Mastery), their own AI and lifetime, level and power from the caster's skill and school, log format version bump, replay support.
7. **Engine: stealth, dual wield, ricochet** (Dash, Shadow Step, Axe and Dagger dual wield with two weapon slots, Ricochet Arrow). One at a time, each with tests and replay support.
8. **Fill the schools in batches** (about 100 more skills), a few schools per batch, each batch with the user's skill list and effects, balance run and tests. Water and Staff first, since they are the thinnest.

## Phase 1 notes (what exists now)

Phase 1 is a pure rules layer, not yet wired into parties, combat or the old skills (that is phase 2 and 3), so nothing in the running game changed.
- **`packages/world/src/skill-tree.ts`:** the ring of 13 schools (ids `bow, electric, axe, fire, sword, water, staff, mace, light, shield, earth, dagger, dark`; `electric` is Air / Electric and `mace` replaces the old `hammer`), `areAdjacent` and `adjacentSchools`, the tree node type (`TreeNode`: one or two schools, `family` for shared names like Slash, `requires` {character level, school levels, skills at levels}, `measure` damage / healing / uses, passive masteries with a `trainedBy`), the 32 starter nodes of the sheet (`SKILL_TREE`; Rain and Staff Strike marked `proposed`), `CLASS_START_SKILLS` for all 11 classes, and `treeProblems()` (ids, schools, requirement loops, nothing over school level 80, classes only start with skills they can hold).
- **`packages/world/src/skill-levels.ts`:** works on a small `SkillState` {`skillLevels`, `skillXp`, `equipped`}. School level = sum of skill levels capped at 100, a dual skill counting for both schools; school power 1% per point (a dual skill uses the better of its two schools); status +1 round per 20 points; level-up cost = base per measure (damage 400, healing 300, uses 12) x (1 + unlock level / 10) x 1.5 per level, so a starter is cheap and a skill that unlocks at school level 50 costs 6 times as much per step; `addSkillXp`; `trainingFor` / `trainSkills` (a skill trains only if carried; weapon masteries train from damage with that weapon split by hands and dual wield; Staff Mastery from any elemental spell; Shield Mastery from damage stopped; Demonology and Necromancy Mastery from their summon skill); requirements in words (`unmetSkillRequirements`), `learnable`; the carried-skill limit (6, 7 from level 30, 8 from level 60) with `equipSkill` and `unequipSkill`.
- **Decisions I took (tell me if wrong):** masteries are passive and take no slot (the sheet did not say); a skill that is not carried never trains (it cannot be used); Shield Mastery trains from damage stopped, and the two summon masteries from their summon skill (the sheet only said weapon masteries and Staff Mastery). All numbers are first guesses for the balance tools.
- Tests: `skill-rules.test.ts` (33 tests, one group per rule of the sheet).

## Phase 2 notes (what exists now)

The new rules now run the game: the old school experience system is gone.
- **Members** (`Member`): `skillLevels`, `skillXp` and `equipped` replace `schools` and `uses`. A saved member without them is upgraded when loaded (every learned skill at level 1), so no reset was needed.
- **Classes:** the five that exist start with the skills of the sheet (`CLASS_START_SKILLS`) and new default AIs (warrior: Defensive Stance, Slash, Attack; mage: Ice Bolt, Fire Bolt, Lightning Bolt; priest: Less Heal, Holy Bolt, Blunt Strike; ranger: Ricochet Arrow, Attack; rogue: Slash, Attack). Barbarian, Paladin, Warlock, Necromancer, Shaman and Druid already have their starts in the data but are not playable until phase 5.
- **Skill ids:** a tree node has the id of its combat skill. The starters that already existed keep their old ids with the sheet's names: `ember` is Fire Bolt, `frost_shard` Ice Bolt, `staff_bolt` Lightning Bolt, `shadow_bolt` Void Bolt, `heal` Less Heal, `smite` Holy Bolt. Twelve new combat skills were added for the starters that did not exist: Slash (sword, axe and dagger), Blunt Strike, Staff Strike, Ricochet Arrow (a plain arrow until phase 7), Gust, Rain, Poison Dart, Defensive Stance and Fortify (both only raise evasion for now, since the engine has no armour status). The masteries, Summon Imp, Summon Skeleton and Dash have no combat skill yet (passive or waiting for phases 6 and 7): they can be learned and level up but cannot be carried.
- **The earlier skills** (power strike, war cry, lunge, whirlwind, axe chop, rend, crushing blow, stun bash, stab, quick cut, vanish strike, throat cut, shoot, poison arrow, backstep shot, volley, fireball, chain lightning, stone spike, greater heal) were placed in the tree behind the starters, with the old school levels turned into school levels 0 to 30 and "used N times" into a skill level. Monsters use the combat skills directly, so they are unchanged.
- **Learning:** a skill with requirements is learned by itself once they are met (starters come from a class or a book; Chain Lightning stays book-only); a learned skill is carried if there is a free slot. Books waive the skill-level requirements but not the school levels. The AI can only use carried skills. Training: after every fight each carried skill gains experience from its damage, healing or uses, and the masteries from their own measure; `skill_level` feed events report level-ups.
- **Combat:** a new optional `UnitDef.skillMods` (engine) makes a skill stronger: +5% per skill level above 1 times the school's 1% per point (the better school for a dual skill) on damage and healing, and +1 round of its status per 20 school points. The engine has three new tests.
- **Server and web:** members report `schools` (level out of 100), `skillLevels`, `equipped` and `equipLimit`; skills report their `schools`, `passive` and `usable`; the Attributes and Spellbook tabs show the new levels (the wheel comes in phase 4).
- **Balance:** the monster power curve was raised (`+0.9` instead of `+0.4`, since school power makes characters stronger in the late game) and the new starter skills were strengthened; `balance:levels` now shows about 4 to 14% defeats at levels 1 to 10, 13 to 20% in the middle and under 10% above level 90. The level 90 to 100 band is still too easy and needs another pass (as does the world's boss tuning).

## Phase 3 notes (what exists now)

Most of the learning rules landed with phase 2; phase 3 added what was missing around them.
- **Choosing what to carry:** `equipMemberSkill` and `unequipMemberSkill` (world actions) and `POST /parties/:id/skills/carry` and `/skills/put-down`. A skill can be carried only if it is learned, usable (has a combat skill), not passive, and there is room (6, 7 from level 30, 8 from level 60). A skill an AI rule uses cannot be put down ("AI rule 2 uses it: change the rule first"), so no rule is left pointing at a skill the character does not carry. Only the owner of a character changes it.
- **Books for any skill:** a book can teach any tree skill that is usable or passive (a Warrior can learn Demonology Mastery from a book); it waives skill-level requirements but not school levels. Skills still waiting for the engine (the summons, Dash) are not dropped as books.
- **Level-ups:** a new character level teaches any skill that was waiting only for it, in the same fight.
- **Weapon warnings:** `weaponProblem` says when a carried skill needs a weapon the character does not hold ("needs dagger in hand"); members report it as `skillIssues` and the Spellbook shows it.
- **Data for the tree view:** the skill catalogue now has each skill's `requires` (character level, school levels, skills at levels), `measure`, `family`, `proposed` and `passive`; members already report school levels, skill levels, `equipped` and `equipLimit`. Phase 4 draws the wheel from these.
- **Spellbook:** Carry and Put down buttons, the carried count, and refusals shown on the card.
- Tests: `skill-actions.test.ts` (carrying, limit, owner, weapon problems, books for another class, level-up learning) and a server API test.

## Phase 4 notes (what exists now)

- **The skill wheel** (`apps/web/src/lib/manage/SkillWheel.svelte`, an SVG, drawn from the skill catalogue and the member's data): 13 sectors in ring order with Bow at the top, a hub labelled SKILL TREE, a badge with each school's level (0 to 100) and name. Skills are nodes along a branch: starters on the first ring, further out the more a skill asks for (`wheelLayout.ts`: past every skill it needs, and by school level band, 0-19, 20-39 and so on). A crowded ring staggers its nodes outward so they do not overlap.
- **Nodes:** learned skills are filled with their level, a carried skill has a white ring, a skill that can be learned on its own shows a yellow +, a starting skill you do not have (it comes from a class or a book) is dashed, locked skills are dim, passive masteries are diamonds, a red dot marks a skill that cannot be used with the gear worn. Names show when zoomed in, and always for carried and selected skills; a name marked † is still a proposal.
- **Lines:** a skill is joined to the skills it needs, in its school's colour (brighter once learned). A line to a skill of another school is dashed.
- **Moving:** drag to pan, pinch, wheel or + and − to zoom, All for the whole wheel, and a tap on a school's circle zooms to that school (tap again to go back). A drag no longer swallows taps (the pointer is captured only once it moves).
- **Detail panel** under the wheel: schools, level and progress, what raises it, what is still missing (✓ and ✗ per requirement), a note if it is not usable yet, and Carry or Put down (with the carried count).
- **Spellbook:** a Wheel / List switch (the wheel is the default; the list stays as the second view), and the skill books stay below.
- **Not done:** checked on a desktop-sized window only (the SVG scales to its width and uses touch gestures, but I did not test a phone); the node positions are computed, not hand-placed like the reference image, so busy schools (Dark) look crowded until more skills fill the tree.
- Tests: `wheelLayout.test.ts` (ring order, ring distance, dual skills in both sectors, no overlap, lines, loops, missing requirements, sector zoom).

### Wheel layout revision (after the first look)

The user asked for more room, nodes that never cross a sector line, one place for a skill of two schools, and lines that do not run over other skills. Now: every skill is drawn **once**, in the sector of the first of its schools (a skill of two schools sits in one sector; its requirements in the other school are a dashed line across); nodes stay inside their sector with room for the node itself; each sector is laid out as a tree (a ring that is full pushes the next skill one ring out, and the skills of a ring are ordered by where their parents are, so a child sits straight out from its parent); and every line is bent sideways, a little more each try, until it clears all other skills. The wheel is bigger (rings from 230 out in steps of 84), so zoom in to a school to read it; names show when zoomed. Tests cover sector boundaries, spacing in a crowded school, one node per skill, straight branches, and lines clearing nodes.

## Phase 5 notes (what exists now)

Barbarian, Paladin, Warlock, Necromancer, Shaman and Druid are playable (world `CLASSES`, the shared `CLASS_IDS`, the party creation screen). Proposed numbers, for review (all first guesses):

| Class | Attributes at level 1 (str dex int vit wis) | Growth per level | Move | Weapon and kit | Default AI |
|---|---|---|---|---|---|
| Barbarian | 11 6 1 8 2 | 1.0 .3 0 .7 .1 | 4 | Great Axe (two handed), cap, vest, boots | Slash, Attack |
| Paladin | 8 4 3 9 6 | .7 .15 .1 .7 .5 | 3 | War Hammer (two handed mace), cap, mail, boots | Less Heal under 50%, Blunt Strike, Attack |
| Warlock | 3 5 10 6 5 | .1 .2 .95 .4 .35 | 3 | Staff, hood, robe | Void Bolt, Attack |
| Necromancer | 2 4 10 5 7 | .1 .15 .9 .35 .5 | 3 | Staff, hood, robe | Attack |
| Shaman | 4 5 9 6 7 | .2 .2 .8 .4 .5 | 3 | Staff, hood, vest | Fire Bolt, Lightning Bolt, Gust |
| Druid | 4 6 8 7 7 | .2 .3 .8 .5 .5 | 3 | Staff, cap, vest | Poison Dart (if not poisoned), Attack |

- **Everyone now has the basic Attack** (it was missing for the Mage, Priest, Ranger and Rogue), so no class stands idle when its skills are on cooldown.
- **Start skills** are the sheet's (`CLASS_START_SKILLS`). The **Necromancer cannot use any of them yet** (Summon Skeleton waits for the summons in phase 6), so until then it fights with a staff strike only; the Warlock has one bolt besides its staff. Both get real before the summons phase.
- **Two handed weapons:** a new `Great Axe` item base (axe, two hands, cut). Barbarian starts with it instead of the double axe because dual wield is phase 7; Axe Two Handed Mastery trains from it. The Paladin's War Hammer is a hammer kind, which the Mace masteries accept.
- **Art:** sprites exist for barbarian, mage, necromancer, paladin, rogue and warrior; the others use the placeholder.
- **Balance check** (a party of Warrior, Priest, Mage plus the class, 30 fights, defeats %): melee classes do best (Barbarian 0 to 10, Paladin 0 to 13, Ranger 0 to 7), casters worst (Mage 17 to 27, Druid 17 to 27, Necromancer 10 to 33). The caster gap was already there for the Mage; it widens with the Necromancer until it has summons. Tuning waits for the summons phase and real play.
- Tests: `classes.test.ts` (eleven classes, sheet starts, weapons, day-one fighting, masteries training from the starting weapon) and a server test that the API classes equal the world's.

## Phase 6 notes (what exists now)

Summons work end to end: engine, world, replays.
- **Engine** (`packages/engine`): a new skill kind `summon` with `SummonDef` (kind of summon, name, sprite, attribute shares of the caster, move, skills, AI, weapon). The summoned unit is created on the free tile beside the caster that is closest to the enemy, on the caster's team, at the caster's level, with attributes = shares of the caster's attributes times the caster's `skillMods` power for the skill (so skill and school levels make it stronger). It acts from the next round, has its own AI, and does not count when deciding whether a team has lost (when every real unit of a side is down the fight ends, summons or not). Limits are per kind: `UnitDef.summonLimits[group]` (default 1); the AI skips a summon rule while the limit is reached or there is no free tile, so it falls back to its other skills and calls a replacement when one dies. Log format version is now **3** (a new `summon` event, and `summon: true` on final units); old stored replays (version 2) still play, since only a new event type was added. Eight new engine tests.
- **World:** `summon_imp` (group demon: Imp, fire bolt, light and quick) and `summon_skeleton` (group skeleton: Skeleton, cutting strike, sturdy) with their units' own skills (`imp_firebolt`, `skeleton_strike`, in no school). Limits come from the character: one demon, and skeletons 1, 2 from Necromancy Mastery 4 and 3 from 8 (`skeletonLimit`, `summonLimitsOf`). Both skills cost 8 mana and are usable and carried like any other (a Warrior can learn Summon Imp from a book). Warlock default AI: Summon Imp, Void Bolt, Attack; Necromancer: Summon Skeleton, Attack. Summons are never members of the party, never listed as fallen, and using the skill trains it and its mastery.
- **Viewer:** units called up in a fight are built hidden from the start of the replay and appear (with a spreading ring) at their event; they get the placeholder art until imp and skeleton sprites exist (`/sprites/imp.png`, `/sprites/skeleton.png`).
- **Balance** (a party of Warrior, Priest, Mage plus the class, defeats %): Warlock now 0 to 13% (was 7 to 20), Necromancer 10 to 30% (it was 10 to 33). The Warlock is now clearly stronger than the Mage; tuning waits for real play.
- Only one kind of demon and of skeleton exists so far; more kinds come with the skills the user will provide (each kind shares the limit of its group).
- **Not checked by eye:** a real summon replay playing in the browser (the party needs a few minutes to reach its first fight); the viewer is covered by reducer tests and by a test that builds a timeline from a real engine fight with a summon.
- Tests: engine `summon.test.ts`, world `summons.test.ts`, web viewer tests.

## Decided after the first draft (from the user)

- **Equipped skills:** 6 at the start, 7 at character level 30, 8 at level 60.
- **What raises a skill's level:** damage caused, health recovered, or number of uses (each skill uses the one that fits it). Each level needs more than the one before. **The first step depends on the skill's own place in the tree:** a starter skill (no requirements) goes from level 1 to 2 quickly, while a skill that unlocks at school level 50 needs much more for the same step. So a skill's cost curve is scaled by its unlock requirement (the highest school level it asks for). The exact numbers are tuned later with the balance tools.
- **Names:** use Rain and Staff Strike. I propose the missing skills of each school when its batch comes up (phase 8), and the user corrects them.
- **Weapon slots:** a two-handed weapon takes the main hand and the off hand. Dual wield needs a one-handed weapon in the main hand and another in the off hand.
- **Summons:** they do not count against party size. Each kind has its own limit: one demon at a time (always one), and skeletons start at one, rising to two and then three with Necromancy Mastery levels. There will be several different demons and several different skeletons, but only up to the limit of each kind can be out at once.

## Skills screen reference (from the user)

Two pictures are kept as references: `docs/art/skill_wheel_reference_layout.webp` (the layout: a diagram of the 13 schools) and `docs/art/skill_wheel_reference_style.webp` (the look: glowing nodes joined by lines, one colour per school, a tree at the centre). The Skills screen (phase 4) follows them:
- **One circular wheel**, centre labelled "Skill Tree", with a sector for each of the 13 schools in ring order (Bow at the top, then Air / Electric, Axe, Fire, Sword, Water, Staff, Mace, Light, Shield, Earth, Dagger, Dark). Each sector has its own colour and a badge with the school's level (0 to 100).
- **Skills are nodes along a branch from the centre outward.** Starter skills sit near the centre; the more advanced a skill, the farther out. Branches split where a skill leads to several others (Bow has one start and many branches; Dark has several starts: Demonology, Necromancy, Dash).
- **Dual skills** are drawn as a dashed line across sectors, from one school's tree to the other's (like Summon Imp from Fire to Dark Demonology), and the node shows in both trees.
- **Node look:** a locked skill is dim with its missing requirements on tap; an unlocked one shows its level (1 to 10) and progress; skills marked proposed are shown as such until named for good. A skill in the AI (equipped) is highlighted.
- **Phone:** the wheel scales to the screen and can be zoomed and dragged like the world map; tapping a school fills the screen with that school's tree, and a list view stays available. The wheel is a view of the same data the rules use.

## Still open

- The exact level-up numbers (to tune): the cost curve per measure and the scaling by unlock requirement.
- The missing skills (and their effects) of every school: the user will provide them later, batch by batch.
- Necromancy Mastery raises the skeleton limit to 2 at level 4 and to 3 at level 8 (the user agreed; to be balanced later). Which demons and skeletons exist comes with the skills.
- Replays and the log format will change for summons; old replays are dropped, as in earlier combat changes.
