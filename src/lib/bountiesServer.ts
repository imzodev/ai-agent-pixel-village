// The world side of the bounty boards (src/lib/bounties.ts): posting new
// bounties (tickd keeps every board full), wanted beasts, and taking,
// progressing and turning in bounties.

import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bounties, characterBounties, characters, enemies, inventory } from "@/db/schema";
import { TOWNS, townAt } from "./settlements";
import { biomeAt, inHeartland } from "./continent";
import { regionAt } from "./regions";
import { enemyKind } from "./progression";
import { wildKindFor } from "./wildlife";
import { isWalkableServer } from "./chunkCollisionServer";
import { tileCenter, tileOf } from "./motion";
import { addItem, logEvent, recalcLevel, removeItem } from "./game";
import { addReputation } from "./reputationServer";
import { townName } from "./reputation";
import {
  BOARD_REACH_PX, BOUNTY_TTL_MS, GATHER, MAX_ACTIVE, OPEN_PER_TOWN, SPOT_REACH_PX, WANTED_HP_MULT,
  boardPoint, describe, pickKind, rewardFor, targetOf, titleOf, wantedName,
} from "./bounties";
import type { BountyData, BountyView } from "@/types/bounty";
import type { TownDef } from "@/types/settlement";

const near = (a: { x: number; y: number }, b: { x: number; y: number }, r: number) => Math.hypot(a.x - b.x, a.y - b.y) <= r;

/** A walkable spot out in the wilds 50–160 tiles from a town. */
async function wildSpot(t: TownDef): Promise<{ x: number; y: number } | null> {
  const cx = t.sq.tx + 12, cy = t.sq.ty + 7;
  for (let k = 0; k < 20; k++) {
    const ang = Math.random() * Math.PI * 2, d = 50 + Math.random() * 110;
    const tile = tileOf((cx + Math.cos(ang) * d) * 16, (cy + Math.sin(ang) * d * 0.7) * 16);
    if (inHeartland(tile.tx, tile.ty) || townAt(tile.tx, tile.ty)) continue;
    const at = tileCenter(tile);
    if (await isWalkableServer(at.x, at.y)) return at;
  }
  return null;
}

/** The wild kinds near a town (what its hunts ask for). */
function huntKinds(t: TownDef): string[] {
  const out = new Set<string>();
  for (let k = 0; k < 40; k++) {
    const kind = wildKindFor(biomeAt(t.sq.tx + 12 + (k % 8 - 4) * 20, t.sq.ty + 7 + (Math.floor(k / 8) - 2) * 20), 3, false, () => (k * 0.61) % 1);
    if (kind) out.add(kind);
  }
  return [...out];
}

/** Post one bounty on `t`'s board; null when no good spot was found. */
async function post(t: TownDef, wantedOpen: boolean, now: Date): Promise<boolean> {
  const kind = pickKind(Math.random, wantedOpen);
  let data: BountyData | null = null;
  if (kind === "hunt") {
    const kinds = huntKinds(t);
    if (kinds.length) data = { kind, enemyKind: kinds[Math.floor(Math.random() * kinds.length)], qty: 3 + Math.floor(Math.random() * 5) };
  } else if (kind === "gather") {
    const items = GATHER[t.family];
    data = { kind, itemKey: items[Math.floor(Math.random() * items.length)], qty: 3 + Math.floor(Math.random() * 6) };
  } else if (kind === "delivery") {
    const others = TOWNS.filter((o) => o.key !== t.key);
    if (others.length) data = { kind, toTown: others[Math.floor(Math.random() * others.length)].key };
  } else {
    const spot = await wildSpot(t);
    if (spot) {
      const place = regionAt(spot.x, spot.y)?.name ?? "the wilds";
      if (kind === "explore") data = { kind, x: spot.x, y: spot.y, place: place.replace(/^the /, "") };
      else {
        const t2 = tileOf(spot.x, spot.y);
        const found = wildKindFor(biomeAt(t2.tx, t2.ty), 3, false) ?? "wolf";
        const ek = found === "slime" || found === "bat" ? "wolf" : found;
        data = { kind, enemyKind: ek, name: wantedName(Math.random, ek), x: spot.x, y: spot.y };
      }
    }
  }
  if (!data) return false;
  const [row] = await db.insert(bounties).values({ town: t.key, kind: data.kind, data, reward: rewardFor(data), expiresAt: new Date(now.getTime() + BOUNTY_TTL_MS) }).returning({ id: bounties.id });
  if (data.kind === "wanted") {
    // The beast waits at its spot until slain or the bounty lapses.
    const hp = enemyKind(data.enemyKind).hp * WANTED_HP_MULT;
    const [e] = await db.insert(enemies).values({
      kind: data.enemyKind, x: data.x, y: data.y, targetX: data.x, targetY: data.y, hp, maxHp: hp, spawnedAt: now,
      title: data.name, elite: true, bountyId: row.id,
    }).returning({ id: enemies.id });
    await db.update(bounties).set({ data: { ...data, enemyId: e.id } }).where(eq(bounties.id, row.id));
  }
  return true;
}

/** Keep every board full: drop lapsed bounties (and their beasts), post new ones. */
export async function refreshBounties(now = new Date()): Promise<void> {
  const lapsed = await db.select({ id: bounties.id }).from(bounties).where(lte(bounties.expiresAt, now));
  if (lapsed.length) {
    const ids = lapsed.map((b) => b.id);
    await db.delete(enemies).where(inArray(enemies.bountyId, ids));
    await db.delete(characterBounties).where(and(inArray(characterBounties.bountyId, ids), eq(characterBounties.status, "active")));
    await db.delete(bounties).where(inArray(bounties.id, ids));
  }
  const open = await db.select({ town: bounties.town, kind: bounties.kind }).from(bounties).where(gt(bounties.expiresAt, now));
  for (const t of TOWNS) {
    const mine = open.filter((b) => b.town === t.key);
    if (mine.length < OPEN_PER_TOWN) await post(t, mine.some((b) => b.kind === "wanted"), now); // one per board per refresh
  }
}

// ── Views ────────────────────────────────────────────────────────────────
async function views(rows: (typeof bounties.$inferSelect)[], characterId: number): Promise<BountyView[]> {
  if (rows.length === 0) return [];
  const mine = await db.select().from(characterBounties).where(and(eq(characterBounties.characterId, characterId), inArray(characterBounties.bountyId, rows.map((r) => r.id))));
  const gather = rows.filter((r) => r.data.kind === "gather").map((r) => (r.data as { itemKey: string }).itemKey);
  const bag = gather.length ? await db.select({ itemKey: inventory.itemKey, qty: inventory.qty }).from(inventory).where(and(eq(inventory.characterId, characterId), inArray(inventory.itemKey, gather))) : [];
  return rows.map((r) => {
    const m = mine.find((x) => x.bountyId === r.id);
    const target = targetOf(r.data);
    // Gathering counts what's in your bag.
    const progress = m && r.data.kind === "gather" ? Math.min(target, bag.filter((b) => b.itemKey === (r.data as { itemKey: string }).itemKey).reduce((s, b) => s + b.qty, 0)) : m?.progress ?? 0;
    return {
      id: r.id, town: r.town, townName: townName(r.town), title: titleOf(r.data), description: describe(r.data),
      data: r.data, reward: r.reward, expiresAt: r.expiresAt.getTime(),
      mine: m ? { progress, target, status: m.status as "active" | "done" } : null,
    };
  });
}

/** A town's board: its open bounties, with your progress on the ones you took. */
export async function boardView(characterId: number, town: string): Promise<BountyView[]> {
  const rows = await db.select().from(bounties).where(and(eq(bounties.town, town), gt(bounties.expiresAt, new Date()))).orderBy(bounties.id);
  return (await views(rows, characterId)).filter((v) => v.mine?.status !== "done");
}

/** Your active bounties (any town). */
export async function myBounties(characterId: number): Promise<BountyView[]> {
  const taken = await db.select({ id: characterBounties.bountyId }).from(characterBounties).where(and(eq(characterBounties.characterId, characterId), eq(characterBounties.status, "active")));
  if (!taken.length) return [];
  const rows = await db.select().from(bounties).where(inArray(bounties.id, taken.map((t) => t.id)));
  return views(rows, characterId);
}

// ── Actions ──────────────────────────────────────────────────────────────
type Result = { ok: true; message: string; notices?: string[] } | { ok: false; error: string };

export async function acceptBounty(characterId: number, id: number, pos: { x: number; y: number }): Promise<Result> {
  const [b] = await db.select().from(bounties).where(eq(bounties.id, id));
  if (!b || b.expiresAt <= new Date()) return { ok: false, error: "That bounty's been taken down." };
  const board = boardPoint(b.town);
  if (!board || !near(pos, board, BOARD_REACH_PX)) return { ok: false, error: "Read the board up close." };
  const active = await db.select({ id: characterBounties.id }).from(characterBounties).where(and(eq(characterBounties.characterId, characterId), eq(characterBounties.status, "active")));
  if (active.length >= MAX_ACTIVE) return { ok: false, error: `You can carry ${MAX_ACTIVE} bounties at a time. Finish or drop one first.` };
  const added = await db.insert(characterBounties).values({ characterId, bountyId: id }).onConflictDoNothing().returning({ id: characterBounties.id });
  if (!added.length) return { ok: false, error: "You've already taken that one." };
  if (b.data.kind === "delivery") await addItem(characterId, "parcel", 1);
  return { ok: true, message: `📜 Bounty taken: ${titleOf(b.data)}.` };
}

export async function abandonBounty(characterId: number, id: number): Promise<Result> {
  const [row] = await db.delete(characterBounties).where(and(eq(characterBounties.characterId, characterId), eq(characterBounties.bountyId, id), eq(characterBounties.status, "active"))).returning({ id: characterBounties.id });
  if (!row) return { ok: false, error: "You don't have that bounty." };
  const [b] = await db.select().from(bounties).where(eq(bounties.id, id));
  if (b?.data.kind === "delivery") await removeItem(characterId, "parcel", 1);
  return { ok: true, message: "Bounty dropped." };
}

/** A kill counts toward your hunts of that kind. */
export async function progressHunts(characterId: number, enemyKindKey: string): Promise<string[]> {
  const rows = await db.select({ cb: characterBounties, b: bounties }).from(characterBounties)
    .innerJoin(bounties, eq(bounties.id, characterBounties.bountyId))
    .where(and(eq(characterBounties.characterId, characterId), eq(characterBounties.status, "active"), eq(bounties.kind, "hunt")));
  const out: string[] = [];
  for (const { cb, b } of rows) {
    if (b.data.kind !== "hunt" || b.data.enemyKind !== enemyKindKey || cb.progress >= b.data.qty) continue;
    await db.update(characterBounties).set({ progress: cb.progress + 1 }).where(eq(characterBounties.id, cb.id));
    if (cb.progress + 1 >= b.data.qty) out.push(`📜 ${titleOf(b.data)} — done! Return to ${townName(b.town)}'s board.`);
  }
  return out;
}

/** A wanted beast fell: everyone near it who carries its bounty gets the credit. */
export async function wantedSlain(bountyId: number, characterIds: number[]): Promise<void> {
  if (!characterIds.length) return;
  await db.update(characterBounties).set({ progress: 1 })
    .where(and(eq(characterBounties.bountyId, bountyId), eq(characterBounties.status, "active"), inArray(characterBounties.characterId, characterIds)));
}

/** You reached an explore spot, or a delivery's town board. */
export async function arriveAt(characterId: number, id: number, pos: { x: number; y: number }): Promise<Result> {
  const [row] = await db.select({ cb: characterBounties, b: bounties }).from(characterBounties).innerJoin(bounties, eq(bounties.id, characterBounties.bountyId))
    .where(and(eq(characterBounties.characterId, characterId), eq(characterBounties.bountyId, id), eq(characterBounties.status, "active")));
  if (!row || row.cb.progress >= 1) return { ok: false, error: "Nothing to do here." };
  const d = row.b.data;
  if (d.kind === "explore") {
    if (!near(pos, d, SPOT_REACH_PX)) return { ok: false, error: "Not quite there yet." };
  } else if (d.kind === "delivery") {
    const board = boardPoint(d.toTown);
    if (!board || !near(pos, board, BOARD_REACH_PX)) return { ok: false, error: `Take the parcel to ${townName(d.toTown)}'s board.` };
    if (!(await removeItem(characterId, "parcel", 1))) return { ok: false, error: "You've lost the parcel!" };
  } else return { ok: false, error: "Nothing to do here." };
  await db.update(characterBounties).set({ progress: 1 }).where(eq(characterBounties.id, row.cb.id));
  return { ok: true, message: d.kind === "explore" ? `🔭 You've scouted ${d.place}. Report back to ${townName(row.b.town)}.` : `📦 Parcel delivered. Collect your pay in ${townName(row.b.town)}.` };
}

/** Turn a finished bounty in at the board that posted it. */
export async function turnIn(characterId: number, id: number, pos: { x: number; y: number }): Promise<Result> {
  const [row] = await db.select({ cb: characterBounties, b: bounties }).from(characterBounties).innerJoin(bounties, eq(bounties.id, characterBounties.bountyId))
    .where(and(eq(characterBounties.characterId, characterId), eq(characterBounties.bountyId, id), eq(characterBounties.status, "active")));
  if (!row) return { ok: false, error: "You don't have that bounty." };
  const board = boardPoint(row.b.town);
  if (!board || !near(pos, board, BOARD_REACH_PX)) return { ok: false, error: `Turn it in at ${townName(row.b.town)}'s board.` };
  const d = row.b.data;
  if (d.kind === "gather") {
    if (!(await removeItem(characterId, d.itemKey, d.qty))) return { ok: false, error: `You need ${d.qty} ${d.itemKey.replace(/_/g, " ")}.` };
  } else if (row.cb.progress < targetOf(d)) return { ok: false, error: "That job isn't finished yet." };
  const done = await db.update(characterBounties).set({ status: "done" }).where(and(eq(characterBounties.id, row.cb.id), eq(characterBounties.status, "active"))).returning({ id: characterBounties.id });
  if (!done.length) return { ok: false, error: "Already paid." };
  const r = row.b.reward;
  await db.update(characters).set({ coins: sql`${characters.coins} + ${r.coins}`, xp: sql`${characters.xp} + ${r.xp}` }).where(eq(characters.id, characterId));
  await recalcLevel(characterId);
  const rep = await addReputation(characterId, row.b.town, r.rep);
  const [me] = await db.select({ name: characters.name }).from(characters).where(eq(characters.id, characterId));
  if (d.kind === "wanted") void logEvent("bounty", `${me?.name ?? "Someone"} brought down ${d.name} for ${townName(row.b.town)}!`, "character", characterId).catch(() => {});
  const notices = rep.reached ? [`🏘️ ${townName(row.b.town)} now sees you as ${rep.reached}!`] : [];
  return { ok: true, message: `💰 Bounty paid: +${r.coins} 🪙, +${r.xp} XP, +${r.rep} standing in ${townName(row.b.town)}.`, notices };
}
