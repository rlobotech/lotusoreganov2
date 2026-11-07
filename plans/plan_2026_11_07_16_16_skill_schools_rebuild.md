# Skill schools rebuild

Status: in progress (phases 1 and 2 done, phase 3 next)

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
