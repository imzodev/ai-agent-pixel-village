// A player's public profile: who they are, what they've won and found, who
// in the world calls them a friend, and their latest moments. Read-only
// (/u/[username] and its share card).

import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { characters, inventory, lots, npcRegard, npcs, ranchState, users } from "@/db/schema";
import { LAIR_BOSSES } from "@/lib/lairs";
import { BOSS_REWARD } from "@/lib/progression";
import { RELICS, RELIC_SETS } from "@/lib/relics";
import { farmLevel } from "@/lib/ranchUpgrades";
import { bookView, collectionCounts } from "@/lib/collectionServer";
import { FISH_DEFS } from "@/lib/fishing";
import { ENEMY_KINDS } from "@/lib/progression";
import { reputationView } from "@/lib/reputationServer";
import { repTier } from "@/lib/reputation";
import { relicsFound } from "@/lib/relicsServer";
import { recentMoments } from "@/lib/momentsServer";
import { titleCase } from "@/lib/moments";
import { lookOf } from "@/lib/cards/look";
import type { CollectionBookView, CollectionCounts } from "@/types/collection";
import type { Profile, ProfileBookHighlights, ProfileTrophy } from "@/types/profile";

/** Every trophy and legendary weapon worth showing, and where it comes from. */
const SHELF: readonly Omit<ProfileTrophy, "name">[] = [
  ...LAIR_BOSSES.flatMap((b) => [
    { itemKey: b.trophy, from: `${b.name}, ${b.lair}`, legendary: false },
    { itemKey: b.unique, from: `${b.name}'s legendary weapon`, legendary: true },
  ]),
  { itemKey: BOSS_REWARD.itemKey, from: "the Old Rootking", legendary: false },
];

export async function loadProfile(username: string): Promise<Profile | null> {
  const [row] = await db.select({ user: users, character: characters }).from(users)
    .innerJoin(characters, eq(characters.userId, users.id))
    .where(and(eq(users.username, username), isNull(users.bannedAt))).limit(1); // suspended accounts aren't shown
  if (!row) return null;
  const id = row.character.id;
  const look = await lookOf(id);
  if (!look) return null;

  const [owned, book, counts, rep, myLots, found, friends, latest] = await Promise.all([
    db.select({ itemKey: inventory.itemKey }).from(inventory).where(and(eq(inventory.characterId, id), inArray(inventory.itemKey, SHELF.map((s) => s.itemKey)))),
    bookView(id),
    collectionCounts(id),
    reputationView(id),
    db.select({ key: lots.key, kind: lots.kind }).from(lots).where(eq(lots.ownerId, id)),
    relicsFound(id),
    db.select({ key: npcs.key, name: npcs.name, role: npcs.role }).from(npcRegard).innerJoin(npcs, eq(npcs.id, npcRegard.npcId))
      .where(and(eq(npcRegard.characterId, id), gte(npcRegard.score, 10))),
    recentMoments(id, 6),
  ]);

  const have = new Set(owned.map((o) => o.itemKey));
  const entries = book.pages.flatMap((p) => p.entries);
  const ranchLot = myLots.find((l) => l.kind === "ranch");
  const [ranch] = ranchLot ? await db.select({ farmXp: ranchState.farmXp }).from(ranchState).where(eq(ranchState.lotKey, ranchLot.key)) : [];
  const foundSet = new Set(found);

  return {
    username,
    look,
    memberSince: row.character.createdAt,
    lastSeen: row.character.lastSeenAt,
    trophies: SHELF.filter((s) => have.has(s.itemKey)).map((s) => ({ ...s, name: titleCase(s.itemKey) })),
    collectionPct: entries.length ? Math.round((100 * entries.filter((e) => e.count > 0).length) / entries.length) : 0,
    achievements: book.achievements.map((a) => ({ name: a.name, description: a.description, done: a.done })),
    bookPages: book.pages.map((p) => ({ name: p.name, icon: p.icon, found: p.entries.filter((e) => e.count > 0).length, total: p.entries.length, claimed: p.claimed })),
    book: bookHighlights(book, counts),
    reputation: rep.filter((r) => r.points > 0 && r.tier !== repTier(0).name).sort((a, b) => b.points - a.points).slice(0, 3).map((r) => ({ town: r.name, tier: r.tier })),
    lots: [...new Set(myLots.map((l) => l.kind))],
    farmLevel: ranch ? farmLevel(ranch.farmXp) : null,
    relicSets: RELIC_SETS.filter((s) => RELICS.filter((r) => r.set === s.key).every((r) => foundSet.has(r.key))).map((s) => s.name),
    dearFriends: friends,
    moments: latest,
  };
}

const RARITY_RANK: Record<string, number> = { legendary: 0, rare: 1 };
const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((n, v) => n + v, 0);

/** The book's best bits: totals, the rarest fish and the toughest creatures beaten. */
function bookHighlights(book: CollectionBookView, counts: CollectionCounts): ProfileBookHighlights {
  const page = (kind: string) => book.pages.find((p) => p.kind === kind);
  const got = (kind: string) => (page(kind)?.entries ?? []).filter((e) => e.count > 0);
  const rareFish = FISH_DEFS.filter((f) => f.rarity in RARITY_RANK && (counts.fish?.[f.key] ?? 0) > 0)
    .sort((a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity])
    .map((f) => ({ name: f.name, icon: f.icon, note: f.rarity }));
  const toughness = (key: string) => { const t = ENEMY_KINDS[key]?.tier; return t === "boss" ? 99 : (t ?? 0); };
  const toughest = got("enemy").sort((a, b) => toughness(b.key) - toughness(a.key)).slice(0, 5)
    .map((e) => { const t = ENEMY_KINDS[e.key]?.tier; return { name: e.name, icon: e.icon, note: t === "boss" ? "boss" : `tier ${t ?? 1}` }; });
  const places = page("region")?.entries ?? [];
  const towns = places.filter((e) => e.key.startsWith("town_"));
  return {
    fishCaught: sum(counts.fish),
    rareFish,
    creaturesBeaten: sum(counts.enemy),
    toughest,
    towns: { visited: towns.filter((e) => e.count > 0).length, total: towns.length },
    places: { visited: places.filter((e) => e.count > 0).length, total: places.length },
    folk: { met: got("npc").length, total: page("npc")?.entries.length ?? 0 },
    cropsHarvested: sum(counts.crop),
    chestsDug: counts.treasure?.chest ?? 0,
    lostCache: (counts.treasure?.cache ?? 0) > 0,
  };
}
