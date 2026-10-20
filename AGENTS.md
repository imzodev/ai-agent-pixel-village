# thegroove - agent notes

## NEVER commit unless explicitly told

**Do not run `git commit` (or `git add` followed by commit, amend, push,
or create a PR) unless the user explicitly asks for it in that message.**
A phrase like "before you commit", "once you're done", or "then commit"
is NOT permission to commit now — it means the user will tell you when.
When in doubt, stop after making the changes and wait. If you already
committed by mistake, say so; do not touch history further.

## Types live in shared type files

**Interfaces and type aliases MUST be declared in shared type modules, never
in files that contain logic (functions, classes, side effects).** A file
that declares logic must import its types, not define them.

- Put shared types under `src/types/*.ts` (e.g. `src/types/world.ts`,
  `src/types/snapshot.ts`, `src/types/websocket.ts`). These files contain
  **types only** — no runtime code.
- `src/lib/protocol.ts` is also a shared type file (wire protocol). It may
  import and re-export types from `src/types/`.
- One canonical declaration per concept. If two files need the same shape,
  move it to `src/types/` and import it in both — do not duplicate. (This
  is how the three duplicate `Facing` unions and the duplicated
  `Selection` were collapsed.)
- A logic file may re-export a type for convenience
  (`export type { X } from "@/types/..."`), but the declaration itself
  must live in the shared file.
- Small private shapes are not exempt. If it is a `type`/`interface`, it
  belongs in `src/types/`.

## LLM providers (NPC dialogue)

`src/lib/llm/` provides a single OpenAI-compatible contract shared by all
providers. Adding a provider is a one-line entry in `providers.ts`.

| Provider | Env key | Default base URL | Default model |
| --- | --- | --- | --- |
| minimax | `MINIMAX_API_KEY` | `https://api.minimax.io/v1` | `MiniMax-M3` |
| openai  | `OPENAI_API_KEY`  | `https://api.openai.com/v1` | `gpt-4o-mini` |
| deepseek | `DEEPSEEK_API_KEY` | `https://api.deepseek.com` | `deepseek-chat` |

Per-provider overrides: `<KEY>_BASE_URL`, `<KEY>_MODEL`.

Selection:
- `LLM_PROVIDER=<name>` forces the active provider.
- Otherwise the first registry entry with an API key wins (registry order:
  minimax, openai, deepseek).
- `LLM_FALLBACK=deepseek,openai` adds a failover chain tried on error.

Without any key, NPCs fall back to the scripted brain (`scriptedReply`).
No application code change needed to add providers — config only.

## NPC keys and trades

Seeded NPCs live in `src/lib/npcDefs.ts` (pure data; `seed.ts` syncs the
`npcs` table to it). A key is `<place>_<name>` (`village_marigold`,
`hollowmere_bjorn`, `coralwick_milo`) and **never names a job**. Jobs are
`trades` (`["baker"]`, `["tinker", "smith"]`), and recipes (`Recipe.trade`)
and shop rules key off trades, so any number of NPCs can share one.
Shop stock (`SHOP_STOCK`/`TRADES`) stays per NPC, since each shop has its own goods.

Renaming a key: add `old: "new"` to `LEGACY_NPC_KEYS` (`src/lib/npcKeys.ts`).
On boot, `renameLegacyNpcKeys` moves the row, the Folk page entries and
"talk to" daily quests. Never reuse an old key as a new one.

## Towns

The continent's towns come from `scripts/gen-settlements.ts`
(→ `src/lib/settlementsData.json` + the `st_*` buildings). Towns already in that
file are **pinned**: same key, square, people and road, since reputation, bounties
and NPC memories hang off them. A re-run only adds towns up to `TOWN_COUNT` (20),
each with a road to the nearest road already built. `REGEN_ALL=1` starts over
(don't, on a live world). The continent keeps every town and road on open land
(`townDist` / `ROAD_KEEP` in continent.ts). Re-run `scripts/gen-relics.ts`
afterwards.

## Homesteads (parcels you choose the use of)

What players own: a **home** (a village cottage and its garden, moved into at
its door) and a **homestead**. The old land / ranch / vineyard / orchard /
workshop lots are gone: everything they did is a homestead parcel now.

- **A homestead is a `lots` row** (`kind: "homestead"`, key = its site key), so
  crops (`resource_nodes.lot_id`, `plot = plotIndex(parcel, i)`), animals
  (`animals.ranch_key`), growth (`ranch_state.lot_key`), banners, cheers and the
  14-day inactivity release all work as for any lot. Its own table is
  `homestead_parcels` (lot, col, row, use).
- **Rules** (`src/lib/homestead.ts`, pure, every number in one place): a 6×6
  grid of 10×10-tile parcels; the starter 2×2 is free (two fields, two
  pastures); every other parcel costs `PARCEL_PRICE` (2000), must touch one you own,
  and the cap rises with level (`CAP_BY_LEVEL`: 4 → 36; keep `LEVEL_UNLOCKS`
  in step). Uses: field (16 plots), pasture (8 space: hen 1, sheep 2, cow 4;
  touching pastures are one pen), vineyard (4 vines), orchard (4 trees), barn,
  workshop (one each). Changing a use is free; it clears the parcel's crops and
  is refused while animals need the pasture. `MAX_HOMESTEADS` = 1 today;
  `canClaimHomestead` already allows another once every one held is full.
- **Sites** (`src/lib/homesteadSites.ts`, `homesteadSitesData.json` from
  `scripts/gen-homestead-sites.ts`): a grid south of the village (`SITE_COLS` ×
  `SITE_ROWS`, lanes between pairs and along every row), on open heartland,
  clear of roads, towns and buildings, never in an enemy zone. **Pinned** like
  towns: a re-run only adds sites. Sites open in blocks of 4, nearest the village
  first, when 80% of the open ones are claimed (`homestead_blocks`;
  `maybeOpenBlock` on each claim and hourly in tickd). The terrain keeps the whole
  grid clear (`onSiteGrid`: no trees, bushes or rocks) and paints the lanes.
- **Server**: `src/lib/homesteadServer.ts`, `/api/homestead` (claim at the
  signpost, buy, preview / set a use, release); animals, growth and the
  showroom through `/api/ranch`; crops through `/api/garden`. Planting goes by
  where a plot is (`PlantSpot`: a home's garden, or the parcel's field /
  vineyard / orchard: `plantRule`, `GardenCropDef.grows`).
- **Barn and workshop**: built once (`hs_barn`, `hs_workshop`) on their parcel;
  then the machines by them (`growthScope`: `BuildStep.place` / `MachineRecipe.place`
  "barn" / "workshop"). Moving the parcel packs them away, never loses them.
  Their walls block through chunkCollision's **dynamic layer**
  (`setDynamicBlocks`, `buildingTiles`): the client from snapshots, the server
  from the DB (`refreshHomesteadBlocks`, once a minute and on each change).
- **Client**: `src/game/homesteadArt.ts` draws parcels, fences (art only), the
  signpost, buildings, machines (`machineSprites.ts`) and the showroom from
  `public/assets/parcels.png` (`scripts/draw-parcels.mjs`); the window is
  `HomesteadPanel` (Land / Barn & animals / Farm).

## World map pictures

The map (M) is drawn by **background workers**, never the game server:
`src/lib/mapRenderPool.ts` runs at most 2 `scripts/map-tile-worker.ts`
processes at the lowest CPU priority; `src/lib/mapRender.ts` draws. The server
(`mapTilePng`) serves a tile from disk, or queues it and answers "still drawing"
(the panel retries). Zoomed-out tiles are cut from the overview, which is built in
256 × 160-tile blocks (`src/lib/mapOverview.ts`): terrain only, keyed by
`mapVersion`; buildings are painted on when a tile is cut. At start the server
deletes old versions under `.cache/map` and **draws the whole map ahead of time**
(zoom 0–3, ~640 pictures, nearest the towns first; `scripts/build-map.ts` does it
at deploy). Homesteads aren't drawn on the map, so they never change it. The panel
(`src/lib/mapZoom.ts`) has fixed zoom levels that show each picture zoom at its
real size, can't zoom out past "the continent fits", and keeps the map on
screen; it draws fog as one image, never requests tiles entirely under your fog,
and the game prefetches the tiles around you while you play (`src/game/mapTiles.ts`).

## Database

Schema changes go through `npm run db:push` (drizzle-kit, from
`src/db/schema.ts`). If it ever asks to **truncate** a table, answer No:
that's drift, usually a constraint whose name differs from drizzle's
`<table>_<col>_unique`. Fix the name instead (`scripts/fix-db-drift.sql`,
which renamed `lots_key_key`). Dropping a table or column that holds data
also makes db:push ask, which the deploy can't answer: put the
`DROP ... IF EXISTS` in `scripts/fix-db-drift.sql` (it runs first).

## Movement (NPCs, animals, enemies)

Movement is deterministic and beat-synced. **Never stream or tick
positions for these entities.**

- A move is data: `{ path: GridPoint[], startAt, speed }` (`src/types/motion.ts`).
  The position at any instant is `positionAt(move, t)` (`src/lib/motion.ts`),
  and the server, the WS server and every client compute it the same way.
- Row `x`/`y` hold the move's **destination** (the resting spot). For
  "where is it right now" (range checks and the like), use `rowPositionAt(row, Date.now())`.
- Beats are epoch-aligned `WORLD_TICK_MS` (5 s) slots. tickd wakes on
  each boundary. Entities due on beat k (`isDue`, staggered per id) get a
  move that starts on beat k+1. The WS server reads that beat's moves at
  boundary + `BROADCAST_OFFSET_MS` and sends one small `moves` message per
  spatial bucket, so clients hold every move before it starts.
- Wander steps are one cardinal direction, an exact whole number of tiles
  (NPCs `NPC_MOVE_MIN_TILES..NPC_MOVE_MAX_TILES`, others
  `MOVE_MIN_TILES..MOVE_MAX_TILES`), never through blocked tiles, and
  inside a leash (`pickWanderMove`). NPC leash radius is at least
  `NPC_LEASH_TILES` (= max step) even if `wander_radius` is smaller. Goal walks (fox raid, remote agents)
  use A* → `compressToLegs` (`planGoalMove`).
- Persist moves with `buildMoveWrite` + `writeMoves` (one batched UPDATE
  per table). A new move must not start before the current one ends.

| Env | Default | Meaning |
| --- | --- | --- |
| `NPC_MOVE_INTERVAL_MS` | 10000 | how often each NPC steps (rounded up to whole beats) |
| `NPC_MOVE_MIN_TILES` / `NPC_MOVE_MAX_TILES` | 1 / 10 | NPC step length range (animals/enemies: 1–4) |
| `ANIMAL_MOVE_INTERVAL_MS` | 10000 | same for animals |
| `ENEMY_MOVE_INTERVAL_MS` | 10000 | same for enemies |
| `WS_RESYNC_MS` | 30000 | full-snapshot safety resync per client |

tickd refuses to start if a `MOVE_MAX_TILES` walk can't finish within an interval.

## Navigation (NPC routes, places, trips)

NPCs travel between places with `src/lib/nav/`, like a maps app. Moves stay
four-directional (see Movement); routes are made fluent by penalising turns,
so they come out as long straight legs.

- **Plan** with `worldRouter.plan(fromTile, toTile)` (`walkGrid.ts`): hierarchical
  A* (`route.ts`) over blocks = game chunks (24×15). Short trips search tiles
  directly; long ones search block *entrances*, then fill in tiles and
  straighten the result. Roads and bridges cost less (6 vs 10), so routes keep
  to them. Walkability is the exact step check (`isWalkableAt`), so routes
  never disagree with movement. Never call the old 80-tile `planPath` for trips.
- **Caches**: block grids and block graphs live in memory and on disk under
  `.cache/nav/<mapVersion>/` (rebuilt automatically when the terrain changes).
  In memory they're refreshed after 5 minutes, so felled/regrown trees are
  picked up; a trip also re-checks its next segment and re-plans if blocked.
- **Places** (`places.ts`): building doors, towns, regions and provinces. An NPC
  only routes to places it knows (`npc_known_places`): its home surroundings
  from the start, others discovered by walking within 12 tiles, or told.
- **Trips** (`trips.ts`, `npc_trips`): a stored route walked as chained moves
  written by tickd, each starting on a beat boundary (so the beat broadcast
  carries it) and never before the previous one ends; `SEG_BEATS` = 4 beats
  per segment. NPCs on a trip are skipped by the random wander; once a trip
  has arrived the NPC lingers there (its wander is leashed to the
  destination, not its home) until it's sent somewhere else.
- **Admin endpoints** (see "Admin endpoints" below):
  `GET /api/nav/route?from=tx,ty&to=tx,ty`, `POST /api/nav/trip { npcKey, place, learn? }`,
  `GET /api/nav/places?npcKey=…`. `scripts/route-preview.ts` draws a route on the map.

## Wild enemies (where they come from)

Wild packs are placed by the WS server, not tickd, in the land **ahead of
moving players** (`src/lib/wildPopulation.ts`): on a chunk crossing, the chunks
`POPULATE_AHEAD_CHUNKS` (3) out in the direction of travel get their pack
(the whole ring on arrival or travel), always off the mover's screen. A chunk is
claimed atomically in `wild_chunks`, so it's filled once for everyone and at
most every `REPOPULATE_MS` (3 min). Pack chance and size grow with players
nearby (`crowdFactor`). New rows go straight to nearby clients as a `spawns`
message; enemies tickd still creates (encounters, zone respawns) are picked up
once a beat. A new enemy can't attack or chase for `SPAWN_GRACE_MS` after it was
sent. tickd despawns wild enemies nobody has been near for `WILD_DESPAWN_MS`.

**Danger tiers** run 1–8 (`tierAt`: one per 330 tiles from the village, +1 on
peaks, mesas, darkwood and swamps; the heartland stays ≤ 2), scaling HP, damage
and XP (`TIER_*_MULT`). Tiers 5–8 have their own foes (`dune_stalker`, `bog_hag`,
`ice_troll`, `gloam_stag`, `basalt_golem`, `wyvern`, `rime_wraith`,
`elder_treant`; art by `scripts/draw-far-foes.mjs`). `wildKindFor` only picks
kinds within three tiers below to one above the land's, and a kind's `pack`
overrides the tier's pack size. A new enemy kind needs: `ENEMY_KINDS`,
`MOVESETS`, `ANIMAL_SPRITES`, `BIOME_KINDS`, the collection icon, bounty names
and its drop items (`farLands.test.ts` checks all of it). Bjorn forges the
far-land gear (steel sword → wyvernbone blade → elder blade, runed bow).

**Lair bosses** (`src/lib/lairs.ts`): one per far tier (Sand Wyrm 5, Frost Giant 6,
Fire Drake 7, the Hollow 8), each in a lair placed by `scripts/gen-lairs.ts`
(→ `lairsData.json`; the continent keeps a clearing around each). tickd raises a
boss unless it fell less than `LAIR_RESPAWN_MS` (2 h) ago (`boss_lairs`); everyone
who dealt `BOSS_SHARE_MIN` of its HP earns XP, coins, its trophy and a chance at its
unique weapon. Bosses (`tier: "boss"`, `isBossKind`) stand their ground and never
spawn wild. Lairs show on the map (☠️) once explored.

The WS server's combat clock (and wolf hunts) work from an **in-memory cache**
of aggressive enemies (`combat.rows`), not per-second reads: a full read every
`WS_RESYNC_MS` as a safety net, kept current in between by its own spawns
(`rememberEnemies`), the beat's moves (`applyEnemyMoves`), its dashes and kills
from the attack API (`forgetEnemy`). An enemy about to strike is confirmed alive
at most every 2 s (`verifyAlive`), so one tickd removed can't attack as a ghost.
Don't add per-tick DB reads there.

## NPC minds (Jev)

NPCs listed in `MIND_NPCS` (default `village_marigold`; e.g.
`village_marigold,hollowmere_bjorn`) have a mind (`src/lib/mind/`): real stock
and a purse (`npc_minds`), memories, and regard for players (`npc_regard`).
Every `MIND_INTERVAL_MS` tickd calls `thinkMinds`.

- **Profiles** (`profiles.ts`): what a kind of NPC makes (`crafts`), sells
  off its shelf, buys or gathers on errands (`supplies`), carries to a buyer
  (`sells`), asks players for (`asks`) and gifts. `BAKER` (Marigold), `SMITH`
  (Bjorn), `MILLER` (Hollis), `FARMHAND` (Rowan), `WOODCUTTER` (Ansel).
- **Supply chains**: Rowan cuts wheat in the Common Field and sells full loads
  to Hollis, who mills it into the flour Marigold buys; Ansel chops logs in the
  Whisperwood for the woodpile Bjorn buys from. Buying from (or selling to) an
  NPC with a mind moves real stock and coins (`mindStock`); one without a mind
  is an endless shop, so list both ends in `MIND_NPCS`.
- **Traders who move goods** (all listed in `MIND_NPCS` on the droplet too): Maren
  (`hollowmere_maren`, carpenter) buys Ansel's logs and Bjorn's fittings, saws planks and
  makes furniture; Della (`village_della`) milks and shears at the Village Ranch (free
  gathering) and presses cheese and weaves cloth; Fenwick (`village_fenwick`) presses the
  apples, grapes and pears players bring into cider and wine. A delivery (`sells`) with
  `to` goes to whichever buyer pays most now (`bestTarget`): a buyer without a mind pays its
  market's price and the sale lands in that market (`sellInto`); `keep` leaves some on the
  shelf. Their shelf prices come from the price model (`shopPrice`).
- **The caravan** (`village_tamsin`, `profile.circuit`, `src/lib/mind/caravan.ts`): a
  wagon round the grove, Hollowmere, Brightwater and Coralwick (`travel:<i>` while on the
  road, `stay:<i>` while trading, `STOP_LINGER_MS`); one option at a time, so never a Jev
  call. At each stop `tradeAtMarket` drops off what makers there with a mind are short of
  (Fenwick's fruit), sells what this town pays about as well as anywhere on the circuit,
  and buys up the town's flood and its own goods (`localGoods`) when another stop pays
  `MIN_MARGIN` more (`pickBuys`; the flood's glut goes down, `buyUp`). Her wagon is her shelf.
- **Gathering shows in the world** (`supplies[item].gather`, `src/lib/mind/gatherServer.ts`):
  Rowan cuts real ripe wheat stalks (they regrow as when players pick them),
  Ansel fells real trees (stumps that grow back). What an NPC carries is
  `npcs.carry`, shown over its head ("🌾 ×12 · Farmhand") until it's home or sold. A new kind = a profile + its key
  in `PROFILE_OF` + `MIND_NPCS`; shelf items also need a `SHOP_STOCK` entry.
  A key in `MIND_NPCS` without a profile is ignored.
- **Decide**: `feasibleActions` (`profile.ts`, shared) lists only what the NPC
  can do *right now* (make a batch, go to a supplier, ask the village, gift a
  friend, go home…). Jev (`jev.ts`, `TYPESAFE_API_KEY`) picks one from the plain-words
  `stateText` and scores mood and urgency. If there's no key, an error, a timeout or
  confidence < 0.35, `scriptedPick` decides. Never let Jev invent an action:
  add it to `feasibleActions` and carry it out in `act()`.
- **Jev is asked only for a real, new choice** (`needsJev`): one option (walking
  somewhere is always one: "wait") → taken without a call; the same options,
  people nearby and intent as when Jev last chose, under `REASK_MS` (30 min) →
  its answer stands. The decision's `source` says which (`jev` / `only` / `same`
  / `scripted`). A think still runs every `MIND_INTERVAL_MS`, but it's cheap: keep
  it that way, never call Jev unconditionally.
- **Errands and outings** give them something to do you can see: a supply is
  bought from a supplier NPC or, with a `spot` and no supplier, gathered for free
  (Bjorn: logs in the Whisperwood, stone in the Greyspine pass); `outings` take
  them somewhere at times of day, once a game day, and they linger `lingerMs`
  before heading home (Marigold: supper at the inn; Bjorn: the grove, an ale).
- **Carry out**: the engine does it (batches on the bread table, trips,
  missions keyed `req_<npcKey>_<ms>`). The LLM only writes the line it says.
- **Stock and purse** change only through `adjustStock` (one guarded UPDATE),
  never read-modify-write: shop sales (`shelfSale`), sales to the NPC
  (`npcBuys`) and tickd can run at once.
- **Regard** is counters, not Jev: helping raises it, free loaves
  past `FREEBIE_GRACE` lower it. Tiers feed the talk prompt, gifts and a 15% discount (`DEAR_DISCOUNT`).
- Admin: `GET /api/mind?npcKey=…` (state, last decision with probabilities),
  `POST /api/mind { npcKey, stock?, purse?, think? }`.

## NPC conversations (gossip and relationships)

NPCs talk to each other (`src/lib/npcTalk.ts` rules, `src/lib/npcTalkServer.ts`,
run by tickd every 30 s):

- **Meetings**: two NPCs within `MEET_PX` (5 tiles), both free, the pair not within
  `NPC_TALK_PAIR_MS` (3 min) and each NPC not within `NPC_TALK_NPC_MS` (1 min).
- **Only where a player can see** (`WATCH_PX`, about a screen): one LLM call writes a
  4–6 line back-and-forth, each NPC speaking at least twice (JSON, `parseTalk` checks it; a short or cut-off reply is asked for once more), held still and said as
  alternating bubbles `LINE_GAP_MS` apart. Unwatched meetings only pass a rumour on,
  no LLM. `NPC_TALKS_DAILY_MAX` (600) caps them, on top of `LLM_DAILY_MAX`.
- **Visits**: near a watching player with nobody close, an NPC walks over to a
  neighbour (friends first) at most every 90 s per screen, and goes home after.
- **Gossip**: notable `world_events` about players become `npc_rumours`, heard first
  by NPCs within `WITNESS_PX`; they spread in conversations (`npc_heard`) and fade
  after 2 days. NPCs bring them up with players ("GOSSIP YOU'VE HEARD" in the talk
  prompt, `gossipFor`).
- **Relationships**: `npc_relations` (affinity −10…10 and a note), started from the
  personalities' opinions, moved by each conversation, and fed into the next.
- The WS server saves online players' live positions every 30 s (`savePositions`)
  so tickd knows who's watching. Admin: `GET /api/npc-talks?limit=`.
- **They answer players' chat** (`src/lib/npcReact.ts`, `npcReactServer.ts`, run by the
  chat action in the background): an NPC called by name answers from up to 16 tiles;
  otherwise the nearest within 8 tiles may answer (or let it pass: `SKIP`), and
  sometimes a second chimes in. Each NPC at most every 12 s. Answers use what the NPC
  knows (never promising gifts or deals) and go into its memory of that player.

## Homestead growth and standing orders

A homestead grows (`src/lib/ranchUpgrades.ts` rules, `ranchServer.ts` server,
`ranch_state` table): farm XP from crops, animal goods, machine work,
deliveries and commissions raises its farm level, which unlocks what can be
built by the barn (silo and feeder: tickd's `tickRanches` feeds hungry animals
from the silo every 5 min; mill, cheese press, loom, beehives, fruit press, wine
cellar and racks, jam kitchen) and the workshop (saw bench, lathe, upholstery
bench, varnish shelf; the workbench comes with it). Jobs finish on a timer.
Building costs coins, wood, stone and Bjorn's fittings. Petting raises
`animals.affection`, which gives a chance (up to 40%) of quality goods (golden
egg, fine wool, rich milk). Built things are drawn from `LotSnapshot.ranch`.

NPCs with a mind offer **standing orders** (`profile.orders`, `ordersServer.ts`,
`standing_orders`): a player supplies so many of an item a week. Deliveries are
paid from the NPC's purse and go into its stock; filling the week pays a bonus.

## Vines and fruit trees

Vineyard and orchard parcels grow **perennials** (`CROP_KINDS[k].perennial`):
grapevines (vineyard parcels) and fruit trees (orchard parcels: apple, and the
LPC trees lemon, orange, peach, cherry, pear, plum, coconut, banana;
`src/lib/orchard.ts` is the table items, saplings, shops and buyers are built
from). A perennial's harvest doesn't remove it; it drops back to mature and
fruits again after `fruitMs`. Perennials grow `regrowthMs` a stage up to
`perennial.mature`, then ripen their fruit over `fruitMs` (`stageMs`).
Sprites: `scripts/draw-orchard.mjs` (vines) and the "[LPC] Fruit Trees" sheet
`public/assets/trees/fruit-trees.png` (96×128 cells; credits in
`public/assets/ATTRIBUTION.md`). The sheet draws growth per tree *shape* and
fruit per variety, so each tree's frames come from different cells and carry
their own trunk anchor (`CropRect.ax/ay`, measured; `nodeOrigin(kind, stage)`).
Saplings are sold by the shops of towns whose land suits them (`families`); Pip
sells grape cuttings and apple saplings.

## Furniture

Made in a homestead's workshop. Furniture is listed in `src/lib/furniture.ts`
with its value; every piece has a sprite on `public/assets/furniture.png`
(`scripts/draw-furniture.mjs`, `src/game/furnitureArt.ts`, `FurnitureSprite`),
shown in the Home panel and in the showroom in front of the workshop
(`ranch_state.display`, 6 spots: `PARCEL_SHOWROOM`). Shops buy furniture, and
NPCs post **commissions** (`src/lib/commissions.ts`): missions keyed
`com_<npcKey>_<ms>` from tickd's `tickCommissions`; the first delivery closes it.

## Economy (prices, markets, land)

One value per item (`src/lib/itemDefs.ts`, which `seed.ts` re-exports as
`ITEM_DEFS`) drives every NPC price (`src/lib/economy.ts`):

- **Buying from players**: `BUYERS` in `trade.ts` says what each NPC takes
  (categories like `fish`, `drink`, `farland`, or item keys) and its
  `specialty`. Specialists pay full value; others `BUY_RATE` (0.7). `TRADES` is
  built from it; lines carry no numbers. Odo (village plaza) buys nearly
  anything at the general rate; Vesna (Hollowmere) buys far-land materials and
  boss trophies; each town's shopkeeper buys its land's goods.
- **Selling to players**: `SHOP_STOCK` lists who sells what; prices are
  `shopPrice` (goods `SELL_MARKUP` 1.5 × value, at least value + 1; gear and
  seeds at their value).
- **No loops** (`economy.test.ts`): the most anyone pays (specialist ×
  Haggler) is below the least anything sells for after every discount (town
  reputation, a mind NPC's "dear" 15%, rounded up). Every good with a value
  has a buyer. A new item needs a value and a category.
- **Supply & demand** (`src/lib/market.ts`, `marketServer.ts`,
  `market_demand`): a market is the NPC key's place (`village`,
  `hollowmere`, a town key). Each unit sold adds to its `glut`, which halves
  every `DEMAND_HALF_LIFE_MS` (3 h); buyers pay `base / (1 + glut / depth)`,
  never under `PRICE_FLOOR` (10%), each unit priced after the one before.
  A market's `depth` grows with its buyers of that item (`marketDepth`: per-item
  `depthOf` × `buyerWeight`, a specialist 1, anyone else 0.5), so adding NPCs who
  buy something makes that town take more of it.
  `recordSale` is one atomic upsert. All selling goes through
  `performSell` (`src/lib/sellServer.ts`): the player must be within
  `SELL_REACH_PX` of the buyer. NPCs mention flooded markets in talk (`marketNews`).
- **Pace**: gather/chop at most 5 per 3.5 s, a cast every 2 s
  (`gatherLimiter`, `castLimiter`).
- **Land**: `PARCEL_PRICE` 2000, flat; the starter 4 are free.
- `scripts/economy-report.ts` prints coins an hour per activity and hours per
  parcel; run it after changing values, rates or demand.
- **Tool wear** (`src/lib/wear.ts`, `wearServer.ts`): axes, blades, bows and
  the rod carry `meta.wear` (0–100, like `meta.plus`); each chop, hit, shot or
  cast adds `WEAR_PER_USE` to the copy in hand (split off a stack first). From
  `WORN_AT` (75) they work a little worse, at 100 ("dull") much worse; they
  never break. Bjorn repairs the most worn copy at the forge
  (`POST /api/forge { action: "repair" }`) for `REPAIR_K` × √value × wear.

## Jobs (hired by an NPC, a shift a day)

`src/lib/jobs.ts` (rules, every number), `src/lib/jobsServer.ts`, `/api/jobs`,
`jobs` table. Up to `MAX_JOBS` (3), one per employer. A day is a **real UTC
day** (`dayKey`, like daily quests). Each finished shift pays `FLAT_WAGE[kind]`
× rank plus the work; employers with a mind pay from their purse
(`employerPays`). Ranks at `RANK_AT` 0/5/15 shifts (titles per job; pay and
quotas × `RANK_MULT`). Missing `FIRE_AFTER_DAYS` (3) days in a row lets you go
(checked lazily in `settle`); rehire after `REHIRE_MS`. Job rows change under a
row lock (`locked`), so double clicks can't pay twice.

- **Courier** (Hettie, the Grove Post): today's letters (`letter` items, `meta.to`)
  go to `pickRecipients` (wider with rank); "Deliver letter" on the recipient.
  Yesterday's letters are recalled.
- **Supplier** (Hollis, Maren, Bjorn, Della, Fenwick, Marina): hand in the day's
  quota; goods go into the employer's real stock and pay `SUPPLY_PREMIUM` (1.2) ×
  value: more than selling them, under any shop's price (tested).
- **Guard** (Old Sorrel, Mayor Wynn, each town's bounty keeper): kills within
  `GUARD_RADIUS` of the town, from the attack route (`progressGuard`).
- **Escort** (Tamsin): tickd's caravan code calls `escortDepart` / `escortTick` /
  `escortArrive`; an ambush springs `AMBUSH_AFTER_MS` into a leg with riders
  (`spawnAmbush`). `jobsServer` must stay free of WS-server imports (tickd uses it):
  routes pass live positions in.
- Employers know you work for them (`jobNoteFor` in the talk prompt); promotions
  and firings are `job` world events, so gossip.

## Billboards (in-world ads)

Anyone (an indie game, a shop, a streamer; sponsors too) can rent a billboard
at `/advertise`: a poster of their own on a board in the world, billed monthly.

- **Spots** (`src/lib/billboards.ts`, `billboardSpotsData.json` from
  `scripts/gen-billboard-spots.ts`): two by the village plaza, one by every
  town's square, a few along the King's Road, each on clear ground (no
  buildings, decor, paths, roads, water or homestead sites). **Pinned** like
  towns: rentals hang off their keys, a re-run only adds missing spots. Priced
  by tier (`BILLBOARD_TIERS`: plaza $49, town $19, roadside $9). A board's base
  row blocks (`billboardBlocks`, registered on server and client).
- **Renting** (`src/lib/billboardServer.ts`, `/api/billboards`): a
  `billboard_rentals` row holds the spot (an unpaid checkout only for
  `PENDING_HOLD_MS`), then Stripe Checkout in subscription mode. Without a Stripe
  key outside production (the sandbox) it goes straight to review.
- **Review**: every poster, title and link waits in `pending_*` until an admin
  approves it (`/api/admin/billboards`, the review list on the stats page). A
  first rejection cancels and refunds; a rejected change leaves the live poster
  up. Advertisers manage theirs by owner token at `/advertise/dashboard`
  (change poster or link, cancel at period end).
- **Posters** (`src/lib/billboardPoster.ts`): PNG/JPEG/WebP up to 2 MB, decoded
  and drawn again as a 192×96 PNG with `sharp` (a runtime dependency), so no
  metadata or hidden payload survives. Stored by content hash in `BILLBOARD_DIR`
  (default `.data/billboards`; back it up with the database). Served by
  `/api/billboards/poster/<hash>.png`: live ones publicly, pending ones only
  to their owner's token or an admin.
- **Links** go through `/api/billboards/click/<id>` (a redirect to the stored,
  checked link: `cleanAdLink`, `rel="nofollow sponsored"`), which counts one
  click per visitor per poster every 10 minutes. **Views** are counted by the
  client (`src/game/billboardImpressions.ts`: 2 s within 160 px, once per poster
  every 30 min) and sent in batches to `/api/billboards/events`.
- **One Stripe webhook** (`src/lib/stripeWebhook.ts`): gems, sponsors and
  billboards share a dispatcher that routes by checkout metadata (`packKey`,
  `sponsorId`, `billboardRentalId`); `/api/{gems,sponsors,billboards}/webhook`
  are all wrappers, so register any one of them in Stripe, with
  `checkout.session.completed`, `customer.subscription.updated` and
  `customer.subscription.deleted`. A billboard checkout never carries
  `sponsorId` (it would open or close that sponsor). Every handler is idempotent;
  gem credits are unique per Stripe session (`gem_transactions_stripe_session_idx`).
- **Revenue** is on the stats page (`statsView().revenue`): MRR from sponsors'
  rent and paid billboards, spots held per tier, gem sales, ad views and clicks.

## Admin endpoints

Anything that lets someone steer the world (send NPCs on trips, inspect or
change an NPC's mind, plan routes) must check `isAdmin(req)` from
`src/lib/adminAuth.ts` and return `notFound()` otherwise. Requests carry
`x-admin-token: <ADMIN_TOKEN>`. With `ADMIN_TOKEN` unset (or under 24
characters) these endpoints don't exist, in development too. Never gate them
on `NODE_ENV` alone.

## Alerts and capacity

- **Alerts** (`src/lib/alerts.ts`): with `ALERT_WEBHOOK_URL` set (a Discord or
  Slack incoming webhook, or an ntfy.sh topic URL) the server and tickd post on
  a crash (`fatal`, sent before the process exits), on 20+ errors in 5 min
  (`log.error` and `console.error` both count) and when `/api/health` can't
  reach Postgres. Each kind at most once per 10 min. Unset = nothing is sent.
- **DigitalOcean** (set up outside the repo, emails the DO account): an uptime
  check on `https://thegroove.fun/api/health` (down 2 min, slow > 2 s,
  certificate < 14 days) and droplet alerts (CPU > 85%, memory > 90%, disk > 85%).
- **`/api/health`** also reports event-loop lag (`loopLag`, last 10 s) and `rssMb`.
- **Caps** (`src/lib/world-stream.ts`): `PLAYER_MAX` (150) logged-in players and
  `SPECTATOR_MAX` (200) visitors per process, sized for the 1 vCPU / 2 GB droplet.
  Over the cap the client shows why on the loading screen (bus `busy`): visitors
  get "busy" plus Play now (4429), players "the world is full" and a retry every
  20 s (4430). Never let it fall through to a loading bar that never ends.
- **Per network**: at most `PLAYERS_PER_IP` (5) players online at once from one
  address (close 4431, "lots of players from your network", retry every 20 s).
  Not lower: families, schools and phone networks share addresses.
- **DB pool**: `DB_POOL_MAX` per process (server 30, tickd 10 in
  ecosystem.config.js). Every process shares Postgres's `max_connections` (100).
- **Live positions** are relayed in batches (`flushPositions`, every 100 ms, one
  `playerPositions` frame per receiver). Don't go back to one frame per move:
  that's n² frames a second in a crowd.
- **Load test** (`scripts/load-test.ts`), against a LOCAL production build only:
  start the server with `SIGNUP_PER_IP_10MIN=100000 PLAYER_MAX=100000
  SPECTATOR_MAX=100000` (and blank LLM keys), run
  `npx tsx --env-file=.env scripts/load-test.ts --base http://localhost:3101`,
  then `--cleanup`. Last run (8-core dev box, everyone in the plaza): fine to
  200 players + 200 visitors, struggling at 300; memory ~1.2 GB at 200 + 200.
- **Warm-up**: after `listen`, the server requests the routes the game loads
  (`WARM_PATHS` in src/server.ts), so the first visitor after a deploy doesn't
  wait ~30 s for route code to load. Add new boot-time routes there.

## Play now (accounts without a password)

`POST /api/auth/quick { name? }` makes a character from just a name (a random
villager name if blank), a random look, an automatic username
(`quickUsername`, `src/lib/quickPlay.ts`) and **no password**
(`users.password_hash` is null), with a 365-day session. The HUD offers
"💾 Save character" (`POST /api/auth/claim { username, password }`) in the menu,
as a reminder from level 3 or after the tutorial, and instead of signing out
(which would lose the character). Login refuses passwordless accounts with a
message saying how to save.

Unsaved characters nobody came back for are deleted by tickd once a day
(`pruneAbandoned`, `src/lib/abandoned.ts`): no password, not seen for 30 days
and below `ABANDONED_MAX_LEVEL` (3). Their lots are given up first, as on moving
out; payments, reports and analytics are kept. Saved characters are never
touched. `deleteCharacters` is the one way to delete characters (the load test's
`--cleanup` uses it too); the schema has no foreign keys, so it goes by column.
