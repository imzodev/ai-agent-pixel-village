import {
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
} from "drizzle-orm/pg-core";

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
export type Appearance = {
  body: "male" | "female";
  skin: string; // hex tint
  hair: string; // hair style key
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
};

export const characters = pgTable("characters", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  name: text("name").notNull(),
  appearance: jsonb("appearance").$type<Appearance>().notNull(),
  x: real("x").notNull().default(1024),
  y: real("y").notNull().default(760),
  facing: text("facing").notNull().default("down"),
  coins: integer("coins").notNull().default(20),
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
});

// ---------- Buildings & Sponsors ----------
export const sponsors = pgTable("sponsors", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  website: text("website"),
  brandColor: text("brand_color").notNull().default("#e76f51"),
  tagline: text("tagline").notNull().default(""),
  pitch: text("pitch").notNull(), // what the agent should weave in
  persona: text("persona").notNull(), // the NPC character description
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
});

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
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("npcs_sponsor_idx").on(t.sponsorId)],
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
});

// ---------- Items ----------
export type ItemKind =
  | "material"
  | "consumable"
  | "tool"
  | "furniture"
  | "discount"
  | "recipe"
  | "hat"
  | "trophy";

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

export const groundItems = pgTable("ground_items", {
  id: serial("id").primaryKey(),
  itemKey: text("item_key").notNull(),
  qty: integer("qty").notNull().default(1),
  x: real("x").notNull(),
  y: real("y").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  droppedBy: integer("dropped_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const homeDecor = pgTable("home_decor", {
  id: serial("id").primaryKey(),
  characterId: integer("character_id").notNull(),
  itemKey: text("item_key").notNull(),
  gx: integer("gx").notNull(),
  gy: integer("gy").notNull(),
});

// ---------- Missions ----------
export type MissionRequirement =
  | { type: "collect"; itemKey: string; qty: number }
  | { type: "pet"; species: string; qty: number }
  | { type: "defeat"; enemyKind: string; qty: number }
  | { type: "visit"; buildingKey: string }
  | { type: "talk"; npcKey: string };

export type MissionReward = {
  coins?: number;
  xp?: number;
  items?: { itemKey: string; qty: number }[];
};

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
export const worldChat = pgTable("world_chat", {
  id: serial("id").primaryKey(),
  speakerType: text("speaker_type").notNull(), // player | npc
  speakerId: integer("speaker_id").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

export const resourceNodes = pgTable("resource_nodes", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // berry_bush | herb_patch | rock | mushroom_ring
  itemKey: text("item_key").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  qty: integer("qty").notNull().default(3),
  respawnAt: timestamp("respawn_at"),
});

export const enemies = pgTable("enemies", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // slime | bat | thornling
  x: real("x").notNull(),
  y: real("y").notNull(),
  targetX: real("target_x"),
  targetY: real("target_y"),
  hp: integer("hp").notNull(),
  maxHp: integer("max_hp").notNull(),
  spawnedAt: timestamp("spawned_at").defaultNow().notNull(),
});

export const webhookLogs = pgTable("webhook_logs", {
  id: serial("id").primaryKey(),
  npcId: integer("npc_id").notNull(),
  ok: boolean("ok").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const _drizzleHelpers = { uniqueIndex };
