// Lots: what a player can own. A home is a manifest cottage and its front
// garden (one per player, free to move in); a homestead is a site of
// parcels (src/lib/homestead.ts, claimed through homesteadServer.ts).
// Releasing one (or 14 days without logging in) frees it and clears what
// grew there.

import type { BuildingManifestEntry } from "./buildingManifest";
import { and, eq, gte, isNotNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { animals, characters, lotCheers, lots, resourceNodes } from "@/db/schema";
import { footprintOf, gardenCellsOf, gardenPlotsAt } from "./buildingManifest";
import { getBuildingDoor, getBuildingsManifest, getTemplate } from "./buildingsServer";
import { cheerDay } from "./cheers";
import { isBanner, resolveBanner } from "./lotBanner";
import { insideLot } from "./lotReach";
import type { GardenPlot, GardenResult, LotKind, LotSnapshot } from "@/types/garden";
import { clearRanch, ranchLooks, returnShowroom } from "./ranchServer";
import { clearParcels, homesteadPlots, parcelsByLot, syncHomesteadLots } from "./homesteadServer";
import { siteByKey } from "./homesteadSites";

/** Owners who haven't logged in for this long lose their lot. */
export const LOT_INACTIVE_RELEASE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Create / refresh one lot per reservable home in the manifest, and one per
 * open homestead site. Ownership is never touched here. Lots that are gone
 * (a house left the manifest; the land, ranch, vineyard, orchard and
 * workshop lots homesteads replaced) are cleared as if given up, then removed.
 */
export async function syncLotsFromManifest(): Promise<void> {
  const manifest = await getBuildingsManifest();
  const keep = new Set<string>();
  for (const entry of manifest.buildings) if (await upsertLotRow(entry)) keep.add(entry.key);
  for (const row of await db.select({ id: lots.id, key: lots.key, kind: lots.kind }).from(lots)) {
    if (row.kind === "homestead" && siteByKey(row.key)) continue; // sites, not manifest buildings (below)
    if (!keep.has(row.key)) {
      await clearLot(row.id); // crops, animals, machines; showroom pieces back to their owner
      await db.delete(lots).where(eq(lots.id, row.id));
    }
  }
  await syncHomesteadLots();
}

/** World-pixel garden plots of a lot (empty for lots without a garden). */
export async function plotsOfLot(lot: { id: number; key: string; kind: LotKind; tx: number; ty: number; buildingKey: string | null }): Promise<GardenPlot[]> {
  if (lot.kind === "homestead") return homesteadPlots(lot);
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
    .select({ lot: lots, ownerName: characters.name, cheers: characters.cheersReceived })
    .from(lots)
    .leftJoin(characters, eq(characters.id, lots.ownerId))
    .where(and(
      lte(lots.tx, x1), gte(sql`${lots.tx} + ${lots.tw}`, x0),
      lte(lots.ty, y1), gte(sql`${lots.ty} + ${lots.th}`, y0),
    ));
  // Homesteads show their parcels and what's been built on them (barn, silo, mill, hives…).
  const owned = rows.filter((r) => r.lot.kind === "homestead" && r.lot.ownerId != null);
  const parcels = await parcelsByLot(owned.map((r) => r.lot.id));
  const looks = await ranchLooks(owned.map((r) => r.lot.key));
  const doors = new Map<string, { x: number; y: number }>();
  for (const { lot } of rows) {
    // A homestead's banner flies at its signpost.
    const sign = lot.kind === "homestead" ? siteByKey(lot.key)?.sign : undefined;
    const d = sign ? { x: sign.tx * 16 + 8, y: sign.ty * 16 + 8 } : lot.ownerId != null && lot.buildingKey ? await getBuildingDoor(lot.buildingKey) : null;
    if (d) doors.set(lot.key, d);
  }
  return rows.map(({ lot, ownerName, cheers }) => {
    const look = looks.get(lot.key);
    const door = doors.get(lot.key);
    return {
      key: lot.key,
      kind: lot.kind,
      buildingKey: lot.buildingKey,
      owner: lot.ownerId != null ? { id: lot.ownerId, name: ownerName ?? "someone" } : null,
      ...(lot.ownerId != null ? { bounds: { tx: lot.tx, ty: lot.ty, tw: lot.tw, th: lot.th }, cheers: cheers ?? 0 } : {}),
      ...(lot.ownerId != null && door ? { banner: { ...resolveBanner(lot.ownerId, lot.bannerColor, lot.bannerEmblem), x: door.x, y: door.y } } : {}),
      ...(lot.kind === "homestead" ? { parcels: parcels.get(lot.id) ?? [], ...(door ? { sign: door } : {}) } : {}),
      // A homestead's buildings and machines go on its barn and workshop parcels (src/game/homesteadArt.ts).
      ...(look && lot.kind === "homestead" ? { ranch: { props: look.props, ox: lot.tx * 16, oy: lot.ty * 16, ...(look.display.length ? { display: look.display } : {}) } } : {}),
    };
  });
}

/** The home lot a character owns, if any. */
export async function homeLotOf(characterId: number) {
  const [row] = await db.select().from(lots).where(and(eq(lots.ownerId, characterId), eq(lots.kind, "home")));
  return row ?? null;
}

/**
 * Move into a home: it must be free, and you may have one. In one
 * transaction so two players can't both get it. (Homesteads are claimed at
 * their signpost: homesteadServer.ts claimHomestead.)
 */
export function acquireLot(characterId: number, key: string): Promise<GardenResult> {
  return db.transaction(async (tx) => {
    const [lot] = await tx.select().from(lots).where(eq(lots.key, key)).for("update");
    if (!lot) return { ok: false, error: "There's nothing to claim here." };
    if (lot.kind === "homestead") return { ok: false, error: "Claim a homestead at its signpost." };
    if (lot.ownerId === characterId) return { ok: false, error: "It's already yours." };
    if (lot.ownerId != null) return { ok: false, error: "Someone already lives here." };
    // Lock the character row so two parallel claims can't both pass the limit.
    await tx.select({ id: characters.id }).from(characters).where(eq(characters.id, characterId)).for("update");
    const owned = await tx.select({ id: lots.id }).from(lots).where(and(eq(lots.ownerId, characterId), eq(lots.kind, "home")));
    if (owned.length) return { ok: false, error: "You already have a home. Move out first." };
    // It flies the banner the owner already picked for their homestead, if any.
    const [flown] = await tx.select({ color: lots.bannerColor, emblem: lots.bannerEmblem }).from(lots)
      .where(and(eq(lots.ownerId, characterId), isNotNull(lots.bannerColor), isNotNull(lots.bannerEmblem))).limit(1);
    await tx.update(lots).set({ ownerId: characterId, acquiredAt: new Date(), bannerColor: flown?.color ?? null, bannerEmblem: flown?.emblem ?? null }).where(eq(lots.id, lot.id));
    return { ok: true, message: "Welcome home! The garden is yours to plant." };
  });
}

/** Give up the character's lot `key`. Clears its garden. */
export async function releaseLot(characterId: number, key: string): Promise<GardenResult> {
  const [lot] = await db.select().from(lots).where(eq(lots.key, key));
  if (!lot || lot.ownerId !== characterId) return { ok: false, error: lot?.kind === "homestead" ? "That isn't your homestead." : "That isn't your home." };
  await clearLot(lot.id);
  if (lot.kind === "homestead") return { ok: true, message: "You gave up the homestead. The land is for sale again; the furniture on show came back to your bag." };
  return { ok: true, message: "You've moved out. The garden was cleared." };
}

async function clearLot(lotId: number): Promise<void> {
  await db.delete(resourceNodes).where(eq(resourceNodes.lotId, lotId));
  // A homestead's animals belong to it (src/lib/ranch.ts).
  const [lot] = await db.select({ key: lots.key, ownerId: lots.ownerId }).from(lots).where(eq(lots.id, lotId));
  if (lot) {
    await db.delete(animals).where(eq(animals.ranchKey, lot.key));
    if (lot.ownerId != null) await returnShowroom(lot.key, lot.ownerId); // pieces on show go home with you
    await clearRanch(lot.key); // its buildings and workshop go with it (src/lib/ranchServer.ts)
    await clearParcels(lotId); // a homestead's land goes back to the site (src/lib/homesteadServer.ts)
  }
  await db.update(lots).set({ ownerId: null, acquiredAt: null, bannerColor: null, bannerEmblem: null }).where(eq(lots.id, lotId));
}

/** Give up every lot a character owns, as if they'd moved out (before deleting them). */
export async function releaseLotsOf(characterId: number): Promise<number> {
  const owned = await db.select({ id: lots.id }).from(lots).where(eq(lots.ownerId, characterId));
  for (const { id } of owned) await clearLot(id);
  return owned.length;
}

/** Pick the banner an owner flies: it applies to all their lots. Owner only; indices are checked against the palette. */
export async function setLotBanner(characterId: number, key: string, color: number, emblem: number): Promise<GardenResult> {
  if (!isBanner(color, emblem)) return { ok: false, error: "That isn't a banner you can fly." };
  const [mine] = await db.select({ id: lots.id }).from(lots).where(and(eq(lots.key, key), eq(lots.ownerId, characterId)));
  if (!mine) return { ok: false, error: "That isn't yours." };
  const done = await db.update(lots).set({ bannerColor: color, bannerEmblem: emblem }).where(eq(lots.ownerId, characterId)).returning({ id: lots.id });
  return { ok: true, message: done.length > 1 ? `Your banner is up on all ${done.length} of your lots.` : "Your banner is up." };
}

/**
 * Cheer someone's lot: you must be standing in it, it must be someone else's, and
 * each owner takes one cheer from you per UTC day. Their total (on all their lot
 * signs) goes up by one. `pos` is where the cheerer stands, in world px.
 */
export async function cheerLot(characterId: number, key: string, pos: { x: number; y: number }, now = Date.now()): Promise<GardenResult & { ownerId?: number; ownerName?: string }> {
  const [row] = await db
    .select({ lot: lots, ownerName: characters.name })
    .from(lots)
    .leftJoin(characters, eq(characters.id, lots.ownerId))
    .where(eq(lots.key, key));
  const lot = row?.lot;
  if (!lot || lot.ownerId == null) return { ok: false, error: "There's nobody to cheer here." };
  if (lot.ownerId === characterId) return { ok: false, error: "Cheer someone else's place. Yours already looks great." };
  if (!insideLot(lot, pos.x, pos.y)) return { ok: false, error: "Step into their lot to cheer it." };
  const ownerName = row.ownerName ?? "someone";
  const done = await db.transaction(async (tx) => {
    const inserted = await tx.insert(lotCheers).values({ ownerId: lot.ownerId!, cheererId: characterId, lotKey: key, day: cheerDay(now) }).onConflictDoNothing().returning({ id: lotCheers.id });
    if (inserted.length === 0) return false;
    await tx.update(characters).set({ cheersReceived: sql`${characters.cheersReceived} + 1` }).where(eq(characters.id, lot.ownerId!));
    return true;
  });
  if (!done) return { ok: false, error: `You've already cheered ${ownerName} today. Come back tomorrow!` };
  return { ok: true, message: `You cheered ${ownerName}'s place! 👏`, ownerId: lot.ownerId, ownerName };
}

/** Where each of a character's lots shows its sign (a home's door, a homestead's signpost), to refresh them for onlookers. */
export async function signPointsOfOwner(characterId: number): Promise<{ x: number; y: number }[]> {
  const rows = await db.select({ key: lots.key, kind: lots.kind, buildingKey: lots.buildingKey }).from(lots).where(eq(lots.ownerId, characterId));
  const out: { x: number; y: number }[] = [];
  for (const r of rows) {
    const sign = r.kind === "homestead" ? siteByKey(r.key)?.sign : undefined;
    const p = sign ? { x: sign.tx * 16 + 8, y: sign.ty * 16 + 8 } : r.buildingKey ? await getBuildingDoor(r.buildingKey) : null;
    if (p) out.push(p);
  }
  return out;
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

/** Create or update the `lots` row of a manifest entry; false when it isn't a lot (only reservable homes are). */
export async function upsertLotRow(entry: BuildingManifestEntry): Promise<boolean> {
  if (entry.kind !== "home" || entry.reservable === false) return false;
  const template = await getTemplate(entry);
  const fp = footprintOf(template);
  // The lot = the house's footprint grown to include its garden cells.
  let [x0, y0, x1, y1] = [fp.x, fp.y, fp.x + fp.tw - 1, fp.y + fp.th - 1];
  for (const c of gardenCellsOf(template)) {
    x0 = Math.min(x0, c.dx); y0 = Math.min(y0, c.dy);
    x1 = Math.max(x1, c.dx + 1); y1 = Math.max(y1, c.dy);
  }
  const values = { key: entry.key, kind: "home" as LotKind, buildingKey: entry.key, tx: entry.tx + x0, ty: entry.ty + y0, tw: x1 - x0 + 1, th: y1 - y0 + 1 };
  await db.insert(lots).values(values).onConflictDoUpdate({
    target: lots.key,
    set: { kind: values.kind, buildingKey: values.buildingKey, tx: values.tx, ty: values.ty, tw: values.tw, th: values.th },
  });
  return true;
}
