import type { ArmMatchState, BlackjackHand, DiceTableState } from "@/types/saloon";
import {
  bigint,
  pgMaterializedView,
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  uniqueIndex,
  index,
  varchar,
} from "drizzle-orm/pg-core";
import type {
  Appearance,
  HomeTheme,
  ItemKind,
  MissionRequirement,
  MissionReward,
} from "@/types/domain";
import type {
  CosmeticItem,
  CosmeticOwnership,
  CharacterEquipped,
  GemTransaction,
} from "@/types/cosmetic";
import type { SponsorEvent } from "@/types/sponsor";
import type { GridPoint } from "@/types/world";
import type { LotKind } from "@/types/garden";
import type { FriendRequest, Friendship } from "@/types/social";
import type { DailyQuest, StreakState, QuestRequirement, QuestReward } from "@/types/quest";
import type { BountyData, BountyReward } from "@/types/bounty";
import type { Activity, ActivityParticipant } from "@/types/activity";

// Re-export domain types so existing imports of `import type { Appearance }
// from "@/db/schema"` keep working. New code should import from
// `@/types/domain` (and from `@/types/cosmetic` etc. for new concepts).
export type {
  Appearance,
  Character,
  HomeTheme,
  ItemKind,
  MissionRequirement,
  MissionReward,
} from "@/types/domain";

// ---------- Accounts ----------
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// ---------- Player characters ----------

export const characters = pgTable(
  "characters",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().unique(),
    name: text("name").notNull(),
    appearance: jsonb("appearance").$type<Appearance>().notNull(),
    x: real("x").notNull().default(1024),
    y: real("y").notNull().default(760),
    facing: text("facing").notNull().default("down"),
    coins: integer("coins").notNull().default(20),
    gems: integer("gems").notNull().default(0),
    hp: integer("hp").notNull().default(20),
    maxHp: integer("max_hp").notNull().default(20),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(1),
    homeTheme: jsonb("home_theme")
      .$type<{ wall: string; floor: string }>()
      .notNull()
      .default({ wall: "#f5d7b0", floor: "#c68e5a" }),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** Guided first session (src/lib/tutorial.ts): step index, 99 = done. */
    tutorialStep: integer("tutorial_step").notNull().default(0),
    tutorialProgress: integer("tutorial_progress").notNull().default(0),
    /** Nameplate title the player picked (from achievements / book pages). */
    title: text("title"),
  },
  (t) => [index("characters_last_seen_idx").on(t.lastSeenAt)],
);

// ---------- Buildings & Sponsors ----------
export const sponsors = pgTable(
  "sponsors",
  {
    id: serial("id").primaryKey(),
    businessName: text("business_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    website: text("website"),
    brandColor: text("brand_color").notNull().default("#e76f51"),
    tagline: text("tagline").notNull().default(""),
    pitch: text("pitch").notNull(),
    persona: text("persona").notNull(),
    agentName: text("agent_name").notNull(),
    discountCode: text("discount_code").notNull(),
    discountText: text("discount_text").notNull(),
    buildingId: integer("building_id"),
    plan: text("plan").notNull().default("village"),
    rentCents: integer("rent_cents").notNull().default(4900),
    leadFeeCents: integer("lead_fee_cents").notNull().default(150),
    status: text("status").notNull().default("pending"), // pending | active | cancelled
    ownerToken: text("owner_token").notNull().unique(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeCheckoutId: text("stripe_checkout_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("sponsors_status_idx").on(t.status)],
);

export const buildings = pgTable("buildings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // bakery | inn | store | home | ...
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#d9a066"),
  tx: integer("tx").notNull(),
  ty: integer("ty").notNull(),
  tw: integer("tw").notNull(),
  th: integer("th").notNull(),
  menu: jsonb("menu").$type<string[]>().notNull().default([]),
  sponsorId: integer("sponsor_id"),
  reservable: boolean("reservable").notNull().default(true),
  visits: integer("visits").notNull().default(0),
});

// ---------- NPCs / AI agents ----------
export const npcs = pgTable(
  "npcs",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    persona: text("persona").notNull(),
    greeting: text("greeting").notNull(),
    x: real("x").notNull(),
    y: real("y").notNull(),
    homeX: real("home_x").notNull(),
    homeY: real("home_y").notNull(),
    targetX: real("target_x"),
    targetY: real("target_y"),
    wanderRadius: integer("wander_radius").notNull().default(120),
    facing: text("facing").notNull().default("down"),
    appearance: jsonb("appearance").$type<Appearance>().notNull(),
    sponsorId: integer("sponsor_id"),
    buildingId: integer("building_id"),
    kind: text("kind").notNull().default("builtin"), // builtin | remote
    apiKey: text("api_key").unique(),
    webhookUrl: text("webhook_url"),
    mood: text("mood").notNull().default("cheerful"),
    // Current scheduled move (see src/lib/motion.ts). `x`/`y` hold the
    // resting position the move ends on; the live position is
    // `positionAt(move, now)`. Null when the entity has never moved.
    movePath: jsonb("move_path").$type<GridPoint[]>(),
    moveStartAt: bigint("move_start_at", { mode: "number" }),
    moveSpeed: real("move_speed"),
    moveAfter: text("move_after"),
    // Epoch ms until which the NPC must not start a new move (a player
    // is talking to it). See holdNpc in src/lib/moveStore.ts.
    holdUntil: bigint("hold_until", { mode: "number" }),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("npcs_sponsor_idx").on(t.sponsorId), index("npcs_move_start_idx").on(t.moveStartAt)],
);

// ---------- Animals ----------
export const animals = pgTable("animals", {
  id: serial("id").primaryKey(),
  species: text("species").notNull(),
  name: text("name").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  targetX: real("target_x"),
  targetY: real("target_y"),
  facing: text("facing").notNull().default("down"),
  state: text("state").notNull().default("idle"), // idle | walk | sleep | graze
  mood: text("mood").notNull().default("content"),
  hunger: integer("hunger").notNull().default(20), // 0 full - 100 starving
  pets: integer("pets").notNull().default(0),
  lastFedAt: timestamp("last_fed_at").defaultNow().notNull(),
  lastPettedAt: timestamp("last_petted_at"),
  zone: jsonb("zone").$type<{ x: number; y: number; w: number; h: number }>().notNull(),
  stateUntil: timestamp("state_until"),
  /** Ranch animals (src/lib/ranch.ts): owner, their ranch lot, and when
   *  their produce was last collected. Null for the village's own animals. */
  ownerId: integer("owner_id"),
  ranchKey: text("ranch_key"),
  lastProducedAt: timestamp("last_produced_at"),
  // Current scheduled move (see src/lib/motion.ts). `x`/`y` hold the
  // resting position the move ends on; the live position is
  // `positionAt(move, now)`. Null when the entity has never moved.
  movePath: jsonb("move_path").$type<GridPoint[]>(),
  moveStartAt: bigint("move_start_at", { mode: "number" }),
  moveSpeed: real("move_speed"),
  moveAfter: text("move_after"),
}, (t) => [index("animals_move_start_idx").on(t.moveStartAt)]);

// ---------- Items ----------
// ItemKind re-exported above

export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").$type<ItemKind>().notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("📦"),
  value: integer("value").notNull().default(1),
  equippable: boolean("equippable").notNull().default(false),
  placeable: boolean("placeable").notNull().default(false),
});

export const inventory = pgTable(
  "inventory",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id").notNull(),
    itemKey: text("item_key").notNull(),
    qty: integer("qty").notNull().default(1),
    equipped: boolean("equipped").notNull().default(false),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("inventory_char_idx").on(t.characterId)],
);

export const groundItems = pgTable(
  "ground_items",
  {
    id: serial("id").primaryKey(),
    itemKey: text("item_key").notNull(),
    qty: integer("qty").notNull().default(1),
    x: real("x").notNull(),
    y: real("y").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    droppedBy: integer("dropped_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("ground_items_xy_idx").on(t.x, t.y),
    index("ground_items_item_key_idx").on(t.itemKey),
  ],
);

export const homeDecor = pgTable("home_decor", {
  id: serial("id").primaryKey(),
  characterId: integer("character_id").notNull(),
  itemKey: text("item_key").notNull(),
  gx: integer("gx").notNull(),
  gy: integer("gy").notNull(),
});

// ---------- Missions ----------
// MissionRequirement / MissionReward re-exported above

export const missions = pgTable("missions", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  npcId: integer("npc_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  offerLine: text("offer_line").notNull(),
  completeLine: text("complete_line").notNull(),
  requirement: jsonb("requirement").$type<MissionRequirement>().notNull(),
  reward: jsonb("reward").$type<MissionReward>().notNull(),
  sponsorId: integer("sponsor_id"),
  repeatable: boolean("repeatable").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

export const characterMissions = pgTable(
  "character_missions",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id").notNull(),
    missionId: integer("mission_id").notNull(),
    status: text("status").notNull().default("active"), // active | completed
    progress: integer("progress").notNull().default(0),
    acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [index("cm_char_idx").on(t.characterId)],
);

// ---------- Sponsor funnel ----------
export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    sponsorId: integer("sponsor_id").notNull(),
    characterId: integer("character_id").notNull(),
    npcId: integer("npc_id"),
    kind: text("kind").notNull(), // discount_claimed | mission_completed | conversation
    code: text("code"),
    feeCents: integer("fee_cents").notNull().default(0),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("leads_sponsor_idx").on(t.sponsorId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id").notNull(),
    npcId: integer("npc_id").notNull(),
    role: text("role").notNull(), // player | npc
    text: text("text").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("conv_char_npc_idx").on(t.characterId, t.npcId)],
);

// Chat shown as bubbles in the world
export const worldChat = pgTable(
  "world_chat",
  {
    id: serial("id").primaryKey(),
    speakerType: text("speaker_type").notNull(), // player | npc
    speakerId: integer("speaker_id").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("world_chat_created_at_idx").on(t.createdAt)],
);

// ---------- World simulation ----------
export const worldState = pgTable("world_state", {
  id: integer("id").primaryKey(),
  lastTickAt: timestamp("last_tick_at").defaultNow().notNull(),
  weather: text("weather").notNull().default("clear"), // clear | rain | fog | snow
  weatherUntil: timestamp("weather_until").defaultNow().notNull(),
  epochStart: timestamp("epoch_start").defaultNow().notNull(),
  dayLengthMinutes: integer("day_length_minutes").notNull().default(24),
});

export const worldEvents = pgTable(
  "world_events",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    text: text("text").notNull(),
    subjectType: text("subject_type"),
    subjectId: integer("subject_id"),
    x: real("x"),
    y: real("y"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("events_subject_idx").on(t.subjectType, t.subjectId)],
);

export const resourceNodes = pgTable(
  "resource_nodes",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // berry_bush | herb_patch | rock | mushroom_ring | wheat_field
    itemKey: text("item_key").notNull(),
    x: real("x").notNull(),
    y: real("y").notNull(),
    /** Items given to the player per pick. */
    qty: integer("qty").notNull().default(1),
    /** Current regrowth stage. 0 = picked/empty, (stages-1) = fully grown. */
    stage: integer("stage").notNull().default(0),
    /** When the sim worker should advance `stage` by one. NULL = no regrowth scheduled. */
    nextAdvanceAt: timestamp("next_advance_at"),
    // Garden crops only (NULL for wild nodes): who planted it, in which
    // lot's garden plot, and the last stage that was watered.
    ownerId: integer("owner_id"),
    lotId: integer("lot_id"),
    plot: integer("plot"),
    wateredStage: integer("watered_stage"),
  },
  (t) => [
    index("resource_nodes_stage_idx").on(t.stage),
    index("resource_nodes_next_advance_idx").on(t.nextAdvanceAt),
    index("resource_nodes_xy_idx").on(t.x, t.y),
    uniqueIndex("resource_nodes_lot_plot_idx").on(t.lotId, t.plot),
  ],
);

// ---------- Lots (owned parcels) ----------
// A parcel of land a player can own. Today every lot is a "home" lot (a
// building plus its front garden); "land" lots without a building are
// planned, as is player resale (price / for_sale). See src/lib/lots.ts.
export const lots = pgTable(
  "lots",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(),
    kind: text("kind").$type<LotKind>().notNull().default("home"),
    /** Manifest key of the lot's building (home lots). */
    buildingKey: text("building_key"),
    /** Parcel footprint in world tiles. */
    tx: integer("tx").notNull(),
    ty: integer("ty").notNull(),
    tw: integer("tw").notNull(),
    th: integer("th").notNull(),
    ownerId: integer("owner_id"),
    acquiredAt: timestamp("acquired_at"),
    /** Coins to acquire it; 0 = free to move in. */
    price: integer("price").notNull().default(0),
    forSale: boolean("for_sale").notNull().default(false),
  },
  // Not unique: high-level players may own a second land lot (the limit
  // lives in acquireLot, see landLotLimit in src/lib/progression.ts).
  (t) => [index("lots_owner_kind_idx").on(t.ownerId, t.kind)],
);

export const enemies = pgTable("enemies", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // ENEMY_KINDS key (src/lib/progression.ts) or "rootking"
  x: real("x").notNull(),
  y: real("y").notNull(),
  targetX: real("target_x"),
  targetY: real("target_y"),
  hp: integer("hp").notNull(),
  maxHp: integer("max_hp").notNull(),
  spawnedAt: timestamp("spawned_at").defaultNow().notNull(),
  // Current scheduled move (see src/lib/motion.ts). `x`/`y` hold the
  // resting position the move ends on; the live position is
  // `positionAt(move, now)`. Null when the entity has never moved.
  movePath: jsonb("move_path").$type<GridPoint[]>(),
  moveStartAt: bigint("move_start_at", { mode: "number" }),
  moveSpeed: real("move_speed"),
  moveAfter: text("move_after"),
  /** World boss only: damage dealt per character id, for shared rewards. */
  damage: jsonb("damage").$type<Record<string, number>>(),
  /** Spawned around players in the continent's wilds (home = targetX/Y);
   *  `nearAt` is the last time a player was close — they despawn after. */
  wild: boolean("wild").notNull().default(false),
  nearAt: timestamp("near_at"),
  /** Wanted beasts (src/lib/bounties.ts): a name, tougher stats, their bounty. */
  title: text("title"),
  elite: boolean("elite").notNull().default(false),
  bountyId: integer("bounty_id"),
  /** Attackers of a random encounter (src/lib/encounters.ts). */
  encounterId: integer("encounter_id"),
}, (t) => [index("enemies_move_start_idx").on(t.moveStartAt)]);

export const webhookLogs = pgTable("webhook_logs", {
  id: serial("id").primaryKey(),
  npcId: integer("npc_id").notNull(),
  ok: boolean("ok").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Cosmetics + gem economy ----------
export const cosmeticItems = pgTable("cosmetic_items", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  slot: text("slot").notNull(),
  assetRef: text("asset_ref").notNull(),
  tintColor: text("tint_color"),
  rarity: text("rarity").notNull().default("common"),
  coinPrice: integer("coin_price").notNull().default(0),
  gemPrice: integer("gem_price").notNull().default(0),
  sponsorGrantedOnly: boolean("sponsor_granted_only").notNull().default(false),
  sponsorId: integer("sponsor_id"),
  availableFrom: timestamp("available_from"),
  availableUntil: timestamp("available_until"),
});

export const cosmeticOwnerships = pgTable(
  "cosmetic_ownerships",
  {
    characterId: integer("character_id").notNull(),
    itemKey: text("item_key").notNull(),
    acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
    source: text("source").notNull().default("coin"),
  },
  (t) => [index("cosmetic_owner_idx").on(t.characterId)],
);

export const characterEquipped = pgTable(
  "character_equipped",
  {
    characterId: integer("character_id").notNull(),
    slot: text("slot").notNull(),
    itemKey: text("item_key").notNull(),
    equippedAt: timestamp("equipped_at").defaultNow().notNull(),
  },
  (t) => [index("equipped_char_idx").on(t.characterId)],
);

/** The collection book: what each character has caught, grown, defeated,
 *  visited and met (kind = fish | crop | enemy | region | npc | page). */
export const characterCollection = pgTable(
  "character_collection",
  {
    characterId: integer("character_id").notNull(),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    count: integer("count").notNull().default(0),
    firstAt: timestamp("first_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("character_collection_pk").on(t.characterId, t.kind, t.key)],
);

/** Fog of war (src/lib/worldAtlas.ts): chunks a character has seen, as a
 *  64-bit mask per 8×8-chunk block — sparse, so it scales with exploring. */
export const characterMapSeen = pgTable(
  "character_map_seen",
  {
    characterId: integer("character_id").notNull(),
    bx: integer("bx").notNull(),
    by: integer("by").notNull(),
    mask: bigint("mask", { mode: "bigint" }).notNull(),
  },
  (t) => [uniqueIndex("character_map_seen_pk").on(t.characterId, t.bx, t.by)],
);

/** Random encounters in the wilds (src/lib/encounters.ts). */
export const encounters = pgTable("encounters", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  state: text("state").notNull().default("active"), // active | resolved
  npcId: integer("npc_id"),
  /** Players who struck one of its attackers (only they share a fight's reward). */
  fighters: jsonb("fighters").$type<number[]>().notNull().default([]),
  /** Players paid when it resolved. */
  rewarded: jsonb("rewarded").$type<number[]>().notNull().default([]),
  expiresAt: timestamp("expires_at").notNull(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Treasure maps (src/lib/treasure.ts): where each one leads. The bag item
 *  `treasure_map` carries only `{ mapId }`, so the spot never reaches the
 *  client; the sketch is drawn on the server. */
export const treasureMaps = pgTable(
  "treasure_maps",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id").notNull(),
    tx: integer("tx").notNull(),
    ty: integer("ty").notNull(),
    tier: integer("tier").notNull(),
    /** 1–3 on a trail to a legendary cache, else null. */
    part: integer("part"),
    /** Where the X sits in the sketch (tiles off its centre). */
    ox: integer("ox").notNull().default(0),
    oy: integer("oy").notNull().default(0),
    /** Who bought it from an innkeeper (null: earned). Counts toward the
     *  buyer's daily limit even if the map changes hands. */
    boughtBy: integer("bought_by"),
    dugAt: timestamp("dug_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("treasure_maps_char_idx").on(t.characterId)],
);

/** Saloon games (src/lib/saloonServer.ts). A player's blackjack hand in
 *  progress (the shoe stays here). */
export const saloonHands = pgTable("saloon_hands", {
  characterId: integer("character_id").primaryKey(),
  hand: jsonb("hand").$type<BlackjackHand>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** One liar's dice table per inn; `version` guards concurrent moves. */
export const diceTables = pgTable("dice_tables", {
  innKey: text("inn_key").primaryKey(),
  state: jsonb("state").$type<DiceTableState>().notNull(),
  version: integer("version").notNull().default(0),
});

/** Arm-wrestling matches: a player against the innkeeper (b null) or another player. */
export const armMatches = pgTable(
  "arm_matches",
  {
    id: serial("id").primaryKey(),
    innKey: text("inn_key").notNull(),
    a: integer("a").notNull(),
    b: integer("b"),
    status: text("status").notNull(), // invited | playing | done
    state: jsonb("state").$type<ArmMatchState>().notNull(),
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("arm_matches_a_idx").on(t.a), index("arm_matches_b_idx").on(t.b)],
);

/** Every game's result for a player: daily limits and the weekly leaderboard. */
export const saloonResults = pgTable(
  "saloon_results",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id").notNull(),
    game: text("game").notNull(),
    net: integer("net").notNull(),
    at: timestamp("at").defaultNow().notNull(),
  },
  (t) => [index("saloon_results_char_at_idx").on(t.characterId, t.at), index("saloon_results_at_idx").on(t.at)],
);

/** Navigation (src/lib/nav): the places each NPC knows (it can only route
 *  to those), and how it found out. */
export const npcKnownPlaces = pgTable(
  "npc_known_places",
  {
    npcId: integer("npc_id").notNull(),
    placeKey: text("place_key").notNull(),
    how: text("how").notNull().default("seen"), // seen | home | told
    learnedAt: timestamp("learned_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("npc_known_places_pk").on(t.npcId, t.placeKey)],
);

/** The blocks (game chunks) each NPC has walked through, for exploring. */
export const npcExplored = pgTable(
  "npc_explored",
  {
    npcId: integer("npc_id").notNull(),
    bx: integer("bx").notNull(),
    by: integer("by").notNull(),
  },
  (t) => [uniqueIndex("npc_explored_pk").on(t.npcId, t.bx, t.by)],
);

/** An NPC's trip: its planned route (every tile) and how far along it is. */
export const npcTrips = pgTable("npc_trips", {
  npcId: integer("npc_id").primaryKey(),
  destKey: text("dest_key"),
  destName: text("dest_name").notNull(),
  destX: real("dest_x").notNull(),
  destY: real("dest_y").notNull(),
  tiles: jsonb("tiles").$type<GridPoint[]>().notNull(),
  /** Index into `tiles` where the next segment starts. */
  idx: integer("idx").notNull().default(0),
  status: text("status").notNull().default("active"), // active | arrived | failed
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Wild patches a character has picked (src/lib/forage.ts): each player
 *  forages every patch on their own cooldown. */
export const forageClaims = pgTable(
  "forage_claims",
  {
    characterId: integer("character_id").notNull(),
    patch: text("patch").notNull(),
    at: timestamp("at").notNull(),
  },
  (t) => [uniqueIndex("forage_claims_pk").on(t.characterId, t.patch)],
);

/** Fresh batches of free bread set out on a bakery's table (src/lib/bakery.ts). */
export const breadBatches = pgTable(
  "bread_batches",
  {
    id: serial("id").primaryKey(),
    tableKey: text("table_key").notNull(),
    bakedAt: timestamp("baked_at").notNull(),
    qty: integer("qty").notNull(),
    taken: integer("taken").notNull().default(0),
  },
  (t) => [index("bread_batches_table_idx").on(t.tableKey, t.bakedAt)],
);

/** Who took a loaf from which batch: one per character per batch. */
export const breadClaims = pgTable(
  "bread_claims",
  {
    batchId: integer("batch_id").notNull(),
    characterId: integer("character_id").notNull(),
    at: timestamp("at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("bread_claims_pk").on(t.batchId, t.characterId)],
);

/** Bounties posted on a town's notice board (src/lib/bounties.ts). */
export const bounties = pgTable(
  "bounties",
  {
    id: serial("id").primaryKey(),
    town: text("town").notNull(),
    kind: text("kind").notNull(),
    data: jsonb("data").$type<BountyData>().notNull(),
    reward: jsonb("reward").$type<BountyReward>().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("bounties_town_idx").on(t.town, t.expiresAt)],
);

/** Bounties a character has taken. */
export const characterBounties = pgTable(
  "character_bounties",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id").notNull(),
    bountyId: integer("bounty_id").notNull(),
    progress: integer("progress").notNull().default(0),
    status: text("status").notNull().default("active"), // active | done (turned in)
    acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("character_bounties_pk").on(t.characterId, t.bountyId)],
);

/** Standing with each continent town (src/lib/reputation.ts). */
export const characterReputation = pgTable(
  "character_reputation",
  {
    characterId: integer("character_id").notNull(),
    town: text("town").notNull(),
    points: integer("points").notNull().default(0),
  },
  (t) => [uniqueIndex("character_reputation_pk").on(t.characterId, t.town)],
);

/** Waystones a character has attuned (fast-travel destinations). */
export const characterWaystones = pgTable(
  "character_waystones",
  {
    characterId: integer("character_id").notNull(),
    key: text("key").notNull(),
    attunedAt: timestamp("attuned_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("character_waystones_pk").on(t.characterId, t.key)],
);

/** Generated trees players are chopping or have felled (src/lib/trees.ts),
 *  by lattice corner. Felled while `regrow_at` is in the future. */
export const felledTrees = pgTable(
  "felled_trees",
  {
    vx: integer("vx").notNull(),
    vy: integer("vy").notNull(),
    hits: integer("hits").notNull().default(0),
    felledAt: timestamp("felled_at"),
    regrowAt: timestamp("regrow_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("felled_trees_pk").on(t.vx, t.vy), index("felled_trees_regrow_idx").on(t.regrowAt)],
);

/** Perks a character picked (one every 5 levels, see src/lib/progression.ts). */
export const characterPerks = pgTable(
  "character_perks",
  {
    characterId: integer("character_id").notNull(),
    perkKey: text("perk_key").notNull(),
    pickedAt: timestamp("picked_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("character_perks_pk").on(t.characterId, t.perkKey)],
);

export const gemTransactions = pgTable("gem_transactions", {
  id: serial("id").primaryKey(),
  characterId: integer("character_id").notNull(),
  delta: integer("delta").notNull(),
  source: text("source").notNull(),
  packKey: text("pack_key"),
  stripeSessionId: text("stripe_session_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Sponsor attribution ----------
export const sponsorEvents = pgTable(
  "sponsor_events",
  {
    id: serial("id").primaryKey(),
    sponsorId: integer("sponsor_id").notNull(),
    characterId: integer("character_id").notNull(),
    type: text("type").notNull(),
    utmSource: text("utm_source"),
    utmCampaign: text("utm_campaign"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("sponsor_events_sponsor_idx").on(t.sponsorId)],
);

// ---------- Friends ----------
export const friendRequests = pgTable(
  "friend_requests",
  {
    id: serial("id").primaryKey(),
    fromUserId: integer("from_user_id").notNull(),
    toUserId: integer("to_user_id").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [index("friend_requests_to_idx").on(t.toUserId)],
);

export const friendships = pgTable(
  "friendships",
  {
    userA: integer("user_a").notNull(),
    userB: integer("user_b").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("friendships_a_idx").on(t.userA), index("friendships_b_idx").on(t.userB)],
);

// ---------- Daily quests ----------
export const dailyQuests = pgTable(
  "daily_quests",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id").notNull(),
    forDate: text("for_date").notNull(),
    templateKey: text("template_key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    requirement: jsonb("requirement").$type<QuestRequirement>().notNull(),
    reward: jsonb("reward").$type<QuestReward>().notNull(),
    progress: integer("progress").notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [index("daily_quests_char_date_idx").on(t.characterId, t.forDate)],
);

export const streakStates = pgTable("streak_states", {
  characterId: integer("character_id").primaryKey(),
  current: integer("current").notNull().default(0),
  longest: integer("longest").notNull().default(0),
  lastCompletedOn: text("last_completed_on"),
  graceUsedOn: text("grace_used_on"),
});

// ---------- Activities ----------
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("live"),
  x: real("x").notNull(),
  y: real("y").notNull(),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  sponsorId: integer("sponsor_id"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const activityParticipants = pgTable(
  "activity_participants",
  {
    activityId: integer("activity_id").notNull(),
    characterId: integer("character_id").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
    score: integer("score"),
  },
  (t) => [index("activity_part_activity_idx").on(t.activityId)],
);

// Cosmetic / Sponsor / Friend type aliases re-exported for clarity
export type { CosmeticItem, CosmeticOwnership, CharacterEquipped, GemTransaction };
export type { SponsorEvent };
export type { FriendRequest, Friendship };
export type { DailyQuest, StreakState };
export type { Activity, ActivityParticipant };

// Registered with Drizzle so `drizzle-kit push` doesn't try to drop it.
// The view body itself is created at runtime by ensureOnlinePlayersView
// in `src/lib/onlinePlayers.ts` on every tickd / server boot — Drizzle
// leaves the body alone; we just acknowledge the relation exists.
export const onlinePlayersView = pgMaterializedView("online_players", {
  id: bigint("id", { mode: "number" }).notNull(),
  name: varchar("name").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  facing: varchar("facing").notNull(),
  appearance: jsonb("appearance").notNull(),
  level: integer("level").notNull(),
  hp: integer("hp").notNull(),
  max_hp: integer("max_hp").notNull(),
  coins: integer("coins").notNull(),
  gems: integer("gems").notNull(),
  xp: integer("xp").notNull(),
  last_seen_at: timestamp("last_seen_at").notNull(),
}).existing();

export const _drizzleHelpers = { uniqueIndex };
