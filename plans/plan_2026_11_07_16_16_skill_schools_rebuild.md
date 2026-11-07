# Skill schools rebuild

Status: planned (no phase started)

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
10. **A character carries only 6 to 8 skills at once** (to be decided).
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

1. **Rules and data model** (`packages/world`, shared types). School list and ring adjacency; `SkillDef` gets `schools` (one or two), `levels` (10), `requires` (character level, school levels, skill levels), a `measure` (what raises its level) and a per-level `effects` list; a member stores a level and experience per skill; school level is the capped sum; school power is 1% per point. The shared power curve, the level-up cost curve per measure, the equipped-skill limit, and "only skills in the AI earn experience". Unit tests for every rule above (sum and cap, dual skills counting for both schools, shared starters being separate per school, requirements, the experience gate).
2. **Catalogue migration.** Move the existing skills into the new schools and levels, add the 32 starter skills (new ones that are only data first), set the 11 classes' starting skills and weapons. Rename the old ids only where the sheet requires it (keep ids stable otherwise). Balance with `balance:levels` and `balance:encounters`.
3. **Learning and books.** Unlock by the new requirements (tree view data: what a skill still needs); books teach any skill and the book requirement follows the tree; gear weakens a skill cast with the wrong weapon.
4. **Skills UI.** The Spellbook shows each school as a tree (dual skills in both trees, locked skills with their missing requirements), skill levels and progress, equipped slots (6 to 8), and the AI tab only offers equipped skills. Phone-friendly.
5. **New classes.** Barbarian, Paladin, Warlock, Necromancer, Shaman, Druid: attributes and growth, kit, starting AI, character creation list. Proposed numbers go in this file for review before coding. Placeholder sprites.
6. **Engine: summons** (Summon Imp, Summon Skeleton): units added mid-fight for the caster's team, their own AI and lifetime, level and power from the caster's skill and school, log format version bump, replay support.
7. **Engine: stealth, dual wield, ricochet** (Dash, Shadow Step, Axe and Dagger dual wield with two weapon slots, Ricochet Arrow). One at a time, each with tests and replay support.
8. **Fill the schools in batches** (about 100 more skills), a few schools per batch, each batch with the user's skill list and effects, balance run and tests. Water and Staff first, since they are the thinnest.

## Open questions

- Exact number of equipped skills (6 to 8). Proposal: 6 at the start, +1 at character levels 30 and 60, so 8 from level 60. Needs the user's answer before phase 1 ends.
- The per-skill measures (what raises each skill's level) and the level-up curve; the sheet says the values will be balanced later. Proposal: start with one curve per measure, tune with the balance tools.
- Names to settle: Rain and Staff Strike (proposals), and the 4 or 5 missing skills of every school.
- Two-hand and dual-wield gear: how weapon slots work for a double axe, a two-handed sword and a shield (the item system already has `hands`).
- Whether summons count against the equipped limit or the party size, and how many can be out at once.
- Replays and the log format will change for summons; old replays are dropped, as in earlier combat changes.
