# Project Plan

Idle party RPG for web (dark D&D feel, pixel art, mobile-friendly). See README.md for game design.

## 1. Decisions so far

| Area | Decision | Reason |
|---|---|---|
| Language | TypeScript end-to-end | One combat engine shared by server and client; shared types |
| Backend | Node.js + Fastify | Small, fast, good TS support |
| DB | PostgreSQL | Relational game data + JSONB/bytea for logs |
| Queue/scheduler | Postgres-based (pg-boss) at first | No Redis needed on a single VPS; swap to SQS/Redis at AWS time |
| Client | PWA: Vite + Svelte (or React) for menus, PixiJS for map and combat replay | Installable on phones, 60fps pixel rendering, integer scaling |
| Hosting | Docker Compose on one VPS (app + worker + Postgres + Caddy) | Cheap; portable to AWS later |
| Scale target | Hundreds now, tens of thousands later | Design stateless workers so scaling out is just "more workers" |
| MVP | Solo only, party size 2-6 | Add shared parties, orders voting after core loop works |

## 2. Architecture

```
packages/
  engine/    pure TS, deterministic: combat sim, AI evaluator, loot, RNG (seeded). No I/O.
  shared/    types, data schemas (zod), constants, content ids
  content/   JSON/YAML game data: classes, skills, monsters, items, zones, quests
apps/
  server/    Fastify API (auth, party mgmt, orders, replays)
  worker/    tick processor: pulls due parties, runs engine, writes results
  web/       PWA client (menus + PixiJS replay + hex map)
```

Key principle: **engine is pure and deterministic** (seeded RNG, no Date/Math.random). Same input + seed = same output on server and client.

### Tick model
- Each party has `next_tick_at`. A scheduler picks due parties (`SELECT ... FOR UPDATE SKIP LOCKED`), so any number of workers can run safely.
- A tick advances the party state machine: `travelling -> encounter -> combat -> resting -> (event) -> ...`
- **Tick = base time unit (1 minute).** The game is a slow 24/7 world, so activities take many ticks. A party is only woken when its current activity finishes (`next_tick_at = now + duration`), so the scheduler does not care how long things take.
- **Activity durations (tunable data, not code):**
  - Travel: ~10 ticks per hex by default; terrain multiplier (road/street < 1, plains 1, forest/hills/swamp/mountain > 1). Party speed effects can modify it.
  - Combat: ~5 ticks per round, so a 6-round fight takes ~30 min. Duration is known from the simulated log (`rounds * TICKS_PER_ROUND`).
  - Rest: 10-20 ticks depending on missing HP/mana (a flat minimum plus a per-percent cost). Dungeons may forbid rest or limit it; rest is a party setting.
  - Cities/shops/teleport: fixed durations (teleport maybe a few ticks).
- **Rough pacing:** wild cycle = travel 10 + fight ~30 + rest ~15 = ~55 min, i.e. ~25 fights/day. Quest and XP numbers, plus the 45-day level-100 target, must be balanced on this, not on 5-minute cycles.
- **Fight lifecycle:** at fight start the worker snapshots the party (equipment, AI config) and runs the engine. The result (log, loot, XP, deaths) is stored but only applied and shown at the end of the fight's duration, and the state shows "fighting" meanwhile. Edits to AI/equipment during a fight apply to the next fight.
- **Replay retention:** at ~25 fights/day the 100-replay cap keeps ~4 days of history, which fits "check in once a day". Still pin boss, defeat, PvP and rare-drop replays in a small separate pool (~20) so they are never pushed out by routine fights.
- **Dev-only time scale:** env var `TIME_SCALE` (e.g. 60 = 1 tick per second) divides all durations when computing `next_tick_at`. The server refuses to start with `TIME_SCALE != 1` when `NODE_ENV=production`. The engine is unaffected (it never reads the clock), and a CLI/test helper can also fast-forward a party N ticks.
- **Load:** with ~25 events per party per day, 500 parties is well under 1 event per second, and even 50k parties is ~15/s. Scale is a non-issue for the scheduler; replay storage is the only growth to watch.
- Offline catch-up: if the server was down, process missed ticks in a bounded loop.
- Jitter `next_tick_at` so ticks spread out instead of bursting every minute.

### Dungeon hexes
- A hex can hold a **site**: city, dungeon, or boss dungeon. Entering a dungeon hex locks the party in until the dungeon is **cleared** (or the party is defeated). Orders and other travel wait in the queue; the party only leaves the hex when done.
- A dungeon is data: an ordered list of **stages** (encounter groups, optional events/traps/treasure rooms) ending in a boss for boss dungeons. Each stage has its arena, monster set, loot table, and whether resting is allowed after it.
- Party activity inside a dungeon is a loop: `fight stage -> loot -> (rest if allowed and the party's rest setting says so) -> next stage`, using the same durations as the wild (combat ~5 ticks/round, rest 10-20 ticks). Dungeon progress (`stage_index`, cleared flags, loot already taken) is stored per party so it survives restarts.
- Rest rules per dungeon/stage: `free`, `limited` (N rests total, or only at checkpoint stages), or `none`. The party's rest setting (e.g. rest below X% HP/mana) is applied only where allowed; otherwise they push on.
- Clearing a dungeon: grants its completion rewards, marks the hex cleared for that party (regular dungeons may reset on a timer so they can be farmed; boss dungeons unlock regions once, permanently), then the party resumes the queue or goes back to hunting.
- Defeat inside a dungeon follows the normal defeat rules (back to the last city, gold loss) and **dungeon progress resets**: the next attempt starts at stage 1 and monsters/treasure respawn. XP and items already earned are kept (subject to the normal defeat bag-loss rule). This makes dungeons real risks, so players are pushed to tune gear and AI before entering; the UI should show a recommended level and a warning before an order to enter one.
- Because a dungeon can take many hours, the feed shows a compact progress line (e.g. "Crypt of Ash: stage 4/9, resting") and each fight still produces a normal replay.
- Wild hexes (no site) keep the hunting/exploring loop. Random events can still trigger there.

### Death, defeat and loot (decided)
- **Defeat = every party member dead.** If at least one member survives, the party survives, the fallen are revived at low HP, and the party goes to rest (rest is forced even if the rest setting is off, and dungeon "no rest" rules do not apply to a forced recovery unless the dungeon says otherwise).
- **No retreat.** Fights end only in victory or defeat (round cap = draw, see combat rules). Preparation (gear, AI, orders) is the player's only lever, which is why the UI warns before risky orders.
- **On defeat (standard mode):**
  - Lose a percentage of **carried party gold** (start at ~10-20%, tunable). Gold deposited in a **city bank** is safe, so players have a reason to visit cities; this needs a bank (stash) in the data model and a "deposit" step in city visits (can be automatic by setting, e.g. deposit above X when in a city).
  - Each **unfavorited bag item** has a small chance (~5-10%, tunable) to be lost. Equipped items and favorited items are never lost. Personal and party bags both apply.
  - Party returns to the **last visited city**, rests there, then resumes (the order queue is kept, a dungeon in progress resets).
- **Hardcore:** full-party defeat ends the party permanently. Characters are archived to a graveyard and the final stats go on the hardcore leaderboard; players can start a new hardcore party. Gold/item loss rules do not matter there.
- **PvP defeat:** loser does not return to a city; it stops and rests where it is (no gold/item loss), as per README.
- **Loot:** each monster/boss has a loot table (item level scales with monster level, rarity weights, chance for gold). Rolls use the fight's seeded RNG so loot is reproducible from the log. Items drop into the party bag (40 slots) or the character's bag; when full, the lowest item level/rarity unfavorited item is discarded (README rule). Show a "discarded" line in the feed so players understand what happened.
- **Tuning data:** loss percentages, item loss chance, loot weights and bank rules live in content/config files, not in code.

### Combat and replays
- Server runs the full fight in a few ms and emits an **event log** (move, skill, hit, heal, status, death, EOT effects), not frames.
- Client replays the log with animations/VFX; it never decides anything.
- Storage: log is compact (numeric ids, delta-coded) then gzip into one `bytea` per fight. Roughly 1-5 KB each.
- Keep last **100 per party**: insert, then delete older rows in the same transaction (or a ring-buffer slot index `n % 100` with upsert, which avoids deletes and bloat).
- **Versioning (decided):** every replay row stores `engine_version` and `log_format_version`. We do **not** keep old engines or old viewers alive. The viewer only reads the current log format; replays with an older, incompatible format are marked **expired** and show "replay no longer available" (their text feed entry, XP, loot and result remain). Additive/compatible changes (new optional event fields) do not bump the format version, so most deploys keep old replays playable. Bump the format version only for breaking changes, and do it deliberately (changelog + test that old fixtures either play or are cleanly rejected). Pinned replays follow the same rule. Because replays are an event log (not re-simulated), the viewer needs only the log format, never the old engine.
- Optional later: store only seed + inputs and re-simulate on the client (tiny storage). This would require keeping old engines, so it is not planned.

### Combat rules (decided)
- **Arenas:** square grid, each arena defines its own size and shape. **No fixed size cap**: the replay camera can zoom and pan (see "Replay camera"), so arenas can be as big as the design needs. On screen an arena is `(w + h) * 16` px wide (8x8 = 256 px, 12x12 = 384 px, 20x20 = 640 px). Practical guardrails, not rules: content validation warns above ~24x24 (pathfinding/line-of-sight cost and long fights), and the per-fight round cap still applies. Bosses can use bigger sprites and bigger arenas. Arenas are data: width, height, blocked tiles, spawn zones.
- **Turn order:** rounds. At the start of each round all living units are sorted by Speed (ties broken by the seeded RNG); everyone acts once; end-of-round (EOT) effects (poison, regen, buff/debuff expiry, cooldown ticks) resolve after the last unit.
- **Unit turn:** move up to `Move` squares, then one action (skill/attack/item/wait). The AI gambit list is evaluated top to bottom; first rule whose condition and target are valid wins; if the rule needs movement it moves toward range first. Fallback rule: basic attack on nearest enemy.
- **Line of sight:** obstacle tiles block ranged attacks and spells (Bresenham/supercover line check on the grid); no height levels. Melee needs adjacency; movement is 4-directional pathfinding (A*) around obstacles and units. Gambit conditions can include "target visible".
- **Visuals:** 2.5D is a rendering concern only (isometric diamond tiles, depth sorting by x+y); the engine sees a flat square grid. See "Art spec".
- **Safety:** hard cap on rounds per fight (e.g. 50); if reached, the fight is a draw/retreat so ticks never hang.

### Art spec (from the user's reference image)
- **Projection:** isometric diamond tiles, flat grass/forest-style tile surfaces with a soft dark outline. The engine grid stays flat and square (x, y); the renderer maps grid -> screen with the usual iso transform (`sx = (x - y) * tileW/2`, `sy = (x + y) * tileH/2`). Depth sorting by `x + y` (then y) so units in front draw over units behind.
- **Characters and monsters:** a single sprite per pose facing south-east; the south-west facing is the same sprite flipped horizontally (north-facing is not needed). Movement toward the north just keeps whichever facing is closest.
- **Poses (no animation):** idle, combat/attack, hurt (optional), death, plus a few extras per unit as needed (cast). The "South Park" slide handles movement; VFX are separate sprite sheets.
- **Sprites per unit:** gear is baked into the class/race sprite (no paper-doll layers); equipment shows only as item icons in the UI. Art cost = races x classes x poses (4 x 9 x ~4 = ~144 sprites to start); monsters are one set each. Start with 1-2 classes per race to ship the MVP.
- **Sizes (confirmed):** tiles are exported as **32x32 px** canvases (Pixelorama-style isometric tileset, "high top-down" preset, 45 degrees, thickness 0 = flat). The diamond occupies the full 32 px width and 16 px height (2:1), so the grid transform uses `tileW = 32`, `tileH = 16`. Characters and monsters are **32x32 px** with origin at bottom-centre (feet on the diamond centre). Bosses can use 64x64 and span 2x2 tiles. Tile variety (plain, mossy, flowers, dirt, road, rock...) is a set of interchangeable 32x32 tiles per biome, picked per tile with the seeded RNG. Exact rules go into `docs/art-spec.md`.
- **Sprite sheet layout:** one PNG atlas per biome for tiles; one atlas per unit with named frames `idle`, `attack`, `hurt`, `cast`, `death` (SE-facing, flip in code). Frame names and anchor are the contract between art and code.
- **Palette:** one shared limited palette (target ~32 colours; the reference's deep greens, warm skin tones and muted reds fit) so tiles, units and VFX stay consistent and can be lit/tinted per scene. Per-region extensions allowed later.
- **Rendering:** the canvas keeps an internal resolution and is integer-scaled with `image-rendering: pixelated` (pick the largest integer scale that fits the viewport: ~1x on small portrait phones, 2x on large phones/landscape/tablets, 3-4x on desktop). See "Replay camera" for zoom/pan; sprite origin = bottom-centre ("feet") so it sits on the tile centre; assets packed into texture atlases (e.g. TexturePacker/Free Texture Packer) with JSON for PixiJS.
- **Placeholders:** the engine and viewer ship with coloured-diamond tiles and silhouette sprites so code is never blocked on art.

### Replay camera
- **Zoom:** pinch (touch), mouse wheel, and +/- buttons. Zoom steps are integer pixel scales (1x, 2x, 3x, 4x...) so pixel art stays crisp; a **"fit arena"** button picks the largest integer scale that shows the whole arena, falling back to a fractional scale only if even 1x does not fit.
- **Pan:** drag/grab the scene (finger or mouse) to move around; the camera is clamped so the arena can't be dragged fully off screen. Smooth inertia on release.
- **Modes:** `free` (default after the user touches the camera), `auto-fit` (whole arena, used at start), `follow` (camera glides to the acting unit, optional toggle). Any manual drag/zoom switches to `free`; a "recenter" button returns to auto-fit.
- **Pure client concern:** camera state is not part of the log or the engine. Tapping a unit shows its HP/status panel; zoom and pan state can be remembered in local storage per device.
- **Same camera** is reused for the world hex map (pan/zoom/grab) so there is one input layer in PixiJS.
- Playback controls sit beside it: play/pause, 1x/2x/4x speed, skip to end, scrub by round.

### Accounts and access (decided)
- **Sign-in:** email + password and Google login, both linkable to one account (match by verified email, explicit "link" step for safety). Passwords hashed with argon2id; session via httpOnly, secure, SameSite cookie (server-side sessions in Postgres, revocable). Email verification and password reset need a transactional email provider (e.g. Resend/Postmark/SES).
- **2FA (optional, user-enabled):** TOTP authenticator app with recovery codes; passkeys (WebAuthn) as a later add-on. Required for cash-shop purchases and account email changes once the shop exists (recommendation).
- **Beta access:** invite-code registration. Codes are single-use or limited-use rows (`invite_codes`: code, uses_left, created_by, expires_at) that you generate from an admin script. Open registration later = flip a config flag; add rate limits, email verification and CAPTCHA at that point.
- **Slots per account:** **1 solo party + 2 multiplayer group slots**. Extra slots are sold in the **cash shop** later (store as entitlements: `account_slots` by type, so the limit is data, not code). A multiplayer slot is used when you have a character in a group, whether you created the group or joined a friend's. **Hardcore parties use the same slots** as standard ones (mode is chosen when a party is created). A hardcore party that is permanently lost frees its slot, so the player can start a new party in it; the dead party stays in the graveyard record.
- **Shop guardrail (recommendation):** sell slots, cosmetics, and convenience only; avoid selling power or gold, which would break the leaderboard and seasons. Payments through a provider (Stripe/Paddle), never handling card data yourself. Not in the MVP.
- **Friends and party invites (post-MVP, needs M-social):** friends list with requests (by username or friend code), then invites to a group from the friends list. Group owner can also remove members and transfer ownership. Needs tables `friendships`, `party_invites`, notifications, and block/report. The MVP is solo-only, so friends/invites come after the core loop.
- **Usernames:** unique display name chosen at signup (profanity check), separate from email; shown on leaderboards and party screens.
- **Security basics:** rate limiting on login and signup, lockout/backoff, audit log for logins, CSRF protection, all game actions authorised server-side by party membership.

### Database (core tables)
users, characters, parties, party_members, items, bags (personal 10 / party 40), ai_rules (priority, condition, action, target), skills_unlocked, skill_usage_counters (for Skyrim-style unlocking), orders (+ votes later), party_state (position, activity, hp/mana, next_tick_at), combat_replays (party_id, slot, engine_version, blob), event_feed, seasons, leaderboard_snapshots.

## 3. UI / UX
- Mobile-first, portrait layout, big touch targets; desktop gets multi-panel layout.
- Canvas rendered at low internal resolution (e.g. 320x180 or 270x480) and integer-scaled with `image-rendering: pixelated`, so pixel art stays crisp on any screen.
- Screens: Party home (status + feed), Replays, Characters (equipment, attributes), AI editor (FFXII-style gambits, drag to reorder), Skills, Bag, Orders/Quests, World map (hex, pan/zoom), Leaderboard.
- Dark-fantasy look: limited palette (~32 colours), heavy vignette, candle/torch lighting shader on the combat canvas, serif/blackletter UI font accents.
- Combat presentation: 2.5D isometric-ish square grid, sprite swing movement ("South Park" slide), VFX as small sprite sheets and particles, speed controls (1x/2x/skip), tap an entry in the feed to watch.
- Push notifications (web push) for defeat, quest done, bag full.

## 4. Milestones

**M0 - Foundation (1-2 wks)**
Monorepo (pnpm workspaces), TS config, lint/test, Docker Compose, Postgres + migrations, CI, account auth (email + password, argon2, sessions).

**M1 - Combat engine (3-4 wks)** *(most important, no UI needed)*
Seeded RNG, grid, turn order, attributes/derived stats, basic skills, AI gambit evaluator, EOT effects, event log format, CLI to simulate fights and print the log, unit tests + determinism tests, balance simulator (run 10k fights).

**M2 - Replay viewer (2-3 wks)**
PixiJS combat scene playing a log with placeholder sprites; slide movement, VFX hooks, speed controls; mobile layout.

**M3 - Tick loop + world (3 wks)**
Hex map data + loader, party state machine, worker with scheduler, hunting loop in zones, XP/leveling, loot + bag overflow rules, rest/defeat -> city + gold loss, replay ring buffer.

**M4 - Management UI (3-4 wks)**
Character creation (race/class), equipment, attributes, AI editor, skill assignment, bag/favorites/sell, activity feed.

**M5 - Orders and quests (2-3 wks)**
Quest log, go-to-location orders, queue and priority, first dungeon + boss that unlocks a region, teleport between cities.

**M6 - Closed beta (2 wks)**
Content pass (first 2 regions, ~30 monsters, ~100 items), balance to the 45-day-to-100 target using simulator, VPS deploy, backups, monitoring, friends playtest.

**Later:** shared parties + order voting, PvP events and city arena, hardcore mode, leaderboard + seasons, skill-tree unlocking depth, more races/classes, AWS migration.

## 5. Risks and mitigations
- **Balance for 45 days to level 100**: build the simulator in M1 and tune XP curves with data, not guesses.
- **Content volume** ("huge world"): data-driven content in JSON, procedural monster/loot affixes, tooling to validate content.
- **Engine changes breaking old replays**: accepted and handled by design. Replays store `engine_version` + `log_format_version`; incompatible old ones expire (see "Versioning"). Avoid needless format bumps and prefer deploying format changes when few replays matter.
- **DB growth**: replay cap per party, gzip, partition/prune event_feed by age.
- **Tick overload**: SKIP LOCKED workers, jitter, per-tick time budget, metrics on tick duration.
- **Cheating/botting**: all logic server-side, rate limits, no client authority.
- **Art throughput** (you are making all sprites): define a sprite spec early (sizes, palette, frame set) and ship placeholders so code is never blocked on art.

## 6. Open questions
See the chat; answers will be folded into this file.
