// Reports and bans: a player reports another (with their latest chat lines
// kept as evidence); an admin reads the open reports and suspends accounts.
// A suspended account can't sign in, its sessions end, its chat lines go,
// and it disappears from public pages.

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, reports, sessions, users, worldChat } from "@/db/schema";
import type { ReportView } from "@/types/moderation";

/** File a report. Returns an error message, or null when it's filed. */
export async function fileReport(reporterId: number, targetId: number, reason: string): Promise<string | null> {
  if (reporterId === targetId) return "You can't report yourself.";
  const [target] = await db.select({ id: characters.id }).from(characters).where(eq(characters.id, targetId));
  if (!target) return "There's nobody by that name.";
  const lines = await db.select({ text: worldChat.text }).from(worldChat)
    .where(and(eq(worldChat.speakerType, "player"), eq(worldChat.speakerId, targetId)))
    .orderBy(desc(worldChat.id)).limit(8);
  await db.insert(reports).values({ reporterId, targetId, reason: reason.slice(0, 200), chat: lines.map((l) => l.text).reverse() });
  return null;
}

/** Open reports, newest first, with names (admin). */
export async function openReports(limit = 100): Promise<ReportView[]> {
  const rows = await db.select().from(reports).where(isNull(reports.resolvedAt)).orderBy(desc(reports.createdAt)).limit(limit);
  const ids = [...new Set(rows.flatMap((r) => [r.reporterId, r.targetId]))];
  const people = ids.length
    ? await db.select({ id: characters.id, name: characters.name, username: users.username }).from(characters).leftJoin(users, eq(users.id, characters.userId)).where(inArray(characters.id, ids))
    : [];
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.targetId, (counts.get(r.targetId) ?? 0) + 1);
  const who = (id: number) => people.find((p) => p.id === id);
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    reason: r.reason,
    chat: r.chat,
    reporter: { characterId: r.reporterId, name: who(r.reporterId)?.name ?? "?" },
    target: { characterId: r.targetId, name: who(r.targetId)?.name ?? "?", username: who(r.targetId)?.username ?? null, reports: counts.get(r.targetId) ?? 0 },
  }));
}

/** Suspend (or reinstate) an account by username. Returns what happened, or null if no such user. */
export async function setBanned(username: string, banned: boolean): Promise<string | null> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.username, username.toLowerCase()));
  if (!u) return null;
  await db.update(users).set({ bannedAt: banned ? new Date() : null }).where(eq(users.id, u.id));
  if (!banned) return `${username} is reinstated.`;
  const [c] = await db.select({ id: characters.id }).from(characters).where(eq(characters.userId, u.id));
  await db.delete(sessions).where(eq(sessions.userId, u.id)); // signed out everywhere
  if (c) {
    const gone = await db.delete(worldChat).where(and(eq(worldChat.speakerType, "player"), eq(worldChat.speakerId, c.id))).returning({ id: worldChat.id });
    await db.update(reports).set({ resolvedAt: sql`now()` }).where(and(eq(reports.targetId, c.id), isNull(reports.resolvedAt)));
    return `${username} is suspended; ${gone.length} chat line${gone.length === 1 ? "" : "s"} removed.`;
  }
  return `${username} is suspended.`;
}

/** Is this character's account suspended? (Public pages hide them.) */
export async function isCharacterBanned(characterId: number): Promise<boolean> {
  const [r] = await db.select({ bannedAt: users.bannedAt }).from(characters).innerJoin(users, eq(users.id, characters.userId)).where(eq(characters.id, characterId));
  return !!r?.bannedAt;
}
