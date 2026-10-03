// Server side of the collection book: record discoveries, build the book
// view, claim page rewards, and pick a nameplate title.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterCollection, characters } from "@/db/schema";
import { addCoins } from "./game";
import { ACHIEVEMENTS, achievementsDone, collectionPages, pageComplete } from "./collection";
import type { CollectionBookView, CollectionCounts, CollectionKind } from "./collection";
import { NPC_DEFS } from "./seed";
import { reputationTitles } from "./reputationServer";
import { TUTORIAL_DONE } from "./tutorial";

/**
 * Count `qty` of an entry. Returns true the first time this character
 * finds it (for "📖 New: …" toasts).
 */
export async function recordCollection(characterId: number, kind: CollectionKind, key: string, qty = 1): Promise<boolean> {
  const [row] = await db
    .insert(characterCollection)
    .values({ characterId, kind, key, count: qty })
    .onConflictDoUpdate({
      target: [characterCollection.characterId, characterCollection.kind, characterCollection.key],
      set: { count: sql`${characterCollection.count} + ${qty}` },
    })
    .returning({ count: characterCollection.count });
  return (row?.count ?? 0) === qty;
}

/** Everything a character has collected, by kind. */
export async function collectionCounts(characterId: number): Promise<CollectionCounts & { page?: Record<string, number> }> {
  const rows = await db.select().from(characterCollection).where(eq(characterCollection.characterId, characterId));
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.kind] ??= {})[r.key] = r.count;
  return out;
}

const folk = () => NPC_DEFS.map((n) => ({ key: n.key, name: n.name, icon: "🧑" }));

/** Titles a character may wear: completed+claimed pages and achievements. */
async function unlockedTitles(characterId: number, counts: Awaited<ReturnType<typeof collectionCounts>>, level: number, tutorialStep: number): Promise<string[]> {
  const pages = collectionPages(folk()).filter((p) => (counts.page?.[p.key] ?? 0) > 0).map((p) => p.reward.title);
  const done = achievementsDone(counts, level, tutorialStep === TUTORIAL_DONE);
  return [...ACHIEVEMENTS.filter((a) => done.has(a.key)).map((a) => a.title), ...pages, ...(await reputationTitles(characterId))];
}

export async function bookView(characterId: number): Promise<CollectionBookView> {
  const [c] = await db.select({ level: characters.level, title: characters.title, tutorialStep: characters.tutorialStep }).from(characters).where(eq(characters.id, characterId));
  const counts = await collectionCounts(characterId);
  const done = achievementsDone(counts, c?.level ?? 1, c?.tutorialStep === TUTORIAL_DONE);
  return {
    pages: collectionPages(folk()).map((p) => ({
      ...p,
      entries: p.entries.map((e) => ({ ...e, count: counts[p.kind]?.[e.key] ?? 0 })),
      claimed: (counts.page?.[p.key] ?? 0) > 0,
    })),
    achievements: ACHIEVEMENTS.map((a) => ({ ...a, done: done.has(a.key) })),
    titles: await unlockedTitles(characterId, counts, c?.level ?? 1, c?.tutorialStep ?? 0),
    title: c?.title ?? null,
  };
}

/** Claim a completed page's reward (once). */
export async function claimPage(characterId: number, pageKey: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const page = collectionPages(folk()).find((p) => p.key === pageKey);
  if (!page) return { ok: false, error: "No such page." };
  const counts = await collectionCounts(characterId);
  if (!pageComplete(page, counts)) return { ok: false, error: "Find everything on this page first." };
  const first = await db
    .insert(characterCollection)
    .values({ characterId, kind: "page", key: page.key, count: 1 })
    .onConflictDoNothing()
    .returning({ key: characterCollection.key });
  if (first.length === 0) return { ok: false, error: "Already claimed." };
  await addCoins(characterId, page.reward.coins);
  return { ok: true, message: `📖 ${page.name} page complete! +${page.reward.coins} coins and the title “${page.reward.title}”.` };
}

/** Wear an unlocked title (or none). */
export async function setTitle(characterId: number, title: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (title !== null) {
    const [c] = await db.select({ level: characters.level, tutorialStep: characters.tutorialStep }).from(characters).where(eq(characters.id, characterId));
    const titles = await unlockedTitles(characterId, await collectionCounts(characterId), c?.level ?? 1, c?.tutorialStep ?? 0);
    if (!titles.includes(title)) return { ok: false, error: "You haven't earned that title." };
  }
  await db.update(characters).set({ title }).where(and(eq(characters.id, characterId)));
  return { ok: true };
}
