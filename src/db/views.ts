// Read-only projections that are NOT tables. Kept out of schema.ts so
// `drizzle-kit push` never tries to manage them. The online_players
// materialized view is created by src/lib/onlinePlayers.ts.
//
// Keep the columns in sync with the CREATE MATERIALIZED VIEW statement
// in onlinePlayers.ts and with the PlayerRow projection in snapshot.ts.

import { integer, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import type { Appearance } from "@/types/domain";

export const onlinePlayers = pgTable("online_players", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  facing: text("facing").notNull(),
  appearance: jsonb("appearance").$type<Appearance>().notNull(),
  level: integer("level").notNull(),
  hp: integer("hp").notNull(),
  maxHp: integer("max_hp").notNull(),
  coins: integer("coins").notNull(),
  gems: integer("gems").notNull(),
  xp: integer("xp").notNull(),
  lastSeenAt: timestamp("last_seen_at").notNull(),
});
