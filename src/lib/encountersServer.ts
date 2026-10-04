// The world side of random encounters (src/lib/encounters.ts): tickd
// spawns them around travelling players and tidies them away; fights
// resolve when the last attacker falls, hand-overs when someone gives the
// stranger what they need. Rewards go to everyone who helped.

import { and, eq, gt, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, encounters, enemies, groundItems, npcs } from "@/db/schema";
import { biomeAt, inHeartland, tierAt } from "./continent";
import { TOWNS, townAt } from "./settlements";
import { enemyHpAt } from "./progression";
import { wildKindFor } from "./wildlife";
import { isWalkableServer } from "./chunkCollisionServer";
import { tileCenter, tileOf } from "./motion";
import { recalcLevel, removeItem } from "./game";
import { addReputation } from "./reputationServer";
import { maybeTreasureMap } from "./treasureServer";
import { MAP_CHANCE } from "./treasure";
import {
  ENCOUNTERS, ENCOUNTER_GROUP_PX, ENCOUNTER_LINGER_MS, ENCOUNTER_REACH_PX, ENCOUNTER_SPACING_PX, ENCOUNTER_TTL_MS,
  attackersFor, encounterNpcKey, pickEncounter, rollsEncounter, strangerName,
} from "./encounters";
import type { EncounterKind, EncounterView } from "@/types/encounter";
import type { Appearance } from "@/types/domain";
import type { Point } from "@/types/world";
import type { OnlinePlayer } from "@/types/encounter";

const SKIN = ["#f1c9a5", "#e8c39e", "#d9a066", "#c68e5a", "#8d5524"];
const HAIR = ["plain", "bob", "messy1", "long", "bangs", "bedhead", "cowlick"];
const COLOURS = ["#5b7db1", "#a43a32", "#7b5ea7", "#c97b30", "#4a7c59", "#7a4a2a"];
const any = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

/** A walkable tile centre `min`–`max` tiles from `p`, out in the wilds. */
async function spotNear(p: Point, min: number, max: number): Promise<Point | null> {
  for (let k = 0; k < 12; k++) {
    const ang = Math.random() * Math.PI * 2, d = (min + Math.random() * (max - min)) * 16;
    const t = tileOf(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d);
    if (inHeartland(t.tx, t.ty) || townAt(t.tx, t.ty)) continue;
    const c = tileCenter(t);
    if (await isWalkableServer(c.x, c.y)) return c;
  }
  return null;
}

/** An attacker that fits the land (never a harmless slime or bat). */
function attackerKind(at: Point, night: boolean): string {
  const t = tileOf(at.x, at.y);
  const k = wildKindFor(biomeAt(t.tx, t.ty), Math.max(2, tierAt(t.tx, t.ty)), night);
  return !k || k === "slime" || k === "bat" ? "wolf" : k;
}

async function spawnAttackers(encounterId: number, around: Point, n: number, night: boolean, now: Date): Promise<void> {
  for (let i = 0; i < n; i++) {
    const at = await spotNear(around, 2, 4);
    if (!at) continue;
    const kind = attackerKind(at, night);
    const hp = enemyHpAt(kind, tierAt(Math.floor(at.x / 16), Math.floor(at.y / 16)));
    await db.insert(enemies).values({ kind, x: at.x, y: at.y, targetX: at.x, targetY: at.y, hp, maxHp: hp, spawnedAt: now, wild: true, nearAt: now, encounterId });
  }
}

/** Start an encounter near a travelling player; `group` is how many players
 *  are with them (fights grow with it). Returns where it is. */
async function spawn(player: Point, group: number, now: Date, night: boolean): Promise<Point | null> {
  const t = tileOf(player.x, player.y);
  const kind = pickEncounter(tierAt(t.tx, t.ty));
  const def = ENCOUNTERS[kind];
  const spot = kind === "ambush" ? { ...player } : await spotNear(player, 10, 15);
  if (!spot) return null;
  const [enc] = await db.insert(encounters).values({ kind, x: spot.x, y: spot.y, expiresAt: new Date(now.getTime() + ENCOUNTER_TTL_MS) }).returning({ id: encounters.id });
  if (def.stranger) {
    const appearance: Appearance = { body: Math.random() < 0.5 ? "male" : "female", skin: any(SKIN), hair: any(HAIR), hairColor: any(["#2b1d14", "#5a3a1a", "#8c5a2b", "#c94f2a", "#dcdcdc"]), shirtColor: any(COLOURS), pantsColor: any(["#3a3a4a", "#4a3a2a", "#2e2e3a"]) } as Appearance;
    const [npc] = await db.insert(npcs).values({
      key: encounterNpcKey(kind, enc.id), name: strangerName(), role: def.stranger.role, persona: def.stranger.persona, greeting: def.stranger.greeting,
      x: spot.x, y: spot.y, homeX: spot.x, homeY: spot.y, wanderRadius: 0, appearance, mood: "anxious", kind: "encounter", active: true,
    }).returning({ id: npcs.id });
    await db.update(encounters).set({ npcId: npc.id }).where(eq(encounters.id, enc.id));
  }
  if (kind === "beset") await spawnAttackers(enc.id, spot, attackersFor(3, group), night, now);
  if (kind === "ambush") await spawnAttackers(enc.id, spot, attackersFor(3 + Math.floor(Math.random() * 2), group), night, now);
  if (kind === "lost_child") {
    const doll = await spotNear(spot, 6, 11);
    if (doll) await db.insert(groundItems).values({ itemKey: "lost_doll", qty: 1, x: doll.x, y: doll.y });
  }
  return spot;
}

/** The town nearest a point (whose standing an encounter's helpers gain). */
function nearestTown(p: Point): string | null {
  let best: string | null = null, bestD = Infinity;
  for (const t of TOWNS) {
    const d = Math.hypot((t.sq.tx + 12) * 16 - p.x, (t.sq.ty + 7) * 16 - p.y);
    if (d < bestD) { bestD = d; best = t.key; }
  }
  return best;
}

/**
 * Resolve an encounter once (idempotent): pay every helper, thank them, and
 * let the stranger linger a while. Returns the helpers actually paid, and
 * the treasure maps some of them were given.
 */
export async function resolveEncounter(id: number, helpers: number[], now = new Date()): Promise<{ paid: number[]; maps: Map<number, string> }> {
  const ids = [...new Set(helpers)];
  const [enc] = await db.update(encounters).set({ state: "resolved", resolvedAt: now, rewarded: ids, expiresAt: new Date(now.getTime() + ENCOUNTER_LINGER_MS) })
    .where(and(eq(encounters.id, id), eq(encounters.state, "active"))).returning();
  const maps = new Map<number, string>();
  if (!enc || !ids.length) return { paid: [], maps };
  const r = ENCOUNTERS[enc.kind as EncounterKind].reward;
  await db.update(characters).set({ coins: sql`${characters.coins} + ${r.coins}`, xp: sql`${characters.xp} + ${r.xp}` }).where(inArray(characters.id, ids));
  const town = nearestTown(enc);
  for (const c of ids) {
    await recalcLevel(c);
    if (town) await addReputation(c, town, r.rep);
    const t = tileOf(enc.x, enc.y);
    const map = await maybeTreasureMap(c, MAP_CHANCE.encounter, tierAt(t.tx, t.ty));
    if (map) maps.set(c, map);
  }
  if (enc.npcId) await db.update(npcs).set({ role: enc.kind === "merchant" ? "Travelling merchant" : "Grateful traveller", mood: "relieved" }).where(eq(npcs.id, enc.npcId));
  return { paid: ids, maps };
}

export async function encounterKindOf(id: number): Promise<EncounterKind | null> {
  const [e] = await db.select({ kind: encounters.kind }).from(encounters).where(eq(encounters.id, id));
  return (e?.kind as EncounterKind | undefined) ?? null;
}

/** Note a player who struck one of an encounter's attackers. */
export async function noteFighter(encounterId: number, characterId: number): Promise<void> {
  await db.update(encounters).set({ fighters: sql`${encounters.fighters} || ${JSON.stringify([characterId])}::jsonb` })
    .where(and(eq(encounters.id, encounterId), sql`NOT ${encounters.fighters} @> ${JSON.stringify([characterId])}::jsonb`));
}

/** A fight ends when its last attacker falls; everyone who fought is paid.
 *  Returns null while it goes on, else the killer's extra notices. */
export async function attackerFell(encounterId: number, killer: number): Promise<string[] | null> {
  const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(enemies).where(eq(enemies.encounterId, encounterId));
  if ((left?.n ?? 0) > 0) return null;
  const [enc] = await db.select({ fighters: encounters.fighters }).from(encounters).where(eq(encounters.id, encounterId));
  const r = await resolveEncounter(encounterId, [killer, ...(enc?.fighters ?? [])]);
  if (!r.paid.length) return null;
  const map = r.maps.get(killer);
  return map ? [map] : [];
}

/** Hand the stranger what they need. */
export async function helpEncounter(characterId: number, id: number, pos: Point): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const [enc] = await db.select().from(encounters).where(eq(encounters.id, id));
  if (!enc || enc.state !== "active") return { ok: false, error: "They don't need help anymore." };
  const def = ENCOUNTERS[enc.kind as EncounterKind];
  if (!def.need) return { ok: false, error: "This one's a fight — drive the beasts off!" };
  if (Math.hypot(enc.x - pos.x, enc.y - pos.y) > ENCOUNTER_REACH_PX) return { ok: false, error: "Get a little closer." };
  let given = false;
  for (const key of def.need.itemKeys) if (await removeItem(characterId, key, def.need.qty)) { given = true; break; }
  if (!given) return { ok: false, error: `They need ${def.need.label}.` };
  const { maps } = await resolveEncounter(id, [characterId]);
  const r = def.reward;
  const map = maps.get(characterId);
  return { ok: true, message: `🤝 "${def.thanks}" +${r.coins} 🪙, +${r.xp} XP${map ? ` ${map}` : ""}` };
}

/** Encounters within ~40 tiles of a player (active, or recently resolved). */
export async function encountersNear(characterId: number, pos: Point): Promise<EncounterView[]> {
  const r = 40 * 16;
  const rows = await db.select().from(encounters).where(and(
    sql`${encounters.x} BETWEEN ${pos.x - r} AND ${pos.x + r}`, sql`${encounters.y} BETWEEN ${pos.y - r} AND ${pos.y + r}`,
  ));
  return rows.map((e) => {
    const def = ENCOUNTERS[e.kind as EncounterKind];
    return { id: e.id, kind: e.kind as EncounterKind, title: def.title, state: e.state as "active" | "resolved", x: e.x, y: e.y, npcId: e.npcId, need: def.need?.label ?? null, rewardedMe: e.rewarded.includes(characterId) };
  });
}

/** Beats each player has spent in the wilds since they last met something
 *  (tickd's memory; a restart just starts everyone afresh). */
const beatsSince = new Map<number, number>();

/**
 * tickd: start encounters around travelling players, and clear away the
 * expired (unhelped, or helped strangers who've moved on).
 */
export async function tickEncounters(online: OnlinePlayer[], now: Date, night: boolean): Promise<void> {
  const done = await db.select().from(encounters).where(lt(encounters.expiresAt, now));
  if (done.length) {
    const ids = done.map((e) => e.id);
    await db.delete(enemies).where(inArray(enemies.encounterId, ids));
    const npcIds = done.map((e) => e.npcId).filter((x): x is number => x != null);
    if (npcIds.length) await db.delete(npcs).where(inArray(npcs.id, npcIds));
    for (const e of done) if (e.kind === "lost_child") await db.delete(groundItems).where(and(eq(groundItems.itemKey, "lost_doll"), sql`${groundItems.x} BETWEEN ${e.x - 200} AND ${e.x + 200}`, sql`${groundItems.y} BETWEEN ${e.y - 200} AND ${e.y + 200}`));
    await db.delete(encounters).where(inArray(encounters.id, ids));
  }
  // Fights whose attackers wandered off (despawned) without being beaten fail quietly.
  const live: Point[] = await db.select({ x: encounters.x, y: encounters.y }).from(encounters).where(or(gt(encounters.expiresAt, now), isNotNull(encounters.resolvedAt)));
  const here = new Set(online.map((p) => p.id));
  for (const id of beatsSince.keys()) if (!here.has(id)) beatsSince.delete(id);
  for (const p of online) {
    const t = tileOf(p.x, p.y);
    if (inHeartland(t.tx, t.ty) || townAt(t.tx, t.ty)) continue;
    // Already near something happening: no clock, no new one.
    if (live.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < ENCOUNTER_SPACING_PX)) continue;
    const beats = (beatsSince.get(p.id) ?? 0) + 1;
    beatsSince.set(p.id, beats);
    if (!rollsEncounter(beats)) continue;
    const group = online.filter((o) => Math.hypot(o.x - p.x, o.y - p.y) <= ENCOUNTER_GROUP_PX);
    const spot = await spawn(p, group.length, now, night);
    if (!spot) continue;
    // Counted at once, so a group that rolls together gets one, not several.
    live.push(spot);
    for (const o of group) beatsSince.set(o.id, 0);
  }
}
