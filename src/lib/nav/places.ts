// Places NPCs can know about and travel to, and how they find out about
// them. The world's places come from data the game already has: every
// building's door (shops, inns, homes, waystones, the cave), the towns, and
// the named regions and provinces. An NPC only routes to places it knows:
// it knows its home surroundings from the start and discovers the rest by
// walking near them (src/lib/nav/trips.ts). Server only.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { npcExplored, npcKnownPlaces } from "@/db/schema";
import { getBuildingDoor, getBuildingsManifest } from "@/lib/buildingsServer";
import { PLACES } from "@/lib/regions";
import { TOWNS } from "@/lib/settlements";
import { BLOCK_H, BLOCK_W } from "./route";
import type { Place } from "@/types/nav";

/** Walking this close to a place (px) teaches an NPC about it. */
export const DISCOVER_PX = 12 * 16;
/** What an NPC knows from the start: places this close to its home (px). */
export const HOME_KNOWLEDGE_PX = 20 * 16;

let registry: Promise<Place[]> | null = null;

/** Every place in the world (built once). */
export function allPlaces(): Promise<Place[]> {
  registry ??= (async () => {
    const out: Place[] = [];
    for (const b of (await getBuildingsManifest()).buildings) {
      const door = await getBuildingDoor(b.key);
      // Stand just in front of the door.
      if (door) out.push({ key: `building:${b.key}`, name: b.name, kind: b.kind ?? "building", x: door.x, y: door.y + 20 });
    }
    for (const t of TOWNS) out.push({ key: `town:${t.key}`, name: t.name, kind: "town", x: (t.sq.tx + 12) * 16, y: (t.sq.ty + 12) * 16 });
    for (const r of PLACES) {
      if (r.key.startsWith("town_")) continue; // the town itself is above
      const at = r.label ?? { tx: Math.round((r.tx0 + r.tx1) / 2), ty: Math.round((r.ty0 + r.ty1) / 2) };
      out.push({ key: `region:${r.key}`, name: r.name, kind: "region", x: at.tx * 16 + 8, y: at.ty * 16 + 8 });
    }
    return out;
  })();
  return registry;
}

export async function placeByKey(key: string): Promise<Place | undefined> {
  return (await allPlaces()).find((p) => p.key === key);
}

/** The places an NPC knows. */
export async function knownPlaces(npcId: number): Promise<Place[]> {
  const rows = await db.select({ key: npcKnownPlaces.placeKey }).from(npcKnownPlaces).where(eq(npcKnownPlaces.npcId, npcId));
  const keys = new Set(rows.map((r) => r.key));
  return (await allPlaces()).filter((p) => keys.has(p.key));
}

/** Teach an NPC about places (no-op for ones it knows). */
export async function learnPlaces(npcId: number, keys: readonly string[], how: "seen" | "home" | "told"): Promise<string[]> {
  if (!keys.length) return [];
  const rows = await db.insert(npcKnownPlaces).values(keys.map((placeKey) => ({ npcId, placeKey, how }))).onConflictDoNothing().returning({ key: npcKnownPlaces.placeKey });
  return rows.map((r) => r.key);
}

/** Places near a point (px). */
export async function placesNear(x: number, y: number, r: number): Promise<Place[]> {
  return (await allPlaces()).filter((p) => Math.hypot(p.x - x, p.y - y) <= r);
}

/** An NPC walks by (x, y): it learns the places close by and that it's been in this block. Returns what's new. */
export async function discoverAround(npcId: number, x: number, y: number): Promise<Place[]> {
  const near = await placesNear(x, y, DISCOVER_PX);
  const fresh = await learnPlaces(npcId, near.map((p) => p.key), "seen");
  await db.insert(npcExplored).values({ npcId, bx: Math.floor(x / 16 / BLOCK_W), by: Math.floor(y / 16 / BLOCK_H) }).onConflictDoNothing();
  return near.filter((p) => fresh.includes(p.key));
}

/** First time: an NPC knows what's around its home. */
export async function seedHomeKnowledge(npcId: number, homeX: number, homeY: number): Promise<void> {
  const [any] = await db.select({ k: npcKnownPlaces.placeKey }).from(npcKnownPlaces).where(eq(npcKnownPlaces.npcId, npcId)).limit(1);
  if (any) return;
  await learnPlaces(npcId, (await placesNear(homeX, homeY, HOME_KNOWLEDGE_PX)).map((p) => p.key), "home");
}

/** Has this NPC been through these blocks? */
export async function exploredBlocks(npcId: number, blocks: readonly { bx: number; by: number }[]): Promise<Set<string>> {
  if (!blocks.length) return new Set();
  const rows = await db.select().from(npcExplored).where(and(eq(npcExplored.npcId, npcId), inArray(npcExplored.bx, [...new Set(blocks.map((b) => b.bx))])));
  return new Set(rows.map((r) => `${r.bx},${r.by}`));
}
