# Lotus Oregano

An idle party RPG for the web. A party of 2 to 6 adventurers explores a hex world, hunts monsters, clears dungeons and does quests on its own, around the clock. Players check in once or a few times a day to watch what happened, adjust their characters and give the party new orders.

All combat is calculated on the backend server. The client only plays it back as a replay.

## Overview

- Idle, asynchronous and always running: the world keeps going whether or not anyone is logged in.
- Solo or multiplayer. The party always acts together.
- Players manage their characters in the UI: equipment, attributes, skills, combat AI, orders and quests.
- Dark, D&D-flavoured pixel art, playable on desktop and on a phone browser.
- A user account is required to play.

### Parties

- A party has 2 to 6 characters.
- Solo: you choose the size of your group (2 to 6).
- Multiplayer: each player creates their own character and adds it to the group.
- The party shares its level, experience and bag.
- Each player also has a personal bag of 10 slots that other players cannot access (in solo you can use it freely).

## How the game works

### The idle loop

The party goes through the world exploring, hunting and doing quests. When it has no orders and no quests queued, it hunts automatically.

The server advances every party in small time steps. These show where the party is in the world, whether it is travelling, fighting or resting, and whether an event happens.

Players are expected to log in once a day or a few times a day. They watch the replays of everything that happened, adjust their AI, equip new items, spend attribute points, pick new quests or send the party somewhere. The idea is that a set of orders keeps the party busy for hours (around 10), and when the players come back the party is stronger and they set new orders.

### The world

- The world map is divided into small hexagons. Each one is either empty or holds something to visit.
- It is rich with cities, dungeons, forests and other places.
- The map is divided into zones. Each zone has a level range (for example 1-3, 4-5).
- Cities are spread across the regions. Players can teleport from one city to another by paying gold.
- Regions are unlocked by defeating boss dungeons, which the party does by taking the boss quests.
- The world will be huge, with many monsters, encounters, skills and events.

### Orders and quests

- The player (or, in multiplayer, the group) gives orders to the party. An order is either a quest or a trip to a specific place on the map.
- When an order is given, the party finishes what it is doing and then goes to the order.
- Players can queue several orders or quests. The party finishes one before moving on to the next.
- The quests available are the same for the whole party.
- Multiplayer: orders are voted on. Each vote moves an order up in priority. For example, if two players want quest 1 first and one wants quest 2 first, the party does quest 1, and when it is finished it moves on to the next order. When players give different orders, the party goes to the one with the most votes. A player can also vote to cancel an order.

### Resting, defeat and survival

- After a fight in the wild, the party can rest to regain health.
- Inside a dungeon, resting is not always possible. Fights come one after another.
- Resting can be a configuration that the party sets.
- If the whole party is defeated, it goes back to the last city it visited and loses gold, and maybe items from the bag.
- If at least one member survives, the party survives: it rests to recover before carrying on.

### Pacing and seasons

- The maximum level is 100.
- The game is played in seasons of 3 months.
- Players who play a lot and optimize should be able to reach level 100 in about 45 days.

### PvP

- Rare PvP events take two groups of the same level and make them fight. The loser does not go back to the city; it stops to rest.
- There will also be an arena in the cities, which the group can order the party to go and fight in.

### Modes and leaderboard

There is a leaderboard and there are two game modes: standard and hardcore. In hardcore, the game is over for the party if the whole party is defeated.

## Combat

- Combat is turn based and fully calculated on the server. Players decide nothing during a fight. What they control is outside of combat: AI, equipment, attributes, skills, orders.
- Each character and monster follows its own AI configuration. Players configure their characters; monsters have a fixed one.
- Every character acts at least once per turn. When the turn ends, end-of-turn effects happen.
- Combat takes place on a square grid, drawn in 2.5D. There are different arenas, all with a size limit but with different shapes.
- The whole fight is written to a combat log. The UI uses it to display a replay, like watching a movie, and the log is saved in the database so players can watch it again.
- In a replay you see every action: monsters and characters moving around and using skills until one side is defeated.

### Combat AI

Combat AI works like Final Fantasy XII: the player chooses which skill has priority under which conditions. Example: priority 1, cast heal on a nearby ally with 50% health or less; priority 2, cast a lesser heal on an ally with 80% health or less; priority 3, use skill X to buff the ally with the highest maximum health; priority 4, melee attack on a close enemy; and so on. There will be many actions, conditions and targets to choose from.

### Skills

- Players have skills and can put any of them in their AI priority list.
- Skills consume mana and may have a cooldown.
- Skills are acquired based on the skills a character already uses, like in Skyrim: a mage who specializes in fire gets more fire skills. The more you use a skill family, the greater the chance to acquire skills from that tree.

## Presentation

- Pixel art. Characters and monsters use just a few sprites with no animation: idle, in combat, death, and a few others.
- Movement is a "South Park" style slide: the sprite swings from one square to the next instead of animating.
- Attacks use visual effects: a sword slash on the enemy, a fireball that flies from the caster to the enemy and explodes.

## Characters and items

### Races and classes

- Races: Human, Elf, Dwarf and Orc (more later).
- Classes: Warrior, Barbarian, Paladin, Mage, Necromancer, Priest, Ranger, Rogue and Druid (more later).

### Attributes and equipment

A character has attributes, equipment, skills and a combat AI. Attributes are modified by equipment and by levelling up.

### Bags

- The party has a shared bag of 40 slots. Items can be sold in cities.
- When the bag is full, new items take the place of the item with the lowest item level or rarity.
- Any player can mark an item as a favorite so it is never discarded automatically.
- Each player also has a personal bag of 10 slots (see Parties).

---

# Development

See [PLAN.md](PLAN.md) for the architecture and milestones, and `docs/art/` for the sprite and tile prompts.

## Requirements
- Node.js 24+ (the server runs TypeScript directly, no build step)
- pnpm (`npm install -g pnpm`)
- Docker Desktop (for Postgres)

## First-time setup
```bash
pnpm install
```

```bash
cp .env.example .env
```

## Everyday commands
Start / stop the database (Postgres 17, plus a separate `game_test` database for tests):
```bash
pnpm db:up
```

```bash
pnpm db:down
```

Run the API (applies pending migrations on start, listens on port 3000):
```bash
pnpm --filter @game/server dev
```

Apply migrations only:
```bash
pnpm --filter @game/server migrate
```

Create a beta invite code (arguments: uses, days valid, optional custom code):
```bash
pnpm --filter @game/server invite:create 5 30
```

Checks (the same ones CI runs; tests need the database up):
```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

```bash
pnpm format
```

## Combat engine
Run one sample fight and print the readable log (change the seed to get a different fight):
```bash
pnpm --filter @game/engine simulate --seed 1
```

Print the raw JSON event log instead (this is what gets stored as a replay):
```bash
pnpm --filter @game/engine simulate --seed 1 --json
```

Balance simulator: run N fights and print win rate, average rounds and survivors:
```bash
pnpm --filter @game/engine balance --fights 2000
```

## World simulation (idle loop)
`packages/world` is the pure game simulation: hex map, starter world (2 regions, 2 cities, 3 dungeons), party state machine (travel, hunt, rest, dungeons, defeat), XP and loot. The server's scheduler calls it for every party whose activity has finished.

Play a party through time and print its feed (a 12 hour absence by default; `--order` sends it to a place, `--hardcore` makes a defeat permanent):
```bash
pnpm --filter @game/world simulate --hours 12 --order goblin_warren
```

Balance report: many parties over 48 hours, win and defeat rate by party level, level reached after 6/12/24/48h:
```bash
pnpm --filter @game/world balance --parties 40 --hours 48
```

Watch it run for real: set `TIME_SCALE=60` in `.env` (dev only, one tick per second instead of per minute), start the database and the API (`pnpm --filter @game/server dev`), then use the API below. The server refuses `TIME_SCALE` other than 1 in production.

API (needs the login cookie from `/auth/login`, except `/world`):
- `GET /world` map, zones and sites
- `POST /parties` create your party `{name, mode, members:[{name, race, cls}]}` (races human/elf/dwarf/orc, classes warrior/mage/priest/ranger, 2-6 members)
- `GET /parties/me`, `GET /parties/:id` status, members, bag, orders
- `GET /parties/:id/feed` events since you last watched (`?after=` to choose), `POST /parties/:id/feed/seen {upTo}`
- `GET /parties/:id/replays`, `GET /replays/:id` stored fight logs (last 100 plus 20 pinned boss/defeat/epic fights)
- `POST /parties/:id/orders {siteId}`, `DELETE /parties/:id/orders/:orderId`, `POST /parties/:id/orders/:orderId/move {dir}` send the party to a city or dungeon and order the queue
- Management (every call answers with the fresh party): `POST /parties/:id/equip`, `/unequip`, `/items/:itemId/favorite`, `DELETE /items/:itemId`, `POST /members/:memberId/allocate`, `/auto-alloc`, `/reset-points`, `PUT /members/:memberId/ai`, `POST /members/:memberId/ai/reset`
- Quests: `GET /parties/:id/quests` (all quests with status, objectives, progress and rewards), `POST /parties/:id/quests/:questId/accept`, `DELETE /parties/:id/quests/:questId`
- City (only while the party is in one): `GET /parties/:id/city`, `POST /parties/:id/city/sell`, `/city/buy`, `/city/teleport`, `POST /parties/:id/town/leave`
- `GET /content/skills` skill definitions (public)

## Playing it (web app)
The web app talks to the API through the same origin: the Vite dev server forwards `/api/*` to the API on port 3000, so the login cookie just works. In production a reverse proxy (Caddy) does the same mapping.

To play locally, start the database, then the API, then the web app (three terminals, or background them):
```bash
pnpm db:up
```

```bash
pnpm --filter @game/server dev
```

```bash
pnpm --filter @game/web dev
```

Open http://127.0.0.1:5173. Create an invite code first (see above), then **Create account** with it, form your party (2 to 6 adventurers), and watch the hex map. Set `TIME_SCALE=60` in `.env` to see things happen in seconds instead of minutes.

What you get:
- **Return slideshow:** whenever you come back, the fights and events since your last visit play one at a time (skip this / skip all). Long absences roll routine victories into summaries and keep the notable fights (bosses, defeats, rare loot, anyone falling). What you watched or skipped is remembered on the server, so it works across devices.
- **Party screen:** the hex world map (pan and zoom, tap a place to send the party there), what the party is doing and when it finishes, members' health, the bag, orders and a list of stored replays to rewatch.
- **Manage party menu** (button on the party screen):
  - **Character:** attributes with where each point comes from (class, race, level, points you spent, gear), spend unspent points or let them auto-spend, equip and remove gear, see the member's skills.
  - **AI:** edit each member's combat rules (skill, target order, target and self conditions), reorder them, save, or reset to the class default. Rules are checked on the server.
  - **Party:** every member's stats and gear side by side.
  - **Bag:** the shared 40-slot bag, favorite stars, equip for any member, discard.
  - **Quests:** active quests with progress bars, available quests (with rewards), quests that are not open yet and why, and the completed list. Taking a quest adds it to the order queue; the party then travels to the right place, hunts the target monster in a region where it lives, or clears the dungeon, and is paid when done (gold, xp, sometimes an item). Kills count for every active quest that wants them. Boss dungeons only open to a party that has taken their quest.
  - **Orders:** the order queue with reordering, and add a destination from a list.
  - **City:** only while the party stands in a city. A party you send to a city waits there for an hour (or until you give new orders) so you have time to sell, buy from the shop, teleport to cities you have visited (for gold) or send it on its way.
- **Replay lab:** a developer tool that runs any seed of the sample fight, or loads a log made with `simulate --json`, without needing the API.

Replay controls: play/pause, 1x/2x/4x, previous/next turn, scrub bar, End. Camera: drag to pan, mouse wheel or pinch or the +/- buttons to zoom (whole-number steps), Fit to see the whole arena. Tap a unit to see its HP and statuses.

Sprites: units are drawn as placeholders until a PNG with the sprite's name exists in `apps/web/public/sprites/` (for example `human_warrior.png`, `goblin.png`; the names come from each unit's `sprite` field). A 32x32 image facing south-east is expected, the west-facing version is the same image flipped.

Build for production:
```bash
pnpm --filter @game/web build
```

## Project layout
```
apps/server/      Fastify API, migrations (src/db/migrations), tests
packages/shared/  zod schemas and types shared by server and client
packages/engine/  deterministic combat engine (pure TypeScript, no I/O), CLI simulator
packages/world/   world map, party simulation, progression and loot (pure, deterministic)
apps/web/         Svelte + PixiJS client: replay viewer, return slideshow
docs/art/         AI prompts for character and tile sprites
assets/raw/       original generated sprites (characters, monsters, tiles, vfx, ui)
infra/            database init scripts
```

## Notes
- `TIME_SCALE` in `.env` speeds up game time for development only (60 = one tick per second). The server refuses to start with it in production.
- Health check: `GET http://localhost:3000/health`.





