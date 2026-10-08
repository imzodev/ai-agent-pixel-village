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

import { maybeOpenRows } from "./lotRowsServer";
import type { BuildingManifestEntry } from "./buildingManifest";
import { and, eq, gte, isNotNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { animals, characters, lots, resourceNodes } from "@/db/schema";
import { footprintOf, gardenCellsOf, gardenPlotsAt } from "./buildingManifest";
import { getBuildingsManifest, getTemplate } from "./buildingsServer";
import type { GardenPlot, GardenResult, LotKind, LotSnapshot } from "@/types/garden";
import { landLotLimit } from "./progression";
import { clearRanch, ranchLooks, returnShowroom } from "./ranchServer";

/** Owners who haven't logged in for this long lose their lot. */
export const LOT_INACTIVE_RELEASE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Create / refresh one lot per reservable home building and per land
 * entry in the manifest. Ownership is never touched here; lots whose building left the
 * manifest are removed along with their gardens.
 */
export async function syncLotsFromManifest(): Promise<void> {
  const manifest = await getBuildingsManifest();
  const keep = new Set<string>();
  for (const entry of manifest.buildings) if (await upsertLotRow(entry)) keep.add(entry.key);
  for (const row of await db.select({ id: lots.id, key: lots.key, kind: lots.kind }).from(lots)) {
    if (!keep.has(row.key)) {
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
  // Ranches show what's been built on them (silo, mill, hives…).
  const ranchKeys = rows.filter((r) => (r.lot.kind === "ranch" || r.lot.kind === "vineyard" || r.lot.kind === "workshop" || r.lot.kind === "orchard") && r.lot.ownerId != null).map((r) => r.lot.key);
  const looks = await ranchLooks(ranchKeys);
  const manifest = looks.size ? (await getBuildingsManifest()).buildings : [];
  return rows.map(({ lot, ownerName }) => {
    const look = looks.get(lot.key);
    const shown = !!look && (look.props.length > 0 || look.display.length > 0);
    const entry = shown ? manifest.find((b) => b.key === lot.buildingKey) : undefined;
    return {
      key: lot.key,
      kind: lot.kind,
      buildingKey: lot.buildingKey,
      owner: lot.ownerId != null ? { id: lot.ownerId, name: ownerName ?? "someone" } : null,
      price: lot.price,
      forSale: lot.forSale,
      ...(look && entry ? { ranch: { props: look.props, ox: entry.tx * 16, oy: entry.ty * 16, ...(look.display.length ? { display: look.display } : {}) } } : {}),
    };
  });
}

/** The home lot a character owns, if any. */
export async function homeLotOf(characterId: number) {
  const [row] = await db.select().from(lots).where(and(eq(lots.ownerId, characterId), eq(lots.kind, "home")));
  return row ?? null;
}

/**
 * Acquire a lot: it must be free (or listed for sale — resale lands later),
 * the player must be under their limit for that kind (one home; one land
 * lot, two from level 10), and must afford the price.
 * Everything happens in one transaction so two players can't both get it.
 */
export async function acquireLot(characterId: number, key: string): Promise<GardenResult> {
  const r = await acquireLotTx(characterId, key);
  // Once it's committed: if this kind's open lots are now full enough, the
  // next homestead row opens for everyone (src/lib/lotRowsServer.ts).
  if (r.ok) {
    const [lot] = await db.select({ kind: lots.kind }).from(lots).where(eq(lots.key, key));
    if (lot && lot.kind !== "home") void maybeOpenRows([lot.kind]).catch((err) => console.warn("[lots] opening rows failed:", err instanceof Error ? err.message : err));
  }
  return r;
}

function acquireLotTx(characterId: number, key: string): Promise<GardenResult> {
  return db.transaction(async (tx) => {
    const [lot] = await tx.select().from(lots).where(eq(lots.key, key)).for("update");
    if (!lot) return { ok: false, error: "There's nothing to claim here." };
    if (lot.ownerId === characterId) return { ok: false, error: "It's already yours." };
    const land = lot.kind === "land";
    const ranch = lot.kind === "ranch";
    const vineyard = lot.kind === "vineyard";
    const workshop = lot.kind === "workshop";
    const orchard = lot.kind === "orchard";
    if (lot.ownerId != null) return { ok: false, error: land ? "Someone already farms this land." : ranch ? "Someone already keeps animals here." : vineyard ? "Someone already tends these vines." : workshop ? "Someone already works here." : orchard ? "Someone already tends this orchard." : "Someone already lives here." };
    // Lock the character row so two parallel claims can't both pass the limit.
    const [me] = await tx.select({ level: characters.level }).from(characters).where(eq(characters.id, characterId)).for("update");
    const limit = land ? landLotLimit(me?.level ?? 1) : 1;
    const owned = await tx.select({ id: lots.id }).from(lots).where(and(eq(lots.ownerId, characterId), eq(lots.kind, lot.kind)));
    if (owned.length >= limit) {
      if (ranch) return { ok: false, error: "You already have a ranch. Give it up first." };
      if (vineyard) return { ok: false, error: "You already have a vineyard. Give it up first." };
      if (workshop) return { ok: false, error: "You already have a workshop. Give it up first." };
      if (orchard) return { ok: false, error: "You already have an orchard. Give it up first." };
      if (!land) return { ok: false, error: "You already have a home. Move out first." };
      return { ok: false, error: limit > 1 ? `You already farm ${limit} plots of land.` : "You already have a plot of land. Reach level 10 for a second one, or give it up first." };
    }
    if (lot.price > 0) {
      const paid = await tx
        .update(characters)
        .set({ coins: sql`${characters.coins} - ${lot.price}` })
        .where(and(eq(characters.id, characterId), gte(characters.coins, lot.price)))
        .returning({ id: characters.id });
      if (paid.length === 0) return { ok: false, error: `You need ${lot.price} coins.` };
    }
    await tx.update(lots).set({ ownerId: characterId, acquiredAt: new Date(), forSale: false }).where(eq(lots.id, lot.id));
    if (land) return { ok: true, message: lot.price > 0 ? `The land is yours, for ${lot.price} coins. Happy planting!` : "The land is yours! Plant away." };
    if (ranch) return { ok: true, message: `The ranch is yours${lot.price > 0 ? `, for ${lot.price} coins` : ""}! Step through the gate to stock the coop and the barn.` };
    if (orchard) return { ok: true, message: `The orchard is yours${lot.price > 0 ? `, for ${lot.price} coins` : ""}! Saplings come from the towns whose land suits them: lemons and oranges from the desert, cherries and pears from the hills…` };
    if (workshop) return { ok: true, message: `The workshop is yours${lot.price > 0 ? `, for ${lot.price} coins` : ""}! Saw your logs into planks and get building.` };
    if (vineyard) return { ok: true, message: `The vineyard is yours${lot.price > 0 ? `, for ${lot.price} coins` : ""}! Pip sells grape cuttings and apple saplings.` };
    return { ok: true, message: lot.price > 0 ? `It's yours, for ${lot.price} coins. Welcome home!` : "Welcome home! The garden is yours to plant." };
  });
}

/** Give up the character's lot `key`. Clears its garden. */
export async function releaseLot(characterId: number, key: string): Promise<GardenResult> {
  const [lot] = await db.select().from(lots).where(eq(lots.key, key));
  if (!lot || lot.ownerId !== characterId) return { ok: false, error: lot?.kind === "land" ? "That isn't your land." : lot?.kind === "ranch" ? "That isn't your ranch." : lot?.kind === "vineyard" ? "That isn't your vineyard." : lot?.kind === "workshop" ? "That isn't your workshop." : lot?.kind === "orchard" ? "That isn't your orchard." : "That isn't your home." };
  await clearLot(lot.id);
  if (lot.kind === "land") return { ok: true, message: "You gave up the land. Its crops were cleared." };
  if (lot.kind === "ranch") return { ok: true, message: "You gave up the ranch. Your animals went to a good home." };
  if (lot.kind === "vineyard") return { ok: true, message: "You gave up the vineyard. The vines will wait for a new keeper." };
  if (lot.kind === "workshop") return { ok: true, message: "You gave up the workshop. The furniture on show came back to your bag." };
  if (lot.kind === "orchard") return { ok: true, message: "You gave up the orchard. The trees will wait for a new keeper." };
  return { ok: true, message: "You've moved out. The garden was cleared." };
}

async function clearLot(lotId: number): Promise<void> {
  await db.delete(resourceNodes).where(eq(resourceNodes.lotId, lotId));
  // A ranch's animals belong to the ranch (src/lib/ranch.ts).
  const [lot] = await db.select({ key: lots.key, ownerId: lots.ownerId }).from(lots).where(eq(lots.id, lotId));
  if (lot) {
    await db.delete(animals).where(eq(animals.ranchKey, lot.key));
    if (lot.ownerId != null) await returnShowroom(lot.key, lot.ownerId); // a workshop's pieces on show go home with you
    await clearRanch(lot.key); // its buildings and workshop go with it (src/lib/ranchServer.ts)
  }
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

/** Create or update the `lots` row of a manifest entry; false when it isn't a lot. */
export async function upsertLotRow(entry: BuildingManifestEntry): Promise<boolean> {
  // Home lots come from reservable houses; land lots are fenced fields;
  // ranch lots are the pens south of the fields.
  const kind: LotKind | null = entry.kind === "land" ? "land" : entry.kind === "ranch" ? "ranch" : entry.kind === "vineyard" ? "vineyard" : entry.kind === "workshop" ? "workshop" : entry.kind === "orchard" ? "orchard" : entry.kind === "home" && entry.reservable !== false ? "home" : null;
  if (!kind) return false;
  const template = await getTemplate(entry);
  const fp = footprintOf(template);
  // Parcel = footprint (house, or a land lot's front fence) grown to include its garden cells.
  let [x0, y0, x1, y1] = [fp.x, fp.y, fp.x + fp.tw - 1, fp.y + fp.th - 1];
  for (const c of gardenCellsOf(template)) {
    x0 = Math.min(x0, c.dx); y0 = Math.min(y0, c.dy);
    x1 = Math.max(x1, c.dx + 1); y1 = Math.max(y1, c.dy);
  }
  const values = {
    key: entry.key,
    kind,
    buildingKey: entry.key,
    tx: entry.tx + x0,
    ty: entry.ty + y0,
    tw: x1 - x0 + 1,
    th: y1 - y0 + 1,
    price: Math.max(0, Math.floor(entry.price ?? 0)),
  };
  await db.insert(lots).values(values).onConflictDoUpdate({
    target: lots.key,
    set: { kind: values.kind, buildingKey: values.buildingKey, tx: values.tx, ty: values.ty, tw: values.tw, th: values.th, price: values.price },
  });
  return true;
}
