// Moments, the server part: record a proud milestone (from the API route
// where it happened), list a player's unseen ones (/api/me shows them a
// share card), and look one up for its public page. Rules: src/lib/moments.ts.

import crypto from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { characters, moments, users } from "@/db/schema";
import type { Moment, MomentData, MomentKind, MomentNotice, MomentView } from "@/types/moments";

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** A 10-character slug (no look-alike letters), for /m/<id>. */
export function momentId(): string {
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/**
 * Record a moment. One per character and `dedupeKey` (a repeat is ignored).
 * Never throws: it's a side effect of the real action, which must not fail
 * because a card couldn't be saved.
 */
export async function createMoment(characterId: number, kind: MomentKind, data: MomentData, dedupeKey: string): Promise<void> {
  try {
    await db.insert(moments).values({ id: momentId(), characterId, kind, data, dedupeKey }).onConflictDoNothing();
  } catch (e) {
    console.warn("[moments]", e instanceof Error ? e.message : e);
  }
}

/** Moments the player hasn't seen the share card for yet (oldest first, a few at most). */
export async function unseenMoments(characterId: number): Promise<MomentNotice[]> {
  const rows = await db.select().from(moments)
    .where(and(eq(moments.characterId, characterId), isNull(moments.seenAt)))
    .orderBy(moments.createdAt).limit(5);
  return rows.map((m) => ({ id: m.id, kind: m.kind, data: m.data, createdAt: m.createdAt.toISOString() }));
}

export async function markSeen(id: string, characterId: number): Promise<void> {
  await db.update(moments).set({ seenAt: new Date() }).where(and(eq(moments.id, id), eq(moments.characterId, characterId)));
}

/** A moment with its player's name and username (null when the id is unknown). */
export async function momentById(id: string): Promise<MomentView | null> {
  if (!/^[A-Za-z0-9]{6,20}$/.test(id)) return null;
  const [r] = await db.select({ m: moments, name: characters.name, username: users.username })
    .from(moments)
    .innerJoin(characters, eq(characters.id, moments.characterId))
    .leftJoin(users, eq(users.id, characters.userId))
    .where(eq(moments.id, id));
  return r ? { ...(r.m as Moment), characterName: r.name, username: r.username } : null;
}

/** A player's latest moments (their profile). */
export async function recentMoments(characterId: number, limit = 6): Promise<Moment[]> {
  return (await db.select().from(moments).where(eq(moments.characterId, characterId)).orderBy(desc(moments.createdAt)).limit(limit)) as Moment[];
}
