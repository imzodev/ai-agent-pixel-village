// Homesteads, the server side (rules: src/lib/homestead.ts). A homestead is
// a `lots` row of kind "homestead" keyed by its site (homesteadSites.ts), so
// everything that works on lots works on it: crops are its resource nodes
// (plot = plotIndex(parcel, i)), animals carry its key as ranch_key, its
// machines live in ranch_state, and the banner, cheers and the 14-day
// release are the lots'. What's its own: the parcels (homestead_parcels)
// and what each one is for.
//
// Sites open in blocks, nearest the village first: block 0 always, the next
// once OPEN_AT of the open sites are claimed (`homestead_blocks`).
// A site's lot row exists once its block is open.

import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { animals, characters, homesteadBlocks, homesteadParcels, lots, ranchState, resourceNodes } from "@/db/schema";
import { setDynamicBlocks } from "./chunkCollision";
import { logEvent } from "@/lib/game";
import {
  GRID, PARCEL_PRICE, PARCEL_TILES, PARCEL_USES, STARTER, buyableCells, canAddAnimal, canBuyParcel,
  canClaimHomestead, canSetUse, capFor, isParcelUse, nextCapAt, onParcels, parcelRect, pens, plotIndex, plotOffsets,
  spaceTotal, spaceUsed, changeCost, buildingTiles, BUILDING_KEY,
} from "./homestead";
import { SITES, SITE_TILES, siteByKey } from "./homesteadSites";
import type { GardenPlot, GardenResult } from "@/types/garden";
import type { HomesteadView, Parcel, ParcelCell, ParcelUse, UseChangeCost } from "@/types/homestead";
import type { RanchSpecies } from "@/types/ranch";
import type { BuildingParcels } from "@/types/ranchGrowth";

/** The parcels a new homestead starts with: two fields above, two pastures below. */
const STARTER_USES: readonly ParcelUse[] = ["field", "field", "pasture", "pasture"];
/** Share of the open sites that must be claimed before the next block opens. */
export const OPEN_AT = 0.8;

type LotLike = { id: number; key: string; tx: number; ty: number };

/** A homestead's parcels. */
export async function parcelsOf(lotId: number): Promise<Parcel[]> {
  const rows = await db.select({ col: homesteadParcels.col, row: homesteadParcels.row, use: homesteadParcels.use }).from(homesteadParcels).where(eq(homesteadParcels.lotId, lotId));
  return rows.map((r) => ({ col: r.col, row: r.row, use: isParcelUse(r.use) ? r.use : "wild" }));
}

/** Parcels of several homesteads at once (for snapshots). */
export async function parcelsByLot(lotIds: readonly number[]): Promise<Map<number, Parcel[]>> {
  const out = new Map<number, Parcel[]>();
  if (!lotIds.length) return out;
  const rows = await db.select().from(homesteadParcels).where(inArray(homesteadParcels.lotId, [...lotIds]));
  for (const r of rows) {
    const list = out.get(r.lotId) ?? [];
    list.push({ col: r.col, row: r.row, use: isParcelUse(r.use) ? r.use : "wild" });
    out.set(r.lotId, list);
  }
  return out;
}

/** World-pixel crop plots of a homestead, with the parcel each one is on. */
export async function homesteadPlots(lot: LotLike): Promise<(GardenPlot & { use: ParcelUse })[]> {
  const out: (GardenPlot & { use: ParcelUse })[] = [];
  for (const p of await parcelsOf(lot.id)) {
    plotOffsets(p.use).forEach((o, i) => out.push({
      plot: plotIndex(p, i),
      x: (lot.tx + p.col * PARCEL_TILES) * 16 + o.x,
      y: (lot.ty + p.row * PARCEL_TILES) * 16 + o.y,
      use: p.use,
    }));
  }
  return out;
}

/** Is a world pixel on one of the homestead's own parcels? */
export async function onHomestead(lot: LotLike, x: number, y: number): Promise<boolean> {
  return onParcels(lot, await parcelsOf(lot.id), x, y);
}

/** Whether a homestead has a barn parcel and a workshop parcel (for its buildings). */
export async function buildingParcels(lotKey: string): Promise<BuildingParcels> {
  const rows = await db.select({ use: homesteadParcels.use }).from(homesteadParcels).innerJoin(lots, eq(lots.id, homesteadParcels.lotId))
    .where(and(eq(lots.key, lotKey), inArray(homesteadParcels.use, ["barn", "workshop"])));
  return { barn: rows.some((r) => r.use === "barn"), workshop: rows.some((r) => r.use === "workshop") };
}

// ── What blocks: the standing barns and workshops ───────────────────────
const blocks = globalThis as typeof globalThis & { __hsBlocks?: { at: number; keys: Set<string> } };
const BLOCKS_REFRESH_MS = 60_000;

/**
 * Put every homestead's standing buildings into the walkability layer
 * (chunkCollision.setDynamicBlocks), at most once a minute per process, or
 * now with `force` (after a build or a use change here).
 */
export async function refreshHomesteadBlocks(force = false, now = Date.now()): Promise<void> {
  const st = (blocks.__hsBlocks ??= { at: 0, keys: new Set() });
  if (!force && now - st.at < BLOCKS_REFRESH_MS) return;
  st.at = now;
  const rows = await db.select({ id: lots.id, key: lots.key, tx: lots.tx, ty: lots.ty, machines: ranchState.machines }).from(lots)
    .innerJoin(ranchState, eq(ranchState.lotKey, lots.key))
    .where(and(eq(lots.kind, "homestead"), isNotNull(lots.ownerId), sql`(${ranchState.machines} @> '["hs_barn"]'::jsonb or ${ranchState.machines} @> '["hs_workshop"]'::jsonb)`));
  const parcels = await parcelsByLot(rows.map((r) => r.id));
  const seen = new Set<string>();
  for (const r of rows) {
    setDynamicBlocks(r.key, buildingTiles(r, parcels.get(r.id) ?? [], r.machines));
    seen.add(r.key);
  }
  for (const k of st.keys) if (!seen.has(k)) setDynamicBlocks(k, []);
  st.keys = seen;
}

/** The homestead lots a character holds. */
export async function homesteadsOf(characterId: number) {
  return db.select().from(lots).where(and(eq(lots.ownerId, characterId), eq(lots.kind, "homestead")));
}

// ── Sites and blocks ──────────────────────────────────────────────────

/** The blocks open now (0 always). */
async function openBlocks(): Promise<Set<number>> {
  const rows = await db.select({ block: homesteadBlocks.block }).from(homesteadBlocks);
  return new Set([0, ...rows.map((r) => r.block)]);
}

/** Make sure every site in an open block has its lot row (ownership untouched). */
export async function syncHomesteadLots(): Promise<number> {
  const open = await openBlocks();
  let n = 0;
  for (const s of SITES) {
    if (!open.has(s.block)) continue;
    const [was] = await db.select({ id: lots.id, tx: lots.tx, ty: lots.ty, ownerId: lots.ownerId }).from(lots).where(eq(lots.key, s.key));
    await db.insert(lots).values({ key: s.key, kind: "homestead", buildingKey: null, tx: s.tx, ty: s.ty, tw: SITE_TILES, th: SITE_TILES })
      .onConflictDoUpdate({ target: lots.key, set: { kind: "homestead", tx: s.tx, ty: s.ty, tw: SITE_TILES, th: SITE_TILES } });
    // A site that moved (sites were regenerated): its animals go to its pastures where they are now.
    if (was?.ownerId != null && (was.tx !== s.tx || was.ty !== s.ty)) {
      await db.update(animals).set({ zone: { x: 0, y: 0, w: 0, h: 0 } }).where(eq(animals.ranchKey, s.key));
      await repen({ id: was.id, key: s.key, tx: s.tx, ty: s.ty }, await parcelsOf(was.id));
    }
    n++;
  }
  return n;
}

/** Open the next block of sites when OPEN_AT of the open ones are claimed. Returns the block opened. */
export async function maybeOpenBlock(force = false): Promise<number | null> {
  const open = await openBlocks();
  const openSites = SITES.filter((s) => open.has(s.block)).map((s) => s.key);
  if (!openSites.length) return null;
  const claimed = await db.select({ key: lots.key }).from(lots).where(and(inArray(lots.key, openSites), isNotNull(lots.ownerId)));
  if (!force && claimed.length / openSites.length < OPEN_AT) return null;
  const next = [...new Set(SITES.map((s) => s.block))].sort((a, b) => a - b).find((b) => !open.has(b));
  if (next == null) return null;
  const [won] = await db.insert(homesteadBlocks).values({ block: next }).onConflictDoNothing().returning({ block: homesteadBlocks.block });
  if (!won) return null;
  await syncHomesteadLots();
  const count = SITES.filter((s) => s.block === next).length;
  await logEvent("lots", `🏡 ${count} new homestead site${count === 1 ? "" : "s"} opened south of the village.`);
  return next;
}

// ── Actions ───────────────────────────────────────────────────────────

/** How close to the signpost you must be to claim a site. */
export const CLAIM_REACH_PX = 160;

/** Claim the site `siteKey`: free, with the starter parcels. One per player for now (canClaimHomestead). */
export async function claimHomestead(characterId: number, siteKey: string, pos: { x: number; y: number }): Promise<GardenResult> {
  const site = siteByKey(siteKey);
  if (!site) return { ok: false, error: "There's no homestead site here." };
  if (Math.hypot((site.sign.tx * 16 + 8) - pos.x, (site.sign.ty * 16 + 8) - pos.y) > CLAIM_REACH_PX) return { ok: false, error: "Walk up to its signpost first." };
  const r = await db.transaction(async (tx): Promise<GardenResult> => {
    const [lot] = await tx.select().from(lots).where(and(eq(lots.key, siteKey), eq(lots.kind, "homestead"))).for("update");
    if (!lot) return { ok: false, error: "That site isn't open yet." };
    if (lot.ownerId === characterId) return { ok: false, error: "It's already yours." };
    if (lot.ownerId != null) return { ok: false, error: "Someone already lives here." };
    const [me] = await tx.select({ level: characters.level }).from(characters).where(eq(characters.id, characterId)).for("update");
    const owned = await tx.select({ id: lots.id }).from(lots).where(and(eq(lots.ownerId, characterId), eq(lots.kind, "homestead")));
    const counts = await Promise.all(owned.map(async (o) => ({ parcels: (await tx.select({ n: sql<number>`count(*)::int` }).from(homesteadParcels).where(eq(homesteadParcels.lotId, o.id)))[0]?.n ?? 0 })));
    const why = canClaimHomestead(counts, me?.level ?? 1);
    if (why) return { ok: false, error: why };
    const [flown] = await tx.select({ color: lots.bannerColor, emblem: lots.bannerEmblem }).from(lots)
      .where(and(eq(lots.ownerId, characterId), isNotNull(lots.bannerColor), isNotNull(lots.bannerEmblem))).limit(1);
    await tx.update(lots).set({ ownerId: characterId, acquiredAt: new Date(), bannerColor: flown?.color ?? null, bannerEmblem: flown?.emblem ?? null }).where(eq(lots.id, lot.id));
    await tx.delete(homesteadParcels).where(eq(homesteadParcels.lotId, lot.id));
    await tx.insert(homesteadParcels).values(STARTER.map((c, i) => ({ lotId: lot.id, col: c.col, row: c.row, use: STARTER_USES[i] })));
    return { ok: true, message: "🏡 The homestead is yours! Two fields to plant and two pastures for animals. Tap a parcel to change what it's for, and buy the land around it to grow." };
  });
  if (r.ok) void maybeOpenBlock().catch((e) => console.warn("[homestead] opening a block failed:", e instanceof Error ? e.message : e));
  return r.ok ? { ...r, x: site.sign.tx * 16, y: site.sign.ty * 16 } : r;
}

async function ownLot(characterId: number, lotKey: string) {
  const [lot] = await db.select().from(lots).where(and(eq(lots.key, lotKey), eq(lots.kind, "homestead")));
  if (!lot) return { error: "There's no homestead here." } as const;
  if (lot.ownerId !== characterId) return { error: "This isn't your homestead." } as const;
  return { lot } as const;
}

/** Buy the parcel `cell` of your homestead: next to one you own, under your cap, PARCEL_PRICE coins. */
export async function buyParcel(characterId: number, lotKey: string, cell: ParcelCell): Promise<GardenResult> {
  const own = await ownLot(characterId, lotKey);
  if ("error" in own) return { ok: false, error: own.error! };
  const lot = own.lot;
  return db.transaction(async (tx): Promise<GardenResult> => {
    const [me] = await tx.select({ level: characters.level, coins: characters.coins }).from(characters).where(eq(characters.id, characterId)).for("update");
    const owned = await tx.select({ col: homesteadParcels.col, row: homesteadParcels.row }).from(homesteadParcels).where(eq(homesteadParcels.lotId, lot.id));
    const why = canBuyParcel(owned, cell, me?.level ?? 1, me?.coins ?? 0);
    if (why) return { ok: false, error: why };
    const paid = await tx.update(characters).set({ coins: sql`${characters.coins} - ${PARCEL_PRICE}` })
      .where(and(eq(characters.id, characterId), gte(characters.coins, PARCEL_PRICE))).returning({ id: characters.id });
    if (!paid.length) return { ok: false, error: `A parcel costs ${PARCEL_PRICE} coins.` };
    const added = await tx.insert(homesteadParcels).values({ lotId: lot.id, col: cell.col, row: cell.row, use: "wild" }).onConflictDoNothing().returning({ col: homesteadParcels.col });
    if (!added.length) throw new Error("parcel taken"); // rolls the payment back
    const r = parcelRect(lot, cell);
    return { ok: true, message: `The parcel is yours, for ${PARCEL_PRICE} coins. Tap it to choose what it's for.`, x: r.x + r.w / 2, y: r.y + r.h / 2 };
  });
}

/** Crops growing on one parcel. */
async function cropsOnParcel(lotId: number, cell: ParcelCell): Promise<number[]> {
  const lo = plotIndex(cell, 0), hi = plotIndex(cell, 63);
  const rows = await db.select({ id: resourceNodes.id }).from(resourceNodes)
    .where(and(eq(resourceNodes.lotId, lotId), sql`${resourceNodes.plot} between ${lo} and ${hi}`));
  return rows.map((r) => r.id);
}

/** What setting `cell` to `use` would clear (for the confirm). */
export async function previewUseChange(characterId: number, lotKey: string, cell: ParcelCell, use: ParcelUse): Promise<UseChangeCost | { error: string }> {
  const own = await ownLot(characterId, lotKey);
  if ("error" in own) return { error: own.error! };
  const herd = await db.select({ species: animals.species }).from(animals).where(eq(animals.ranchKey, lotKey));
  return changeCost(await parcelsOf(own.lot.id), cell, use, herd.map((a) => a.species), (await cropsOnParcel(own.lot.id, cell)).length);
}

/** Set a parcel's use. Free; whatever grew on it is cleared, and animals are re-penned. */
export async function setParcelUse(characterId: number, lotKey: string, cell: ParcelCell, use: string): Promise<GardenResult> {
  if (!isParcelUse(use)) return { ok: false, error: "Pick what the parcel will be." };
  const own = await ownLot(characterId, lotKey);
  if ("error" in own) return { ok: false, error: own.error! };
  const lot = own.lot;
  const parcels = await parcelsOf(lot.id);
  const herd = await db.select().from(animals).where(eq(animals.ranchKey, lotKey));
  const why = canSetUse(parcels, cell, use, herd.map((a) => a.species));
  if (why) return { ok: false, error: why };
  const cleared = await cropsOnParcel(lot.id, cell);
  if (cleared.length) await db.delete(resourceNodes).where(inArray(resourceNodes.id, cleared));
  await db.update(homesteadParcels).set({ use }).where(and(eq(homesteadParcels.lotId, lot.id), eq(homesteadParcels.col, cell.col), eq(homesteadParcels.row, cell.row)));
  const after = parcels.map((p) => (p.col === cell.col && p.row === cell.row ? { ...p, use } : p));
  await repen(lot, after);
  await refreshHomesteadBlocks(true); // a barn or workshop may have gone up or come down
  const def = PARCEL_USES[use];
  const r = parcelRect(lot, cell);
  // A barn or workshop isn't lost with its parcel: it's packed away until another parcel is made one.
  const was = parcels.find((p) => p.col === cell.col && p.row === cell.row)?.use;
  const [state] = await db.select({ machines: ranchState.machines }).from(ranchState).where(eq(ranchState.lotKey, lotKey));
  const built = state?.machines ?? [];
  const packed = (was === "barn" || was === "workshop") && built.includes(BUILDING_KEY[was]) ? ` Your ${was} and everything in it is packed away: make another parcel the ${was} and it's back up, free.` : "";
  const back = (use === "barn" || use === "workshop") && built.includes(BUILDING_KEY[use]) ? ` Your ${use} is back up.` : (use === "barn" || use === "workshop") ? ` Build it from 🏚️ Barn & animals → Build.` : "";
  return { ok: true, message: `${def.icon} It's a ${def.name.toLowerCase()} now.${cleared.length ? ` ${cleared.length} crop${cleared.length === 1 ? " was" : "s were"} cleared.` : ""}${packed}${back}`, x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/**
 * The pasture parcel a new animal of the homestead goes to: in the pen with
 * the most free space, the parcel with the fewest animals. Null when none.
 */
export function pastureFor(lot: { tx: number; ty: number }, parcels: readonly Parcel[], herd: readonly { species: string; zone: { x: number; y: number } }[]): { x: number; y: number; w: number; h: number } | null {
  const groups = pens(parcels);
  if (!groups.length) return null;
  const inParcel = (p: ParcelCell) => {
    const r = parcelRect(lot, p);
    return herd.filter((a) => a.zone.x === r.x && a.zone.y === r.y);
  };
  const free = (g: Parcel[]) => g.length * PARCEL_USES.pasture.space - spaceUsed(g.flatMap((p) => inParcel(p).map((a) => a.species)));
  const pen = [...groups].sort((a, b) => free(b) - free(a))[0];
  const parcel = [...pen].sort((a, b) => inParcel(a).length - inParcel(b).length)[0];
  return parcelRect(lot, parcel);
}

/** Put every animal of the homestead on a pasture parcel (after pastures change). */
async function repen(lot: LotLike, parcels: readonly Parcel[]): Promise<void> {
  const herd = await db.select({ id: animals.id, species: animals.species, zone: animals.zone }).from(animals).where(eq(animals.ranchKey, lot.key)).orderBy(animals.id);
  const pastures = parcels.filter((p) => p.use === "pasture").map((p) => parcelRect(lot, p));
  const placed: { species: string; zone: { x: number; y: number } }[] = [];
  for (const a of herd) {
    if (pastures.some((r) => r.x === a.zone.x && r.y === a.zone.y)) { placed.push(a); continue; }
    const zone = pastureFor(lot, parcels, placed);
    if (!zone) continue; // canSetUse keeps this from happening
    await db.update(animals).set({ zone, x: zone.x + zone.w / 2, y: zone.y + zone.h / 2, movePath: null, moveStartAt: null, moveSpeed: null }).where(eq(animals.id, a.id));
    placed.push({ species: a.species, zone });
  }
}

/** Can one more `species` move onto this homestead? */
export async function canAddTo(lot: LotLike, species: RanchSpecies): Promise<string | null> {
  const herd = await db.select({ species: animals.species }).from(animals).where(eq(animals.ranchKey, lot.key));
  return canAddAnimal(await parcelsOf(lot.id), herd.map((a) => a.species), species);
}

/** Clear a homestead's parcels (when it's given up; crops, animals and machines go with the lot). */
export async function clearParcels(lotId: number): Promise<void> {
  await db.delete(homesteadParcels).where(eq(homesteadParcels.lotId, lotId));
}

/** The homestead window. */
export async function homesteadView(characterId: number, lotKey: string): Promise<HomesteadView | null> {
  const [row] = await db.select({ lot: lots, ownerName: characters.name }).from(lots).leftJoin(characters, eq(characters.id, lots.ownerId)).where(and(eq(lots.key, lotKey), eq(lots.kind, "homestead")));
  if (!row) return null;
  const [me] = await db.select({ level: characters.level, coins: characters.coins }).from(characters).where(eq(characters.id, characterId));
  const parcels = await parcelsOf(row.lot.id);
  const herd = await db.select({ species: animals.species }).from(animals).where(eq(animals.ranchKey, lotKey));
  const level = me?.level ?? 1;
  return {
    key: lotKey,
    mine: row.lot.ownerId === characterId,
    owner: row.lot.ownerId != null ? { id: row.lot.ownerId, name: row.ownerName ?? "someone" } : null,
    parcels,
    cap: capFor(level),
    maxCap: GRID * GRID,
    buyable: buyableCells(parcels),
    price: PARCEL_PRICE,
    coins: me?.coins ?? 0,
    space: { used: spaceUsed(herd.map((a) => a.species)), total: spaceTotal(parcels) },
    nextCapAt: nextCapAt(level),
  };
}
