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
- **Loot:** each monster/boss has a loot table (item level scales with monster level, rarity weights, chance for gold). Rolls use the fight's seeded RNG so loot is reproducible from the log. Items drop into the party bag (40 slots) or the character's bag; when full, nothing more is picked up and a "bag full" line shows in the feed (changed in 3c: there is no automatic discard).
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
- **World map tiles:** hex **pointy-top**, 32x32 canvases, same 45 degree high top-down view and 0 thickness as arena tiles (generated with the Pixel Lab Tiles tool). The hex grid uses odd-r offset coordinates; site markers (city, dungeon, boss dungeon) are 32x32 object sprites placed over a terrain hex. Obstacles in combat (rocks, pillars, trees) are object sprites, not floor tiles. Prompts and settings live in `docs/art/tile_art.md` and `docs/art/characters_art.md`.
- **Placeholders:** the engine and viewer ship with coloured-diamond tiles and silhouette sprites so code is never blocked on art.

### Replay camera
- **Zoom:** pinch (touch), mouse wheel, and +/- buttons. Zoom steps are integer pixel scales (1x, 2x, 3x, 4x...) so pixel art stays crisp; a **"fit arena"** button picks the largest integer scale that shows the whole arena, falling back to a fractional scale only if even 1x does not fit.
- **Pan:** drag/grab the scene (finger or mouse) to move around; the camera is clamped so the arena can't be dragged fully off screen. Smooth inertia on release.
- **Modes:** `free` (default after the user touches the camera), `auto-fit` (whole arena, used at start), `follow` (camera glides to the acting unit, optional toggle). Any manual drag/zoom switches to `free`; a "recenter" button returns to auto-fit.
- **Pure client concern:** camera state is not part of the log or the engine. Tapping a unit shows its HP/status panel; zoom and pan state can be remembered in local storage per device.
- **Same camera** is reused for the world hex map (pan/zoom/grab) so there is one input layer in PixiJS.
- Playback controls sit beside it: play/pause, 1x/2x/4x speed, previous/next round (jump through turns), scrub by round/turn, skip to end. Pausing keeps the camera free so the player can zoom and pan on a frozen frame. The player can **rewatch any stored replay at any time** from the Replays list (see "Return flow").

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
users, characters, parties, party_members, items, bags (personal 10 / party 40), ai_rules (priority, condition, action, target), skills_unlocked, skill_usage_counters (for Skyrim-style unlocking), orders (+ votes later), party_state (position, activity, hp/mana, next_tick_at), combat_replays (party_id, slot, engine_version, log_format_version, blob), event_feed (ordered ids, type, payload, optional replay ref), user_party_seen (user_id, party_id, last_seen_event_id), seasons, leaderboard_snapshots.

## 3. UI / UX
- Mobile-first, portrait layout, big touch targets; desktop gets multi-panel layout.
- Canvas rendered at low internal resolution (e.g. 320x180 or 270x480) and integer-scaled with `image-rendering: pixelated`, so pixel art stays crisp on any screen.
- Screens: Return slideshow, World map (hex, pan/zoom) with the party, Management menu (below), Replays, Leaderboard.

### Return flow (catch-up slideshow)
- When a player comes back, the game shows everything that happened since their last visit as a **slideshow, one item at a time**, oldest first: fights (played as replays), arrivals, dungeon stage progress, loot and level-ups, rests, random events, defeats, quest completions.
- **Skip controls:** "skip this one" (go to the next item) and "skip all" (jump straight to the world map). Fights can be paused and jumped through turn by turn like any replay. Skipped items still land in the feed, so nothing is lost.
- Items that have no animation (travel, rest, loot) show as short cards with the key result, auto-advancing or tap to continue; consecutive boring items can be grouped into one card ("Travelled 4 hexes, rested twice").
- **Seen tracking:** each user stores a `last_seen_event_id` (per party) on the server, advanced as items are shown or skipped, so the slideshow works across devices and survives reloads. Long absences collapse routine items and show a summary card plus the notable ones (bosses, defeats, rare drops, level-ups).
- **Replays list:** a screen with the stored replays (last 100 + pinned) so any fight can be rewatched later; expired ones (see "Versioning") show a text summary instead.
- After the slideshow the player lands on the **world map hex view** with the party marker, current activity, and the progress line.

### Management menu
Opened from the world map. Tabs:
1. **Character:** attributes, equipment, skills (assign and manage), level-up points. One character at a time with a switcher.
2. **AI:** the gambit editor (priority list of condition, target, action per character).
3. **Party overview:** all characters side by side with their items, key stats, HP/mana.
4. **Bag:** the shared party bag (40 slots) and the personal bag (5 slots), favorites, discard rules.
5. **Orders:** quest log, order queue and priority (voting once multiplayer exists), add new quests or go-to-location orders.
6. **City** (only available while the party is in a city): sell items, buy things, teleport to other cities, bank, and later the arena.

On phones the menu is full-screen with a bottom tab bar; on desktop it is a side panel next to the map.
- Dark-fantasy look: limited palette (~32 colours), heavy vignette, candle/torch lighting shader on the combat canvas, serif/blackletter UI font accents.
- Combat presentation: 2.5D isometric-ish square grid, sprite swing movement ("South Park" slide), VFX as small sprite sheets and particles, speed controls (1x/2x/skip), tap an entry in the feed to watch.
- Push notifications (web push) for defeat, quest done, bag full.

## 3b. Inventory revamp (planned, decided with the user)

Goal: replace the list-style Character/Bag/Party tabs with a Baldur's Gate style inventory screen.

### Decisions
- **Top tabs:** Inventory, Attributes, Spellbook, Quests/Orders, AI, plus City while in a city. Inventory shows gear only; attribute points and the stat breakdown live in the Attributes tab (a table of every character's stats side by side, plus point spending). Spellbook lists each character's skills.
- **Team strip on top:** portrait, name, level and HP/mana bar for every member. It scrolls sideways if crowded. Tapping a portrait selects the character.
- **Character panels:** the sprite in the middle, equipment slots around it (weapon, offhand, head, body, feet, ring, charm: 7 for now; the layout is data driven so more slots can be added later). Desktop shows as many panels side by side as fit; phone shows one at a time and swipes.
- **Personal bag:** 5 slots under each character, owner only, and its items are never lost on defeat. (Replaces the old 10.) Solo players can use it freely.
- **Shared bag:** 40 slots below the panels. Size is `party.bagSize`.
- **Icons:** 32x32 item sprites at `apps/web/public/sprites/items/<base name slug>.png`, scaled with crisp pixels (whole steps) to fit. Until they exist, generated placeholders: rarity-colored tile with a slot glyph. The character figure is a placeholder silhouette colored from the class and race palettes in `docs/art/characters_art.md`; a real 32x32 sprite replaces it automatically.
- **Item details:** hover on desktop, tap on phone, shows a card with name, rarity, level, slot, bonuses, value, favorite state, and a **comparison with the item currently worn** (green better, red worse).
- **Moving items:** drag and drop between the shared bag, personal bags, equipment slots and the character panel (dropping on the character picks the slot). Right click or double click equips or moves. On phone: tap the item, then use Equip / Move to personal bag / Favorite / Discard on the card. Pointer events so one code path serves mouse and touch.
- **Sort button** for the shared bag (favorites, rarity, level, slot). Favorites and discard rules are unchanged.

### Steps
1. **(done) World (`packages/world`):** `Member.bag` (personal, max `personalBagSize` = 5), actions to move items shared <-> personal <-> equipment <-> other members' equipment, personal items excluded from defeat item loss and from overflow replacement, `normalizeParty` backfills `bag: []`. Make `bagSize` a party field set when created (base 40) so the bag item below can raise it. Tests.
2. **(done) Server (`apps/server`):** endpoints for move/equip between containers (reuse the `mutateParty` lock), owner check for personal bags (user to member mapping, solo owns all), summary and shared types updated. Tests.
3. **(done) Web foundation:** `ItemIcon` (sprite or placeholder), `ItemCard` (details and comparison), pointer-based drag and drop helper with tap fallback, `Slot` and `BagGrid` components.
4. **(done) Inventory screen:** team strip, character panels with slots and silhouette, personal bag, shared bag, sort, phone swipe layout.
5. **(done) Attributes and Spellbook tabs:** move point spending and the stat breakdown out of the old Character tab; add the team comparison table; spellbook list. Retire the old Character, Party and Bag tabs.
6. **Verify:** tests, then check in the browser at phone and desktop sizes (drag with mouse, tap flow on phone).

### Not in this revamp
Group accessories and bag items (see backlog), real item sprites, extra slots (gloves, cloak, belt, amulet, second ring) which need new bases, loot tables and balance.

## 3c. Inventory polish, per-character gold, carrier pet (planned, decided with the user)

### Decisions
- **Level is the party's:** the inventory shows only name, race and class per character (no level, no stats). Attributes live in the Attributes tab.
- **Gold is per character**, shown to the right of the name on each panel. Battle, quest and sale gold is split evenly among living members (remainder to the first). Existing party gold is split evenly on migration. Defeat gold loss applies to each member's own gold.
  - Solo (one player owns every character): buying draws from all characters' gold, richest first. Multiplayer: only your own characters' gold.
  - A player can send gold to any character in the party.
- **Multiplayer rules, modelled now:** `Member.ownerId` (every member belongs to the party owner today). Your characters are always listed first; you can look at the others but only move items, spend or send gold for your own. Enforced on the server.
- **No automatic discard:** when the shared bag is full, new loot is not picked up (nothing goes to personal bags either) and a "bag full" event is logged. Players must discard, sell in a city (standing on a city hex or any hex next to one), or send the carrier pet. Quest items (and later unique items) are never lost: gold and XP are paid at once and the item waits in `pendingItems` until the shared bag has room, then arrives by itself (event `items_delivered`). Random loot that does not fit is lost.
- **Layout (1080p, no page scroll):** the Inventory screen fits the window; only the shared bag scrolls vertically and it takes all the leftover space. Character panels are narrower so the personal bag lines up with both sides of the figure. The team strip shows portraits only and fits the width without a sideways scrollbar.
- **Tab "Caravan"** (group accessories): mount, carrier pet, extra bag, improved tent and similar. Phase B.

### Phase A (steps)
1. **(done) World:** `Member.gold`, remove `PartyState.gold` (migration in `normalizeParty`), even split in loot/quest/defeat, `Member.ownerId`, no auto-discard when the bag is full (event `bag_full`), `sendGold(from, to, amount)`, spend helpers (solo vs multiplayer) used by buy, upgrade and the rest. Tests.
2. **(done) Server and API:** `POST /parties/:id/send-gold`, owner checks on moves, gold, sell and buy, summary exposes per-member gold and `ownerId`/`mine`. Tests.
3. **(done) Web inventory layout:** drop level and stats from panels, gold beside the name, narrower panels with personal bag aligned, portrait-only team strip filling the width, full-height layout where only the shared bag scrolls, own characters first, others disabled. Send-gold dialog.
4. **(done) Other screens:** City and Attributes tabs use per-character gold, bag-full message in the log and party home. Verify at 1080p and phone sizes.

### Phase B (steps; done, see "Phase B notes" below)
5. **Caravan tab and accessory items:** slots for mount, pet, bag item, tent; items with tiers and special attributes; obtained as reward, drop or purchase.
6. **Bag item:** raises `party.bagSize` by its tier.
7. **Mount:** faster world map movement and optional extra bag slots.
8. **Tent:** faster healing.
9. **Carrier pet:** own bag; any player sends it to the nearest city with items to sell and a shopping list. While it travels, the party cannot buy or sell (the city actions are blocked). It sells, buys what was asked, returns, and its goods go to the shared bag as space allows (otherwise it waits holding them until someone frees space). If the party is defeated while the pet is out, the pet is teleported to the city where the party respawns and delivers when there is space. Stats: speed, bag size, discount, special abilities.
10. **Verify:** tests and browser check.

### Phase B decisions (from the user)
- **Pet shopping:** the pet shows the same shop as the city. Each item picked is paid from the gold of the characters you could spend from (solo: all; multiplayer: yours), and also from the sale proceeds: the proceeds are split evenly among all members (rounded down), and each player's share can pay for that player's purchases.
- **Accessories are items:** every accessory (mount, pet, bag item, tent) is a rare item at its core. It lives in a shared bag slot, can be sold, sometimes bought (mostly earned from quests), and equipped or swapped. They are shown in the Caravan tab, not in the inventory grid view, for now (they still take a shared bag slot while not equipped).
- **Sale rate:** items sell for 20% of their buying value by default. A pet only adds to it: first tier +0%, then +5%, +10% and so on, up to +30% at the top (50% total). Special abilities are per pet, for example: may find an item on the way back, a speed burst for x ticks on reaching the city, and more later.
- **Sale money** goes to every member, shared evenly, rounded down (the remainder stays with the first member).

### Draft tier tables (to confirm or change)
Five tiers per accessory; values are starting points to balance later.

| Tier | Pet sale rate | Pet bag | Pet speed | Mount world speed | Bag item (shared bag) | Tent healing |
|---|---|---|---|---|---|---|
| 1 | 20% (+0) | 10 | x1.0 | +10% | +5 slots | +25% |
| 2 | 25% (+5) | 15 | x1.1 | +20% | +10 | +50% |
| 3 | 30% (+10) | 20 | x1.25 | +30% | +15 | +75% |
| 4 | 40% (+20) | 30 | x1.5 | +40% | +20 | +100% |
| 5 | 50% (+30) | 40 | x2.0 | +50% | +30 | +150% |

Pet abilities start at tier 3 (one ability), tier 5 has two. Mounts may also add personal or shared bag slots at higher tiers.

### Phase B notes (what exists now)
- Accessories are items (`Item.caravan` = kind, tier 1 to 5, pet abilities) kept in the shared bag until equipped from the Caravan tab; one per kind in `PartyState.caravan`. Names and tier tables (`caravan-data.ts`, also sent to the client as `caravanTiers`): pet sale rate 20/25/30/40/50% of the price, pet bag 10/15/20/30/40, speed x1/1.1/1.25/1.5/2, mount +10..50% travel speed, bag item +5/10/15/20/30 shared slots, tent +25/50/75/100/150% faster recovery. Tier 3 pets have the scavenger ability (30% to find a drop on the way home), tier 5 also swift (the way back takes 60% of the time).
- Effects: `bagCapacity` adds the bag item's slots (it cannot be removed or swapped for a smaller one while the bag holds more than the base size); the mount shortens every hex step (`travelTicks`); the tent shortens rests.
- Pet trips (`caravan.ts`): `sendPet` takes shared-bag items to sell and a shopping list of the nearest city's shop stock ids. The sale (item value x rate / 0.25, so a tier 1 pet sells for 20% of the price and the city for 25%) is split evenly with the remainder to the first character; the shares of the characters the sender controls pay for the shopping first, the rest comes from the sender's spendable gold. Everything is reserved on departure, the sale is paid out when the pet reaches the city, and the goods wait in `pet.waiting` until the shared bag has room (`deliverPetGoods`, run every step). Trips are settled lazily by `settlePet` on every update, also while the party is busy. City selling and buying are blocked while the pet is out; the pet cannot be unequipped while out or holding goods. A defeated party recalls the pet to the respawn city, where it finishes at once.
- Obtained from: quest rewards (`QuestReward.caravan`: Pest control gives a tier 1 pet, Archers' toll a tier 1 bag item, The Goblin King a tier 2 mount, Into the crypt a tier 3 tent) and rare drops (1.5% of drops, tier rises with monster level).
- API: `POST /parties/:id/caravan/equip` and `/unequip`, `GET /parties/:id/pet/shop`, `POST /parties/:id/pet/send`; the summary has `caravan`, `caravanEffects`, `caravanTiers` and `pet`. UI: Caravan tab with the four slots, accessories in the bag, and the pet panel (status with countdown, goods waiting, items to sell, shopping list with quantities, totals and the send button).
- Verified in the browser at phone width: equip, effect text, send with a sale and a shopping list, trip status and countdown.
- Not done: buying accessories in shops (planned as rare), mounts adding bag slots, pet abilities beyond the first two, the pet using personal bags, a tent or mount sprite, and the trip taking the party's current distance into account while the party moves (the trip length is fixed at departure).

## 3d. Combat rebuild (planned, decided with the user)

Goal: a combat system that mixes Baldur's Gate 3 (action economy, opportunity attacks, weapons and spells with requirements, school feel) with Divinity: Original Sin 2 (damage types, resistances, big readable numbers), able to scale from level 1 to level 100. This replaces the "Unit turn", AC-less stat formulas and gambit rules of "Combat rules (decided)" and the skill/class part of M1-M4. It is built in 6 phases, each one verified and confirmed before the next starts.

### Decisions
- **Saves:** the game is pre-release, so all parties, replays and feed history are reset when the rebuild lands (no migration code). `LOG_FORMAT_VERSION` goes to 2 and `ENGINE_VERSION` to 1.0.
- **Hit and damage:** a hit chance (accuracy vs evasion, shown in the UI) and a damage range, not dice. Crits stay. No armor class and no armor/magic-armor layers: protection is resistances.
- **Turn:** rounds, units act in speed order (as now). Each unit has a **movement action** (move up to `Move` tiles, may be split before and after the combat action) and a **combat action** (one skill, weapon attack or item), plus **one reaction per round** used for opportunity attacks. Some skills are free (cost no action) or grant extra movement or a retreat.
- **Grid:** 8 directions. Adjacent means any of the 8 neighbours, a diagonal step costs 1, range is measured in tiles (Chebyshev), line of sight stays supercover. Leaving a tile adjacent to an enemy that has its reaction, is not stunned and has a melee attack provokes an opportunity attack (a normal weapon attack). Retreat/disengage skills do not provoke.
- **Damage types (10):** physical: piercing, smash, cut, blood (the user's list had "cut?" and blood; confirm blood vs a magic type when we get to skills). Magical: fire, water (water and ice), electric, earth (earth and poison), dark, light.
- **Resistances come from armor** (and some skills, statuses, monsters). Each armor piece gives resistance points by type, depending on its base (plate: cut/piercing/smash, robe: magical types). Resistance percent = points / (points + K(level)), capped (start at 75%), negative values allowed (vulnerability). One curve table, so level 1 and level 100 both feel meaningful without a hard wall.
- **Hit chance:** a ratio of accuracy to evasion, tuned so equal accuracy and evasion at the same level hits about 85%, never below 5% or above 95%. Spells hit automatically unless tagged as dodgeable projectiles; they are mitigated by resistance. Numbers live in the curve table.
- **Damage:** `weapon or spell base (scales with level and item level) x skill multiplier x (1 + attribute bonus) x roll in the skill range x crit`, then reduced by the target's resistance for that type. Items can add **extra damage entries** (a fire sword adds fire damage), each resisted on its own.
- **Scaling targets (checked by tests):** level 1 about 50 HP, level 100 about 5,000 to 10,000 HP depending on the class; hits at level 1 around 5-15, at level 100 in the hundreds to low thousands. Attributes, level and item level all feed one `scaling` table.
- **Attributes (BG3 flavour):** Strength raises sword, axe, hammer and heavy melee damage. Dexterity raises dagger, bow and crossbow damage plus accuracy, evasion, speed and crit. Intelligence raises arcane schools (fire, water, electric, earth). Wisdom raises divine/healing and light, mana regeneration and spirit effects. Vitality raises health and physical resilience. Each school names its primary attribute, so adding schools is data.
- **Classes in this version:** warrior, mage, priest, ranger, and a new **rogue** (more movement, dagger and bow, retreat skills). Warlock, shaman and monk stay in the art doc for later.
- **Items:** slots: main hand (one-handed or two-handed), off hand (shield, tome, one-handed), helmet, body, feet, ring, charm, with room for gloves, cloak, belt, amulet later. Items have requirements (level, attributes), give attributes and resistances, weapons have a damage range, damage type, school and range. Replaces the 7-slot model and the old `defense` bonuses.
- **Schools and learning:** every skill belongs to a school (sword, axe, hammer, dagger, bow, fire, water, electric, earth, dark, light to start). Each character has a level per school that grows from **school XP gained by using that school's skills**. A class gives starting schools, starting points and starting skills, but **any character can learn any school**. A skill unlocks at a school level and may also need a prerequisite skill used N times. Most weapon skills **need the right weapon equipped** to be used and to earn school XP (a mage can know a dagger skill but only progresses it holding a dagger). **Books** teach a skill: common books teach basic skills of any school, rare books can teach any skill but still need a minimum school level.
- **AI rules (rebuilt):** each rule is `target` (self, enemy, ally), `target condition` (none, closest enemy, farthest enemy, most crowded enemy, closest ally, farthest ally, ally with most strength, ally with least armor, lowest health, ...), `special conditions` (none, own health below/above X%, enemy at full health, enemy has status X, ...) and `action` (skill, item, weapon attack). **Movement is its own node** that can be linked to a rule to run before or after its action (move toward the target, keep a preferred range, retreat). Defaults: ranged and caster classes try to step back from close enemies, weighing the opportunity attacks it would provoke, and prefer a retreat skill (for example "if an enemy is adjacent, use a skill that retreats and damages") when they have one. Fallback is a weapon attack.
- **Character sheet (Attributes tab):** your characters first, a strip on top to choose one (like the inventory). The sheet has the main details on the left and the sprite on the right; further sections run down both sides and scroll, with the sprite and key info pinned on top while scrolling. Sections: attributes with sources, combat stats (health, mana, movement, initiative, accuracy, evasion, crit), the 10 resistances, school levels, skills, active conditions.

### Phases
1. **(done) Combat core (`packages/engine`):** unit state with movement and action economy, reaction and opportunity attacks, 8-direction grid and pathing, damage types and resistances, hit chance, damage ranges, extra damage entries, the `scaling` curve table, new event log (format 2) and the replay viewer updated to match (splits move/act, shows hit chance, damage type colours, opportunity attacks). Old AI is adapted just enough to run until phase 3. Tests for every rule and for the level 1 and 100 targets.
2. **(done) Items and gear (`packages/world`, shared, web):** new slots and hand types, requirements, resistances and attributes on items, weapons with damage range/type/school, extra damage affixes, loot and shop rebuilt, rarity scaling to level 100, inventory screen updated (two-handed handling, requirement checks, resistance lines in the item card).
3. **(done) AI rules and editor:** the new rule model, movement nodes linked to rules, kiting and retreat defaults weighing opportunity attacks, validation, and the AI tab rebuilt with the new conditions.
4. **(done) Schools, skills, learning, classes:** school data and levels, school XP, weapon requirements, prerequisite and book learning, skill catalogue for the starting schools, the five classes with starting schools and skills, monsters rebuilt with attributes, resistances and weapons.
5. **(done) Character sheet UI:** the Attributes tab described above, Spellbook updated to schools and unlock progress.
6. **(done, first pass) Content and balance:** the level 1 to 100 curve for characters and monsters, zone and dungeon levels, loot tables, a balance simulator report (time to level, survival per level, damage per level), and tuning.

### Phase 1 notes (what exists now)
- Engine: `scaling.ts` holds every level-dependent number (`SCALING`: HP, damage growth, attribute bonus, resistance curve, hit chance). `SkillDef` now has `source` (weapon or spell), `attr`, optional `damageType`, `dodgeable`, `free` and `retreat`. `UnitDef` has `weapon`, `extraDamage` and `resist`.
- Turn: movement pool (`movesLeft`), one action, one reaction per round. Free skills chain. Walks are logged in pieces and split where an opportunity attack interrupts. Retreat skills disengage for free. Ranged units pick standing tiles by safety versus the opportunity attacks on the way, and step back after shooting when worthwhile (`ai.ts` constants `SAFETY_WEIGHT`, `THREAT_WEIGHT`).
- Log format 2 (engine 1.0.0): `damage` carries `type`, `resist`, `chance`, `extra`; `miss` carries `chance`; `skill` can be a `reaction`; `move` can be a `retreat`. Old replays expire.
- World: classes and monsters get a placeholder weapon type and armor shares (`armorResist`) until phase 2 puts resistances on items. Monster power retuned to 1.3; real tuning is phase 6. The character summary now reports accuracy, evasion, crit, speed and move instead of attack/defense.
- Viewer: damage numbers are coloured by type with the resisted share, misses show the hit chance, opportunity attacks are labelled.

### Phase 2 notes (what exists now)
- Items (`packages/world/src/loot.ts`): `Item` and `ShopItem` carry `GearStats`: `requires` (attributes), `kind` (sword, dagger, axe, mace, hammer, staff, bow), `hands` (1 or 2), `weapon` (type, min, max), `extra` (extra damage entries) and `resist` (points per damage type). Bases (`BASES`) declare weapon quality or the armor types and share of a full set (body 0.4, off hand 0.25, head 0.2, feet 0.15); a full set gives about `armorPoints(level)` points of each type it covers. Rarity multiplies damage and resistances (1, 1.1, 1.25, 1.45). Rare and epic weapon drops roll one elemental extra-damage entry (20% or 35% of the weapon's damage) and are named after it ("Flaming ..."). Shop items are deterministic, without extra damage.
- Requirements: 40% of the item level in the base's attribute (heavy armor and weapons only), checked against base plus spent points, never against other gear. Two-handed weapons need a free off hand and an off hand needs a one-handed weapon. Swaps between two characters check both sides. Error codes `requirements` and `two_handed`.
- Characters: class `kit` (item base names) is worn from the start, so there is no class armor or weapon placeholder any more. Unarmed members hit as a half-quality smash weapon. `memberGear` sums the worn weapon, extra damage and resistances for the fight; monsters still use their template shares.
- UI and API: `MemberInfo.combat` (weapon, extra, resistances as points and percent), item cards and shop entries list damage, hands, resistances and requirements, the Attributes tab has a weapon and resistances section.
- Balance after gear: a 24 hour demo run loses about 10% of fights at levels 1 to 8 (was about 20% with the placeholders). Real tuning is phase 6.
- Not done yet: the inventory could grey out gear the character cannot wear (the server refuses it with a message), items have no school (phase 4), and drops have no level requirement.

### Phase 3 notes (what exists now)
- Rule model (`AIRule`, engine `types.ts`): `skill` (a skill id or `weapon_attack`, the unit's basic attack), `order` (target pick: nearest, farthest, crowded, lowest_hp, highest_hp, lowest_hp_pct, strongest, least_armor), `filter` on the target (health below/above, full health, has/lacks status), `when` on the unit and field (own health below/above, mana above/below, has/lacks status, enemy adjacent yes/no, at least N enemies), and `move` (`before` or `after`, mode toward, away, range, stay). Who the rule targets (self, enemy, ally) comes from the skill.
- Planner: a `before` move changes how the standing tile is chosen (toward = melee scoring, away/range = ranged scoring weighing opportunity attacks, stay = only from the current tile); an `after` move uses the movement left (`planAfterMove`). Without a move, ranged units still kite after attacking and retreat skills still retreat. `stay` also stops the automatic kite.
- World validates and cleans every field (`validateAiRules`, `cleanRule`); the mage default now aims fireball at the most crowded enemy.
- UI: the AI tab has Target, Only when and Movement sections per rule, a plain-language summary line, and is look-only for characters that belong to another player.
- Not done: item actions (no consumables yet), a standalone movement node with no skill, and conditions on allies as a group (for example "an ally is below 30%").

### Phase 4 notes (what exists now)
- Content: `packages/world/src/skills.ts` is the skill catalogue (about 30 skills) and the school table. Schools: sword, axe, hammer (mace too), dagger, bow, fire, water, electric, earth, dark, light; school level 1 to 20 from experience (`schoolXpForLevel`). `SkillDef` (engine) gained `weapons` (kinds that must be in hand), `school`, `unlock` (school level, optional prerequisite skill and number of uses) and `bookOnly`. Staffs train no weapon school.
- Training (`learning.ts`): after each fight, every skill use by a member counts. Spells train their own school; weapon skills train the school of the weapon held, so a dagger skill never progresses with a bow. A school opens when a class starts with it or the character first trains in it (the basic Attack with an axe opens axe). When the school level and the prerequisite uses are met the skill is learned automatically and the feed says so (`skill_learned`).
- Engine: units carry `weaponKind`; planning skips skills whose weapon is not in hand, and the basic weapon attack and opportunity attack pick the first skill the weapon allows. Monsters hold a natural weapon so their skills work.
- Books: `Item.teaches`; 10% of drops are books (higher levels bring more advanced skills; book-only skills such as Chain Lightning are rare). Basic skills (unlock level up to 2) need no school level; others need the unlock level minus one. `learnFromBook` and `POST /parties/:id/learn`; the Spellbook tab lists books you can read.
- Classes: Rogue added (move 5, dagger kit, Stab, Quick Cut (free), Vanish Strike (retreat), Shoot; AI uses Vanish Strike when an enemy is adjacent). Each class lists its starting `schools`. Existing parties must be reset (member fields `schools`/`uses` are backfilled, but old skill ids and balance are not preserved).
- UI: Spellbook shows schools with progress bars, known skills grouped by school, locked skills with what is missing, and books with a read button. Create-party accepts the Rogue.
- Not done: books in shops or quest rewards, skills from monsters' schools (dark/earth/water have one starter skill each), school levels in the Attributes sheet (phase 5), tuning of school XP pace (phase 6), item actions for the AI, skill upgrades past school level.

### Phase 5 notes (what exists now)
- The Attributes tab is now one character at a time: the portrait strip on top (your characters first, others look-only), then a card with name, race, class, HP and MP bars, points to spend, and the sprite on the right. The strip and that card are pinned while the sections below scroll.
- Sections (two columns from 820px, one on phones): Attributes with sources (base, spent points, gear) and the plus buttons, Combat (accuracy, evasion, crit, speed, move, weapon, extra damage, condition), Resistances (physical and magical, percent and points), Schools with progress bars, and Skills as chips (details stay in the Spellbook tab). The selected character is shared with the Inventory, Spellbook and AI tabs.
- Conditions: only Fallen, Hurt, Scratched and Healthy for now, since status effects exist only inside fights.
- Not done: items worn shown on the sheet (the Inventory tab has them), skill points beyond attributes, real phone hardware test.

### Phase 6 notes (what exists now)
- Balance tooling: `packages/world/src/balance.ts` (`partyAtLevel`, `runLevel`) builds a trained party at any level (points spent by class pattern, class kit at that level, schools trained to match, every unlocked skill) and replays seeded fights against the starter world's encounters. `pnpm --filter @game/world balance:levels [--fights 60] [--offset 0] [--rarity common]` prints win %, defeat %, rounds and HP lost for levels 1 to 100. `pnpm --filter @game/world balance` is the older whole-party run.
- Results at the same level (80 fights each, common class-kit gear, full health): defeats 0 to 8%, about 20 to 28% of the party's health lost in a win, 4 to 7 rounds. Monsters 5 levels above are much harder at low levels (level 10: 72% defeats) and only mildly harder near 100. In the full simulation (resting, attrition) a party at levels 1 to 10 loses about 8 to 12% of fights.
- Tuning made: `MONSTER_POWER` 1.7 with `monsterPower(level)` rising to +0.4 near level 100 (characters gain more from gear, schools and skills than monsters do from attributes); `SCALING.hpPerLevel` 0.2 to 0.13 so a level 100 character has about 5,000 to 10,000 health with a full kit (tests check 3,000 to 12,000); school experience curve is 30 x (level - 1)^2 (school level 10 in about 8 days of play, 20 in about 5 weeks).
- Content: the Ashen Hills now run from level 6 to 100, so wild fights stay level-appropriate for the whole climb (monster level is the party level plus or minus one) and the experience penalty for hunting low-level zones does not kick in. XP per level (`xpToNext`) is unchanged: about 2,700 fights to level 100, roughly 64 days at the observed pace.
- Tests (`balance.test.ts`): level 100 health, weapon and resistance sanity for every class, drops keep up with level, and each of levels 1, 5, 10, 25, 50, 75, 100 stays within wide bounds; monsters ten levels higher are harder. The world tests now have a 30 second timeout.
- Not done: zones, quests and dungeons beyond level 10 (the whole high-level climb reuses the same monsters scaled up, with no new bosses, dungeons or sprites), per-class balance (the harness plays one fixed party of warrior, mage, priest and rogue), gear from loot instead of the class kit, and tuning against real play.

### Trade and accessory shops (what exists now)
- Accessories are sold in normal city shops as normal items, at `ACCESSORY_PRICE_FACTOR` (8) times their value (gear is 4 times), so tier 1 costs 320 gold and tier 5 8,000. Each city has a fixed shop plus a rotating stock (`stock.ts`) that renews every UTC day and also every time the party gains a level (levels get slow to earn later, so a level-up is a second reason for new goods): 4 pieces of gear that follow the party's level within a window of 5 levels either side of the city's own level (rarity rolled) and 3 accessories of the city's tier range (`SiteDef.stock`: Oakhaven 1-2, Stonebridge 2-3, the Fen 3, Frostpeak 3-4, the Wastes 4, Shadowmarch 4-5, the Spire 5). The rotation is deterministic from the city, the day and the party level; stock ids carry both, so yesterday's ids and the ones from before a level-up stop working. Stock is unlimited (the price is the limit).
- Trading works anywhere within one hex of a city (`tradeCity`, `TRADE_RANGE`), also while hunting or resting next to it. `tradeItems` sells and buys in one all-or-nothing step: the sale is shared evenly, the shares of the characters you control pay for the purchases first, then your gold; the shared bag must have room after the sale. `POST /parties/:id/city/trade`, `city/buy` and `city/sell` all use it; `GET /city` returns the stock and when it rotates.
- Far from a city the same screen sends the carrier pet: the pet's trip stores copies of the chosen stock, so the goods still arrive after the shop rotated. The pet sells at its own rate (20% to 50% of the price).
- UI: a Trade tab (shown near a city, or when a pet is equipped) laid out like a barter screen: your items on one side (click to offer), the merchant's stock on the other (click to demand, accessories outlined in gold, price on each cell, tooltips with stats), the offer and demand lists in the middle with their values, and a Trade button near a city or Send carrier when far. The City tab now only has resting and teleport; the Caravan tab keeps the slots and the pet's status.
- Not done: selling price differences per city, limited quantities for rotating accessories, sprites for accessories.

### High-level content notes (what exists now)
- The map grew from 14x10 to 14x60: five regions of ten rows each continue south from the Ashen Hills (now levels 6 to 20). In order: Mirewood Fen (21-35), Frostpeak Reach (36-50), Scorched Wastes (51-65), Shadowmarch (66-80) and The Spire (81-100). The first opens when the Old Crypt is cleared, each next one when the previous region's boss dungeon is cleared (so the whole climb is gated like the Ashen Hills).
- Everything for a region comes from one table (`TIERS` in `high-world.ts`): a city with a 16-item shop at the region's middle level, a normal dungeon (3 stages), a boss dungeon (4 stages, 5 in The Spire where The Eternal waits behind the Void Lord) that needs its quest, three wild encounters (vanguard, pack, warband), and four quests (welcome, hunt 12 of the front-line monster, delve the dungeon, slay the boss) with gold, XP, an item and, for the boss quest, a tier 3 to 5 accessory. Terrain is generated deterministically with a road down column 3 and carved paths, so every site is reachable (tested).
- Monsters: 19 new templates (`monsters.ts`, built from six attribute families: tank, skirmisher, archer, caster, knight, boss), each region with three regular monsters and a boss: Bog Hag, Frost Giant, Ash Drake, Death Knight, Void Lord and The Eternal. They have no art yet (the viewer uses its placeholder). New arenas: fen, ice, dunes, spire.
- Tuning (`pnpm --filter @game/world balance:encounters [--own]` lists defeat % and health lost per encounter, per level or at each zone's own levels): AoE casting and stun-lock from regular monsters were far too deadly, so regular casters use single-target spells and only bosses stun or heal; packs are small (a vanguard is 1-2 front-liners plus one ranged unit). At their own levels the new encounters lose 0 to 17% of fights in the harness; the mixed pool at any level loses 0 to 5%.
- The world map view fits the width and a band of 11 rows around the party (a 60-row map shown whole was unreadable) and follows the party until the player pans or zooms.
- Tests (`world-content.test.ts`): zone ranges cover 1 to 100 without gaps, every encounter monster and skill exists, every site is passable, in its region and reachable (and unreachable until the unlocking dungeon is cleared), boss dungeons end on their boss, the quest graph can be completed, shops match their region, and a party hunts and delves in regions 1, 3 and 5.
- Not done: monster and region art, region-specific loot (items still come from the shared base list), new base item types for the high levels (belts, cloaks), the Old Crypt is a normal dungeon that unlocks the Fen (not a boss dungeon), and real play tuning.

### Open for later (the user will add details)
Skill slots and how many skills a character can use in the AI at once, status and condition catalogue, summons and pets in combat, dual wielding, ammunition, skill upgrades past school level, the blood damage type, extra slots, boss mechanics, stealth and surprise, and any BG3 features not named above.

## 4. Milestones

**M0 - Foundation (1-2 wks)**
Monorepo (pnpm workspaces), TS config, lint/test, Docker Compose, Postgres + migrations, CI, account auth (email + password, argon2, sessions).

**M0 - done.** Monorepo, Postgres, migrations, invite-only email/password auth, tests, CI workflow.

**M1 - Combat engine (3-4 wks)** *(most important, no UI needed)* **First version done** (`packages/engine`): seeded RNG, grid + BFS pathing + line of sight, derived stats, data-driven skills and statuses (dot/hot/mod/stun), AI rule planner (priority, filters, self conditions, move-then-act), round loop with EOT effects, versioned event log, CLI simulator and balance tool, 30 tests (determinism, invariants over 150 fights, AI priority, LOS, draw cap). Still to do: XP/loot results, more skill effects, content package, log compaction, tuning formulas.
Seeded RNG, grid, turn order, attributes/derived stats, basic skills, AI gambit evaluator, EOT effects, event log format, CLI to simulate fights and print the log, unit tests + determinism tests, balance simulator (run 10k fights).

**M2 - first version done** (`apps/web`, Svelte + PixiJS + Vite): isometric arena with placeholder units, event-by-event playback with play/pause, 1x/2x/4x, previous/next turn and scrubbing, VFX for slash/arrow/bolt/fireball/heal/buff, floating damage numbers, HP bars and statuses, zoom (whole steps), drag pan, fit, tap-to-inspect, phone layout, optional real sprites from `public/sprites`, return slideshow shell (skip one / skip all, rewatch list), replay lab that loads `--json` logs. Runs the engine in the browser. Still to do: real sprites/tiles, mana bars (needs mana in the log), sound, loading replays from the server, PWA install.

**M2 - Replay viewer (2-3 wks)**
PixiJS combat scene playing a log with placeholder sprites; slide movement, VFX hooks, play/pause, speed, jump by turn, zoom/pan; mobile layout. Also the return slideshow shell (skip one / skip all) fed by a fake event list.

**M5 - first version done (quests).** `packages/world/src/quests.ts`: quest definitions in the world data (objectives: kill N of a monster, visit a place, clear a dungeon; level and prerequisite gates; gold, xp and optional item rewards; repeatable quests), progress recorded from fights, arrivals and dungeon clears (kills count for every active quest), availability with reasons. The party loop handles quest orders: it travels to a region where the monster lives and favours encounters containing it, goes to places, enters dungeons, and pays out on completion. Boss dungeons need their quest (`requiresQuest`), plain orders to them are refused. Starter world has 11 quests across both regions, ending with the Old Crypt. Server: quest endpoints, order labels and the current target in the summary. Web: Quests tab, quest card on the party screen, boss quest hint on the map, quest orders on the order list. 83 world tests, 52 server tests. Known gaps: quests are taken from the menu (no quest givers or turn-in in cities yet), no collect/escort objectives, no timed or daily quests, quest text is placeholder, and voting on orders waits for multiplayer.

**M4 - first version done (management menus).** Items now have slots (weapon, off-hand, head, body, feet, ring, charm) and attribute bonuses; members have equipment, attribute points (1 per level, auto-spent in the class pattern unless the player turns that off), editable combat AI (validated on the server, only known skills) and a skill list. A party sent to a city waits there (town activity, 1 hour or until new orders) so the **city tab** (shop, sell, teleport to visited cities, leave) is usable; new orders wake a waiting party at once. Order queue can be reordered. Web: Manage menu with Character, AI, Party, Bag, Orders and City tabs, phone-friendly. Old saved parties are upgraded on load (`normalizeParty`). Monster power was raised to 1.55 to account for points and gear. Known gaps: personal 10-slot bags and the multiplayer overview (multiplayer later), no consumables, no auto-equip, skills are the class set (learn-by-use later), quests (M5), real item/skill content.

**Viewer connected to the real API (done).** `apps/web` now has: login and invite-code sign-up, party creation, hex world map (pan/zoom, tap a site to order the party there, locked regions dimmed, orders and party pin), party screen (activity with countdown, members, bag, orders, replays list), and the return slideshow built from the real feed (replays fetched on demand, routine fights collapsed on long absences, per-user seen tracking). Shared response types live in `packages/shared/src/api.ts`. The Vite dev server proxies `/api` to the server. Verified end to end in the browser on a phone-sized viewport.

**M3 - first version done.** `packages/world` (hex map with terrain costs and closed regions, starter world, party state machine: travel / hunt / rest / dungeons with rest policies / defeat and hardcore death, XP curve, loot and bag overflow, deterministic and bounded offline catch-up, balance and party CLIs) and the server side (migration, scheduler worker with `FOR UPDATE SKIP LOCKED`, replay storage with gzip and the 100 + 20 pinned ring, feed with per-user seen tracking, parties/orders/replays API). 38 world tests and 34 server tests. Known gaps: characters still live inside the party JSON (own tables in M4), only `goto` orders (quests in M5), no equipment, only 4 classes, 2 regions of content, one solo party per account (multiplayer groups later), XP curve and monster power are placeholders (see balance tool).

**M3 - Tick loop + world (3 wks)**
Hex map data + loader, party state machine, worker with scheduler, hunting loop in zones, XP/leveling, loot + bag overflow rules, rest/defeat -> city + gold loss, replay ring buffer.

**M4 - Management UI (3-4 wks)**
World map screen and management menu tabs: character (attributes, equipment, skills), AI editor, party overview, bag/favorites, orders (basic), city tab (sell/buy/teleport later in M5), activity feed and replays list, character creation (race/class).

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

## 6. Systems to detail later (backlog)
These are intentionally not designed yet. Build the data model and content pipeline so they can grow without rewrites: everything below is **data-driven content** (JSON/YAML + zod schemas in `packages/content`), loaded by the engine, never hard-coded.
- **Skills:** definitions, costs (mana, cooldown), targeting/range/line of sight, effects, skill trees per class, and the "use it to unlock it" rule (usage counters per skill family drive the chance to acquire related skills).
- **Items:** slots, rarity, item level, affixes/modifiers, sets, consumables, quest items, sell/buy prices, shops per city.
- **Monsters:** stats, skills, AI configurations, loot tables, families and regions, bosses with phases.
- **Races and passives:** Human, Elf, Dwarf, Orc stat bonuses and passive traits (more races later).
- **Classes:** the nine classes, their base attributes, growth, starting skills and gear.
- **Attributes and derived stats:** the formulas (HP, mana, damage, hit/crit/dodge, speed, move), plus the XP curve for level 1-100 tuned to the 45-day target.
- **Quests:** structure (objectives, rewards, prerequisites, repeatable), quest types (kill, collect, explore, dungeon, boss), how they unlock regions.
- **AI conditions, targets and actions:** the full catalog for the gambit editor.
- **World:** zone level ranges, city list, region unlocks, random event table.
- **PvP, arena, leaderboard, seasons.**
- Rule of thumb: add each system as a content schema + engine hook + a few example entries, then grow the content over time.
- **Group accessories (own session later):** items the whole party uses, each with tiers and different effects: a **horse** (faster movement across terrain), **bag** items (raise the shared bag size; found as rewards, drops or bought), a **tent** (faster resting and healing), a **pet**. Needs a party-level accessory slot set, a tier model, shop and loot entries, and sim hooks (travel time, rest time, bag size). The inventory revamp only exposes `party.bagSize` for this.

## 7. Open questions
See the chat; answers will be folded into this file.
