// Lots: parcels of land a player can own. Today every lot is a "home" lot —
// a manifest building plus its front garden. Land lots without a building
// and player-to-player resale (price / for_sale) are planned; the schema
// already carries them so they're additive.
//
// Rules (v1):
//   - one home lot per player (also enforced by a unique index);
//   - acquiring costs the lot's `price` in coins (0 = free to move in);
//   - releasing (or 14 days without logging in) frees the lot and clears
//     the garden.

import { and, eq, gte, isNotNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, lots, resourceNodes } from "@/db/schema";
import { footprintOf, gardenCellsOf, gardenPlotsAt } from "./buildingManifest";
import { getBuildingsManifest, getTemplate } from "./buildingsServer";
import type { GardenPlot, GardenResult, LotSnapshot } from "@/types/garden";

/** Owners who haven't logged in for this long lose their lot. */
export const LOT_INACTIVE_RELEASE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Create / refresh one home lot per reservable home building in the
 * manifest. Ownership is never touched here; lots whose building left the
 * manifest are removed along with their gardens.
 */
export async function syncLotsFromManifest(): Promise<void> {
  const manifest = await getBuildingsManifest();
  const keep = new Set<string>();
  for (const entry of manifest.buildings) {
    if (entry.kind !== "home" || entry.reservable === false) continue;
    const template = await getTemplate(entry);
    const fp = footprintOf(template);
    // Parcel = house footprint grown to include its garden cells.
    let [x0, y0, x1, y1] = [fp.x, fp.y, fp.x + fp.tw - 1, fp.y + fp.th - 1];
    for (const c of gardenCellsOf(template)) {
      x0 = Math.min(x0, c.dx); y0 = Math.min(y0, c.dy);
      x1 = Math.max(x1, c.dx + 1); y1 = Math.max(y1, c.dy);
    }
    const values = {
      key: entry.key,
      kind: "home" as const,
      buildingKey: entry.key,
      tx: entry.tx + x0,
      ty: entry.ty + y0,
      tw: x1 - x0 + 1,
      th: y1 - y0 + 1,
      price: Math.max(0, Math.floor(entry.price ?? 0)),
    };
    keep.add(entry.key);
    await db.insert(lots).values(values).onConflictDoUpdate({
      target: lots.key,
      set: { kind: values.kind, buildingKey: values.buildingKey, tx: values.tx, ty: values.ty, tw: values.tw, th: values.th, price: values.price },
    });
  }
  for (const row of await db.select({ id: lots.id, key: lots.key, kind: lots.kind }).from(lots)) {
    if (row.kind === "home" && !keep.has(row.key)) {
      await db.delete(resourceNodes).where(eq(resourceNodes.lotId, row.id));
      await db.delete(lots).where(eq(lots.id, row.id));
    }
  }
}

/** World-pixel garden plots of a lot (empty for lots without a garden). */
export async function plotsOfLot(lot: { buildingKey: string | null }): Promise<GardenPlot[]> {
  if (!lot.buildingKey) return [];
  const manifest = await getBuildingsManifest();
  const entry = manifest.buildings.find((b) => b.key === lot.buildingKey);
  if (!entry) return [];
  return gardenPlotsAt(entry.tx, entry.ty, await getTemplate(entry));
}

/** Lots overlapping a world-pixel box, with owner names, for snapshots. */
export async function lotsInBox(box: { xMin: number; xMax: number; yMin: number; yMax: number }): Promise<LotSnapshot[]> {
  // Compare in whole tiles. Player positions are fractional, and Postgres
  // types a parameter compared against an integer expression as integer,
  // so pixel bounds like 2764.37 would make the query (and the snapshot) fail.
  const T = 16;
  const [x0, x1] = [Math.floor(box.xMin / T), Math.ceil(box.xMax / T)];
  const [y0, y1] = [Math.floor(box.yMin / T), Math.ceil(box.yMax / T)];
  const rows = await db
    .select({ lot: lots, ownerName: characters.name })
    .from(lots)
    .leftJoin(characters, eq(characters.id, lots.ownerId))
    .where(and(
      lte(lots.tx, x1), gte(sql`${lots.tx} + ${lots.tw}`, x0),
      lte(lots.ty, y1), gte(sql`${lots.ty} + ${lots.th}`, y0),
    ));
  return rows.map(({ lot, ownerName }) => ({
    key: lot.key,
    kind: lot.kind,
    buildingKey: lot.buildingKey,
    owner: lot.ownerId != null ? { id: lot.ownerId, name: ownerName ?? "someone" } : null,
    price: lot.price,
    forSale: lot.forSale,
  }));
}

/** The home lot a character owns, if any. */
export async function homeLotOf(characterId: number) {
  const [row] = await db.select().from(lots).where(and(eq(lots.ownerId, characterId), eq(lots.kind, "home")));
  return row ?? null;
}

/**
 * Acquire a lot: it must be free (or listed for sale — resale lands later),
 * the player must not already own a home, and must afford the price.
 * Everything happens in one transaction so two players can't both get it.
 */
export async function acquireLot(characterId: number, key: string): Promise<GardenResult> {
  return db.transaction(async (tx) => {
    const [lot] = await tx.select().from(lots).where(eq(lots.key, key)).for("update");
    if (!lot) return { ok: false, error: "There's nothing to claim here." };
    if (lot.ownerId === characterId) return { ok: false, error: "It's already yours." };
    if (lot.ownerId != null) return { ok: false, error: "Someone already lives here." };
    const [owned] = await tx.select({ id: lots.id }).from(lots).where(and(eq(lots.ownerId, characterId), eq(lots.kind, lot.kind)));
    if (owned) return { ok: false, error: "You already have a home. Move out first." };
    if (lot.price > 0) {
      const paid = await tx
        .update(characters)
        .set({ coins: sql`${characters.coins} - ${lot.price}` })
        .where(and(eq(characters.id, characterId), gte(characters.coins, lot.price)))
        .returning({ id: characters.id });
      if (paid.length === 0) return { ok: false, error: `You need ${lot.price} coins.` };
    }
    await tx.update(lots).set({ ownerId: characterId, acquiredAt: new Date(), forSale: false }).where(eq(lots.id, lot.id));
    return { ok: true, message: lot.price > 0 ? `It's yours, for ${lot.price} coins. Welcome home!` : "Welcome home! The garden is yours to plant." };
  });
}

/** Give up the character's lot `key`. Clears its garden. */
export async function releaseLot(characterId: number, key: string): Promise<GardenResult> {
  const [lot] = await db.select().from(lots).where(eq(lots.key, key));
  if (!lot || lot.ownerId !== characterId) return { ok: false, error: "That isn't your home." };
  await clearLot(lot.id);
  return { ok: true, message: "You've moved out. The garden was cleared." };
}

async function clearLot(lotId: number): Promise<void> {
  await db.delete(resourceNodes).where(eq(resourceNodes.lotId, lotId));
  await db.update(lots).set({ ownerId: null, acquiredAt: null, forSale: false }).where(eq(lots.id, lotId));
}

/** Free lots whose owners haven't been seen for LOT_INACTIVE_RELEASE_MS. */
export async function releaseInactiveLots(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - LOT_INACTIVE_RELEASE_MS);
  const stale = await db
    .select({ id: lots.id })
    .from(lots)
    .innerJoin(characters, eq(characters.id, lots.ownerId))
    .where(and(isNotNull(lots.ownerId), lt(characters.lastSeenAt, cutoff)));
  for (const { id } of stale) await clearLot(id);
  return stale.length;
}
