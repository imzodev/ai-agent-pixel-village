// The world side of treasure maps (src/lib/treasure.ts): handing maps out,
// drawing their sketches, digging up chests. A map's spot lives only here
// and in treasure_maps — the bag item holds just its id, and the sketch is
// a picture with no coordinates — so a map can't be read off the network.

import sharp from "sharp";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, inventory, treasureMaps } from "@/db/schema";
import { CONTINENT, inHeartland, provinceAt, tierAt } from "./continent";
import { townAt } from "./settlements";
import { openGround } from "./forage";
import { isWalkableServer } from "./chunkCollisionServer";
import { mapPatchRaw } from "./worldAtlasServer";
import { addItem, recalcLevel } from "./game";
import { recordCollection } from "./collectionStore";
import {
  DIG_REACH_PX, DIG_WARM_PX, LEGENDARY_LOOT, MAX_MAPS, RUMOUR_DAILY, RUMOUR_PRICE, SKETCH_H, SKETCH_JITTER, SKETCH_SCALE, SKETCH_W, TRAIL_PARTS, lootFor,
} from "./treasure";
import type { TreasureLoot, TreasureMapOpts, TreasureMapView } from "@/types/treasure";
import type { Point } from "@/types/world";

const rnd = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** "Somewhere in the Ember Sands" for a tile. */
function whereOf(tx: number, ty: number): string {
  const p = provinceAt(tx, ty);
  return p ? `Somewhere in ${p.name}` : "Somewhere in the wilds";
}

/** A buriable tile of the given danger tier (nearest tier if none turns up). */
async function pickSpot(tier: number): Promise<{ tx: number; ty: number } | null> {
  for (let k = 0; k < 1500; k++) {
    const tx = rnd(CONTINENT.tx0 + 10, CONTINENT.tx1 - 10), ty = rnd(CONTINENT.ty0 + 10, CONTINENT.ty1 - 10);
    if (inHeartland(tx, ty) || townAt(tx, ty) || !provinceAt(tx, ty)) continue;
    // Be strict at first, then settle for any tier within one.
    if (Math.abs(tierAt(tx, ty) - tier) > (k < 1000 ? 0 : 1)) continue;
    if (!openGround(tx, ty) || !openGround(tx + 1, ty) || !openGround(tx - 1, ty) || !openGround(tx, ty + 1) || !openGround(tx, ty - 1)) continue;
    if (!(await isWalkableServer(tx * 16 + 8, ty * 16 + 8))) continue;
    return { tx, ty };
  }
  return null;
}

/**
 * Undug maps whose X is no longer open, walkable ground (the continent was
 * regenerated under it) get a new spot of the same tier; the sketch is drawn
 * from the terrain, so it follows. Runs once per server start.
 */
export async function resiteTreasureMaps(): Promise<number> {
  const undug = await db.select().from(treasureMaps).where(isNull(treasureMaps.dugAt));
  let moved = 0;
  for (const m of undug) {
    const ok = !inHeartland(m.tx, m.ty) && openGround(m.tx, m.ty) && (await isWalkableServer(m.tx * 16 + 8, m.ty * 16 + 8));
    if (ok) continue;
    const spot = await pickSpot(m.tier);
    if (!spot) continue;
    await db.update(treasureMaps).set({ tx: spot.tx, ty: spot.ty }).where(eq(treasureMaps.id, m.id));
    moved++;
  }
  return moved;
}

/**
 * Give a character a new treasure map. Returns how to announce it, or null
 * when their bag already holds MAX_MAPS undug maps (or no spot was found).
 */
export async function grantTreasureMap(characterId: number, opts: TreasureMapOpts & { part?: number } = {}): Promise<string | null> {
  const part = opts.part ?? (opts.chain ? 1 : null);
  // A trail's next map always fits: it replaces the one just dug.
  if (!part || part === 1) {
    const [held] = await db.select({ n: sql<number>`count(*)::int` }).from(treasureMaps).where(and(eq(treasureMaps.characterId, characterId), isNull(treasureMaps.dugAt)));
    if ((held?.n ?? 0) >= MAX_MAPS) return null;
  }
  const tier = Math.max(1, Math.min(4, opts.tier ?? (part ? part + 1 : rnd(1, 3))));
  const spot = await pickSpot(tier);
  if (!spot) return null;
  const [m] = await db.insert(treasureMaps).values({
    characterId, tx: spot.tx, ty: spot.ty, tier, part, boughtBy: opts.boughtBy ?? null,
    ox: rnd(-SKETCH_JITTER.x, SKETCH_JITTER.x), oy: rnd(-SKETCH_JITTER.y, SKETCH_JITTER.y),
  }).returning({ id: treasureMaps.id });
  await addItem(characterId, "treasure_map", 1, { mapId: m.id });
  return part ? `🗺️ A treasure map — part ${part} of ${TRAIL_PARTS} of a trail! (${whereOf(spot.tx, spot.ty)})` : `🗺️ You got a treasure map! (${whereOf(spot.tx, spot.ty)})`;
}

/** Roll for a map as a reward; returns the notice if one was given. */
export async function maybeTreasureMap(characterId: number, chance: number, tier?: number): Promise<string | null> {
  if (Math.random() >= chance) return null;
  return grantTreasureMap(characterId, { tier });
}

/** A character's undug maps, as they read them. */
export async function myTreasureMaps(characterId: number): Promise<TreasureMapView[]> {
  const rows = await db.select().from(treasureMaps).where(and(eq(treasureMaps.characterId, characterId), isNull(treasureMaps.dugAt))).orderBy(treasureMaps.id);
  return rows.map((m) => ({ mapId: m.id, where: whereOf(m.tx, m.ty), tier: m.tier, part: m.part }));
}

/** Buy an old rumour from an innkeeper. */
export async function buyRumour(characterId: number): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const [today] = await db.select({ n: sql<number>`count(*)::int` }).from(treasureMaps)
    .where(and(eq(treasureMaps.boughtBy, characterId), gt(treasureMaps.createdAt, new Date(Date.now() - 24 * 3_600_000))));
  if ((today?.n ?? 0) >= RUMOUR_DAILY) return { ok: false, error: `"That's all the rumours I've got for you today, friend. Come back tomorrow."` };
  const [paid] = await db.update(characters).set({ coins: sql`${characters.coins} - ${RUMOUR_PRICE}` })
    .where(and(eq(characters.id, characterId), sql`${characters.coins} >= ${RUMOUR_PRICE}`)).returning({ id: characters.id });
  if (!paid) return { ok: false, error: `An old rumour costs ${RUMOUR_PRICE} coins.` };
  const got = await grantTreasureMap(characterId, { tier: rnd(1, 2), boughtBy: characterId });
  if (!got) {
    await db.update(characters).set({ coins: sql`${characters.coins} + ${RUMOUR_PRICE}` }).where(eq(characters.id, characterId));
    return { ok: false, error: `Your bag's already stuffed with maps — dig some up first (at most ${MAX_MAPS}).` };
  }
  return { ok: true, message: `"Heard tell of something buried out there…" ${got}` };
}

// ── The sketch ───────────────────────────────────────────────────────────
const PARCHMENT = [233, 214, 170];
const INK = [92, 58, 30];
const lum = (px: Buffer, o: number) => (px[o + 3] ? (0.3 * px[o] + 0.59 * px[o + 1] + 0.11 * px[o + 2]) / 255 : 1);
const waterish = (px: Buffer, o: number) => px[o + 3] > 0 && px[o + 2] > px[o] + 25 && px[o + 2] > px[o + 1] - 5;

/** The map's picture: the land around the X in ink on parchment (PNG). */
export async function treasureSketch(characterId: number, mapId: number): Promise<Buffer | null> {
  const [m] = await db.select().from(treasureMaps).where(and(eq(treasureMaps.id, mapId), eq(treasureMaps.characterId, characterId)));
  if (!m) return null;
  const tx0 = m.tx - m.ox - Math.floor(SKETCH_W / 2), ty0 = m.ty - m.oy - Math.floor(SKETCH_H / 2);
  const src = await mapPatchRaw(tx0, ty0, SKETCH_W, SKETCH_H);
  const W = SKETCH_W * SKETCH_SCALE, H = SKETCH_H * SKETCH_SCALE;
  const out = Buffer.alloc(W * H * 4);
  // Stretch the patch's own light range, so a meadow's woods read as clearly as a coast.
  const ls = Array.from({ length: SKETCH_W * SKETCH_H }, (_, i) => lum(src, i * 4)).sort((a, b) => a - b);
  const lo = ls[Math.floor(ls.length * 0.05)], hi = Math.max(lo + 0.05, ls[Math.floor(ls.length * 0.95)]);
  const lumN = (o: number) => Math.max(0, Math.min(1, (lum(src, o) - lo) / (hi - lo)));
  for (let y = 0; y < SKETCH_H; y++) for (let x = 0; x < SKETCH_W; x++) {
    const o = (y * SKETCH_W + x) * 4;
    const l = lumN(o), wet = waterish(src, o);
    // Ink where the land changes (coasts, roads, woods' edges), wash elsewhere.
    let edge = 0;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SKETCH_W || ny >= SKETCH_H) continue;
      const n = (ny * SKETCH_W + nx) * 4;
      edge = Math.max(edge, Math.abs(lumN(n) - l), waterish(src, n) !== wet ? 1 : 0);
    }
    const shade = Math.min(1, (1 - l) * 0.5 + edge * 0.6 + (wet ? 0.1 : 0));
    for (let sy = 0; sy < SKETCH_SCALE; sy++) for (let sx = 0; sx < SKETCH_SCALE; sx++) {
      const p = ((y * SKETCH_SCALE + sy) * W + x * SKETCH_SCALE + sx) * 4;
      // Grain: hatch the water, fleck the paper.
      const grain = (Math.sin((x * SKETCH_SCALE + sx) * 12.9898 + (y * SKETCH_SCALE + sy) * 78.233) * 43758.5453) % 1;
      const hatch = wet && (x * SKETCH_SCALE + sx + y * SKETCH_SCALE + sy) % 5 === 0 ? 0.18 : 0;
      const k = Math.min(1, shade + hatch + Math.abs(grain) * 0.06);
      for (let c = 0; c < 3; c++) out[p + c] = Math.round(PARCHMENT[c] * (1 - k) + INK[c] * k);
      out[p + 3] = 255;
    }
  }
  const cx = (Math.floor(SKETCH_W / 2) + m.ox) * SKETCH_SCALE + SKETCH_SCALE / 2, cy = (Math.floor(SKETCH_H / 2) + m.oy) * SKETCH_SCALE + SKETCH_SCALE / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><radialGradient id="v" cx="50%" cy="50%" r="70%"><stop offset="60%" stop-color="#5a3a1a" stop-opacity="0"/><stop offset="100%" stop-color="#5a3a1a" stop-opacity="0.55"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#v)"/>
    <g stroke="#b3201b" stroke-width="5" stroke-linecap="round"><line x1="${cx - 10}" y1="${cy - 10}" x2="${cx + 10}" y2="${cy + 10}"/><line x1="${cx + 10}" y1="${cy - 10}" x2="${cx - 10}" y2="${cy + 10}"/></g>
    <g transform="translate(${W - 30},30)" stroke="#5c3a1e" stroke-width="2" fill="none"><circle r="14"/><path d="M0 -20 L5 0 L0 20 L-5 0 Z" fill="#5c3a1e"/><path d="M-20 0 L20 0"/></g>
    <text x="${W - 30}" y="${30 - 24}" font-family="serif" font-size="12" font-weight="bold" fill="#5c3a1e" text-anchor="middle">N</text>
    <rect x="3" y="3" width="${W - 6}" height="${H - 6}" fill="none" stroke="#5c3a1e" stroke-width="3" stroke-dasharray="14 3 6 3"/>
  </svg>`;
  return sharp(out, { raw: { width: W, height: H, channels: 4 } }).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}

// ── Digging ──────────────────────────────────────────────────────────────
async function payLoot(characterId: number, loot: TreasureLoot): Promise<void> {
  await db.update(characters).set({ coins: sql`${characters.coins} + ${loot.coins}`, xp: sql`${characters.xp} + ${loot.xp}`, gems: sql`${characters.gems} + ${loot.gems}` }).where(eq(characters.id, characterId));
  for (const it of loot.items) await addItem(characterId, it.itemKey, it.qty);
  await recalcLevel(characterId);
}

const lootLine = (l: TreasureLoot) => [`+${l.coins} 🪙`, `+${l.xp} XP`, l.gems ? `+${l.gems} 💎` : "", ...l.items.map((i) => i.itemKey.replace(/_/g, " "))].filter(Boolean).join(", ");

/** Dig where you stand for the treasure on one of your maps. */
export async function digTreasure(characterId: number, mapId: number, pos: Point): Promise<{ ok: true; message: string; notices: string[]; gained: TreasureLoot["items"] } | { ok: false; error: string }> {
  const [m] = await db.select().from(treasureMaps).where(and(eq(treasureMaps.id, mapId), eq(treasureMaps.characterId, characterId)));
  if (!m || m.dugAt) return { ok: false, error: "That map's spent." };
  const [carried] = await db.select({ id: inventory.id }).from(inventory)
    .where(and(eq(inventory.characterId, characterId), eq(inventory.itemKey, "treasure_map"), sql`(${inventory.meta} ->> 'mapId')::int = ${m.id}`));
  if (!carried) return { ok: false, error: "You need the map in your bag." };
  const d = Math.hypot(m.tx * 16 + 8 - pos.x, m.ty * 16 + 8 - pos.y);
  if (d > DIG_REACH_PX) {
    return { ok: false, error: d < DIG_WARM_PX ? "Nothing here… but the ground nearby looks disturbed. You're close!" : "You dig a hole. Nothing. This isn't the spot on the map." };
  }
  const [won] = await db.update(treasureMaps).set({ dugAt: new Date() }).where(and(eq(treasureMaps.id, m.id), isNull(treasureMaps.dugAt))).returning({ id: treasureMaps.id });
  if (!won) return { ok: false, error: "That map's spent." };
  await db.delete(inventory).where(and(eq(inventory.characterId, characterId), eq(inventory.itemKey, "treasure_map"), sql`(${inventory.meta} ->> 'mapId')::int = ${m.id}`));
  const legendary = m.part === TRAIL_PARTS;
  const loot = legendary ? LEGENDARY_LOOT : lootFor(m.tier, Math.random, m.boughtBy != null);
  await payLoot(characterId, loot);
  const notices: string[] = [];
  if (await recordCollection(characterId, "treasure", "chest")) notices.push("📖 Your first buried treasure!");
  if (legendary) await recordCollection(characterId, "treasure", "cache");
  if (m.part && !legendary) {
    const next = await grantTreasureMap(characterId, { part: m.part + 1 });
    if (next) notices.push(next);
  }
  const message = legendary
    ? `👑 The legendary cache! ${lootLine(loot)}`
    : `💰 You dug up a buried chest! ${lootLine(loot)}`;
  return { ok: true, message, notices, gained: loot.items };
}
