import { and, eq, gt, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { animals, bossLairs, characters, enemies, npcs, resourceNodes, worldState, worldEvents, groundItems, wildChunks } from "@/db/schema";
import { getCropKind } from "@/lib/crops";
import { CHUNK_TILE_PX } from "@/lib/chunkCollision";
import { gameHour, type Rect } from "./worldmap";
import { LAIR_BOSSES, lairReady, lairSpot } from "./lairs";
import { BOSS_KIND, BOSS_SPOT, ENEMY_KINDS, ENEMY_ZONES, GREEN_THUMB_MULT, bossWindowStart, enemyHpAt, enemyKind, inDarkZone, isBossKind, pickEnemyKind } from "./progression";
import { perksOfMany } from "./combat";
import { isWalkableServer } from "./chunkCollisionServer";
import {
  ANIMAL_MOVE_INTERVAL_MS,
  ANIMAL_RAID_SPEED,
  ANIMAL_SPEED,
  BROADCAST_OFFSET_MS,
  ENEMY_MOVE_INTERVAL_MS,
  ENEMY_SPEED,
  MOVE_MAX_TILES,
  MOVE_MIN_TILES,
  NPC_LEASH_TILES,
  NPC_MOVE_INTERVAL_MS,
  NPC_MOVE_MAX_TILES,
  NPC_MOVE_MIN_TILES,
  NPC_SPEED,
  PLANNER_MAX_TILES_EGG_PICK,
  WORLD_TICK_MS,
} from "./constants";
import { beatIndex, beatStartAt, isDue, moveEndAt, moveOfRow, nextBeatAt, rowPositionAt, tileCenter, tileOf } from "./motion";
import { buildMoveWrite, writeMoves } from "./moveStore";
import { leashAround, leashOfRect, pickWanderMove, planGoalMove } from "./wander";
import { logEvent } from "./game";
import { runRandomEvents } from "./events";
import type { Point } from "@/types/world";
import { syncFelledTrees } from "./treesServer";
import { biomeAt, inHeartland, tierAt } from "./continent";
import { REPOPULATE_MS, WILD_DESPAWN_MS, WILD_LEASH_TILES, WILD_RADIUS_PX } from "./wildlife";
import { addToGrid, buildGrid, countWithin } from "./spatialGrid";
import { bakeBatches } from "./bakeryServer";
import { thinkMinds } from "./mind/mindServer";
import { tickRanches } from "./ranchServer";
import { tickCommissions } from "./commissionsServer";
import { maybeOpenRows } from "./lotRowsServer";
let lastRowCheck = 0;
import { stageMs } from "./vineyard";
import { advanceTrips, lingerSpots, npcsOnTrips } from "./nav/trips";
import { refreshBounties } from "./bountiesServer";
import { tickEncounters } from "./encountersServer";
import type { MoveWrite, MovingRow, TickBeat, TileLeash } from "@/types/motion";

/** Enemies kept alive per wild zone (zones refill so they can be farmed). */
const ZONE_TARGET_ENEMIES = 4;

// The WS server pushes fresh snapshots periodically. We don't publish
// per-entity change events to Upstash — that approach burns too many
// Redis commands per tick (one per entity, dozens of entities) for
// minimal benefit when the chunk cache + periodic refresh already keeps
// clients in sync within a few seconds.
export const WORLD_CHANGE_CHANNEL = "world_changes";

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

async function randomPointIn(zone: Rect, tries = 12) {
  for (let i = 0; i < tries; i++) {
    // Snap to a tile centre: every moving entity rests on the grid.
    const p = tileCenter(tileOf(zone.x + Math.random() * zone.w, zone.y + Math.random() * zone.h));
    if (await isWalkableServer(p.x, p.y)) return p;
  }
  return null;
}

// Find the wild zone an enemy currently roams in (with a small margin so a
// wanderer that just stepped past a border still snaps back to its origin
// zone instead of teleporting across the map).
function zoneForEnemy(x: number, y: number): Rect {
  const inZone = (z: Rect) => x >= z.x - 40 && x <= z.x + z.w + 40 && y >= z.y - 40 && y <= z.y + z.h + 40;
  return ENEMY_ZONES.find((z) => inZone(z.rect))?.rect ?? pick(ENEMY_ZONES).rect;
}

/** True when the row's current move is still running when the next beat starts. */
function busyAt(row: MovingRow, t: number): boolean {
  const move = moveOfRow(row);
  return move !== null && moveEndAt(move) > t;
}

/**
 * Roll a wander step for one entity. The move starts at the next beat
 * from the tile the entity rests on (its row x/y).
 */
async function wanderWrite(
  row: MovingRow & { id: number },
  leash: TileLeash,
  speed: number,
  beat: TickBeat,
  minTiles = MOVE_MIN_TILES,
  maxTiles = MOVE_MAX_TILES,
  after?: string,
): Promise<MoveWrite | null> {
  const from = tileOf(row.x, row.y);
  const step = await pickWanderMove(from, isWalkableServer, { minTiles, maxTiles, leash });
  if (!step) return null;
  return buildMoveWrite(row.id, [from, step.to], beat.startAt, speed, after);
}

/**
 * Advance the world by one beat. Called by the sim worker on every
 * epoch-aligned beat boundary (and opportunistically by /api/world).
 * At most one tick runs per beat: the claim on `lastTickAt` is keyed to
 * the beat start, so a second caller in the same beat is a no-op.
 *
 * Returns the number of moves scheduled (for logging), or null when
 * another caller already ticked this beat.
 */
export async function tickWorld(): Promise<number | null> {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const [before] = await db.select().from(worldState).where(eq(worldState.id, 1));
  if (!before) return null;
  const claimed = await db
    .update(worldState)
    .set({ lastTickAt: now })
    .where(and(eq(worldState.id, 1), lt(worldState.lastTickAt, new Date(beatStartAt(nowMs)))))
    .returning();
  if (claimed.length === 0) return null;
  const ws = claimed[0];
  const elapsedSec = Math.min(3600, Math.max(1, (nowMs - before.lastTickAt.getTime()) / 1000));
  const hour = gameHour(ws.epochStart.getTime(), ws.dayLengthMinutes, nowMs);
  const night = hour < 6 || hour >= 21;
  // tickd wakes right on the boundary. A tick that runs late in its beat
  // (e.g. the opportunistic /api/world caller) would land after the WS
  // broadcast for that beat, so its moves start one beat later instead.
  const late = nowMs - beatStartAt(nowMs) > BROADCAST_OFFSET_MS / 2;
  const beat: TickBeat = { index: beatIndex(nowMs), nowMs, startAt: nextBeatAt(nowMs) + (late ? WORLD_TICK_MS : 0) };

  // Felled trees (any process may have chopped one): walls and wander
  // paths must follow the terrain players opened up.
  await syncFelledTrees(now).catch((err) => console.warn("[tick] tree sync failed:", err instanceof Error ? err.message : err));
  const [animalMoves, npcMoves, , , enemyMoves] = await Promise.all([
    tickAnimals(beat, elapsedSec, night, now),
    tickNpcs(beat),
    tickWeather(ws, now),
    tickResources(now),
    tickEnemies(beat, now, night),
    advanceTrips(beat).catch((err) => { console.warn("[tick] trips failed:", err instanceof Error ? err.message : err); return 0; }),
  ]);
  if (beat.index % HP_REGEN_EVERY_BEATS === 0) await regenHp(now);
  await bakeBatches(nowMs).catch((err) => console.warn("[tick] baking failed:", err instanceof Error ? err.message : err));
  await thinkMinds(nowMs).catch((err) => console.warn("[tick] minds failed:", err instanceof Error ? err.message : err));
  await tickRanches(nowMs).catch((err) => console.warn("[tick] ranch feeders failed:", err instanceof Error ? err.message : err));
  await tickCommissions(nowMs).catch((err) => console.warn("[tick] commissions failed:", err instanceof Error ? err.message : err));
  if (nowMs - lastRowCheck > 3600_000) {
    // Homestead rows: a safety net for the check each claim makes.
    lastRowCheck = nowMs;
    await maybeOpenRows().catch((err) => console.warn("[tick] lot rows failed:", err instanceof Error ? err.message : err));
  }
  await runRandomEvents({ db, hour, weather: ws.weather, now, moveStartAt: beat.startAt });
  if (elapsedSec > 90) await unattendedEvents(elapsedSec);
  return animalMoves + npcMoves + enemyMoves;
}

async function tickNpcs(beat: TickBeat): Promise<number> {
  const rows = await db
    .select({
      id: npcs.id, kind: npcs.kind, x: npcs.x, y: npcs.y,
      homeX: npcs.homeX, homeY: npcs.homeY, wanderRadius: npcs.wanderRadius, holdUntil: npcs.holdUntil,
      movePath: npcs.movePath, moveStartAt: npcs.moveStartAt, moveSpeed: npcs.moveSpeed,
    })
    .from(npcs)
    .where(eq(npcs.active, true));
  const writes: MoveWrite[] = [];
  const travelling = await npcsOnTrips();
  const lingering = await lingerSpots();
  for (const n of rows) {
    if (n.kind === "remote") continue; // remote agents drive themselves over HTTP
    if (travelling.has(n.id)) continue; // walking a planned route (src/lib/nav/trips.ts)
    if (n.kind === "encounter") continue; // encounter strangers stay where they're needed
    if (!isDue("npc", n.id, beat.index, NPC_MOVE_INTERVAL_MS)) continue;
    if (n.holdUntil != null && n.holdUntil > beat.startAt) continue; // someone is talking to it
    if (busyAt(n, beat.startAt)) continue;
    const radius = Math.max(Math.floor(n.wanderRadius / CHUNK_TILE_PX), NPC_LEASH_TILES);
    // Around home — or around where its last trip ended (src/lib/nav/trips.ts).
    const leash = leashAround(lingering.get(n.id) ?? { x: n.homeX, y: n.homeY }, radius);
    const w = await wanderWrite(n, leash, NPC_SPEED, beat, NPC_MOVE_MIN_TILES, NPC_MOVE_MAX_TILES);
    if (w) writes.push(w);
  }
  await writeMoves("npc", writes);
  return writes.length;
}

/**
 * The weekly world boss: rises at the start of its window (once per
 * window, even if defeated early) and sinks back when the window ends.
 */
async function tickBoss(rows: (typeof enemies.$inferSelect)[], now: Date): Promise<void> {
  const nowMs = now.getTime();
  const windowStart = bossWindowStart(nowMs, process.env.BOSS_SCHEDULE ?? "6@18", process.env.BOSS_FORCE === "1");
  const boss = rows.find((e) => e.kind === BOSS_KIND);
  if (windowStart === null) {
    if (boss) {
      await db.delete(enemies).where(eq(enemies.id, boss.id));
      await logEvent("boss", "The Old Rootking sinks back into the earth. Until next week…", "enemy", boss.id, boss.x, boss.y);
    }
    return;
  }
  if (boss) return;
  const [risen] = await db
    .select({ id: worldEvents.id })
    .from(worldEvents)
    .where(and(eq(worldEvents.kind, "boss"), gt(worldEvents.createdAt, new Date(windowStart))));
  if (risen) return; // already rose this window (and was defeated or left)
  const hp = enemyKind(BOSS_KIND).hp;
  const [row] = await db
    .insert(enemies)
    .values({ kind: BOSS_KIND, x: BOSS_SPOT.x, y: BOSS_SPOT.y, hp, maxHp: hp, spawnedAt: now, damage: {} })
    .returning({ id: enemies.id });
  await logEvent("boss", "🌳 The Old Rootking has awoken in the north woods! Gather your friends and drive it back.", "enemy", row.id, BOSS_SPOT.x, BOSS_SPOT.y);
}

/**
 * Lair bosses (src/lib/lairs.ts): each is in its lair unless someone beat it
 * less than LAIR_RESPAWN_MS ago. Raised here; the attack API records a defeat.
 */
async function tickLairs(rows: (typeof enemies.$inferSelect)[], now: Date): Promise<void> {
  const fallen = new Map((await db.select().from(bossLairs)).map((l) => [l.kind, l.defeatedAt?.getTime() ?? null]));
  for (const b of LAIR_BOSSES) {
    if (rows.some((e) => e.kind === b.kind)) continue;
    const spot = lairSpot(b.kind);
    if (!spot || !lairReady(fallen.get(b.kind) ?? null, now.getTime())) continue;
    const at = { x: spot.tx * 16 + 8, y: spot.ty * 16 + 8 };
    const [row] = await db.insert(enemies).values({ kind: b.kind, x: at.x, y: at.y, targetX: at.x, targetY: at.y, hp: b.hp, maxHp: b.hp, spawnedAt: now, damage: {} }).returning({ id: enemies.id });
    await logEvent("boss", `${b.icon} ${b.name[0].toUpperCase()}${b.name.slice(1)} stirs in ${b.lair}.`, "enemy", row.id, at.x, at.y);
  }
}

async function tickAnimals(beat: TickBeat, elapsedSec: number, night: boolean, now: Date): Promise<number> {
  const rows = await db.select().from(animals);
  const writes: MoveWrite[] = [];
  for (const a of rows) {
    let { state, targetX, targetY, stateUntil } = a;
    let hunger = a.hunger;
    // hunger rises ~1 point / 2 minutes
    if (Math.random() < elapsedSec / 120) hunger = Math.min(100, hunger + Math.ceil(elapsedSec / 120));
    const stateExpired = !stateUntil || stateUntil < now;
    const move = moveOfRow(a);
    // Arrived = the current move (if any) has finished by now. Row x/y
    // is always the move's destination, so on arrival it's exact.
    const arrived = !move || moveEndAt(move) <= beat.nowMs;
    let busy = busyAt(a, beat.startAt);
    const home = homePointForAnimal(a);

    // ─── Fox raid states ───
    // "raid": walking to the egg. On arrival, steal a nearby ground egg
    // (if any survived the trip) and walk home. An expired raid also
    // heads home, but only once the current leg is finished.
    // "return": walking home. On arrival, back to normal idle life.
    if (a.species === "fox" && state === "raid" && arrived) {
      if (!stateExpired) {
        const rowsE = await db
          .select({ id: groundItems.id })
          .from(groundItems)
          .where(and(eq(groundItems.itemKey, "egg"), sql`${groundItems.x} BETWEEN ${a.x - 60} AND ${a.x + 60}`, sql`${groundItems.y} BETWEEN ${a.y - 60} AND ${a.y + 60}`))
          .limit(1);
        const stolen = rowsE[0];
        if (stolen) {
          await db.delete(groundItems).where(eq(groundItems.id, stolen.id));
          await logEvent("event", "The fox made off with an egg!", undefined, a.id, a.x, a.y);
        } else {
          await logEvent("event", "The fox searched the yard but found nothing.", undefined, a.id, a.x, a.y);
        }
      }
      targetX = null; targetY = null;
      const path = await planGoalMove(tileOf(a.x, a.y), home, isWalkableServer, PLANNER_MAX_TILES_EGG_PICK);
      if (path) {
        writes.push(buildMoveWrite(a.id, path, beat.startAt, ANIMAL_RAID_SPEED));
        busy = true;
        state = "return";
        stateUntil = new Date(now.getTime() + 180_000);
      } else {
        state = "idle";
      }
    } else if (a.species === "fox" && state === "return" && arrived) {
      state = "idle";
    }
    const raiding = a.species === "fox" && (state === "raid" || state === "return");

    if (night && a.species !== "fox" && a.species !== "cat" && state !== "sleep" && !raiding && !busy && Math.random() < 0.3) {
      state = "sleep";
    } else if (state === "sleep" && (!night || Math.random() < 0.05)) {
      state = "idle";
    }

    // Wander on this animal's beat. Sleeping / raiding animals and
    // animals still finishing a move sit this one out.
    if (!raiding && state !== "sleep" && !busy && isDue("animal", a.id, beat.index, ANIMAL_MOVE_INTERVAL_MS)) {
      // Decide now what it does once it arrives; the client plays the
      // matching animation (e.g. graze → eat) as soon as the walk ends.
      const after = Math.random() < 0.5 ? "graze" : "idle";
      const w = await wanderWrite(a, leashOfRect(a.zone), ANIMAL_SPEED, beat, MOVE_MIN_TILES, MOVE_MAX_TILES, after);
      if (w) {
        writes.push(w);
        state = "walk";
      } else {
        state = Math.random() < 0.5 ? "graze" : "idle";
      }
    } else if (!raiding && state === "walk" && arrived) {
      state = move?.after ?? (Math.random() < 0.5 ? "graze" : "idle");
    }

    const petFresh = a.lastPettedAt && now.getTime() - a.lastPettedAt.getTime() < 10 * 60_000;
    const mood = raiding ? "sly" : hunger > 70 ? "hungry" : state === "sleep" ? "sleepy" : petFresh ? "delighted" : hunger < 30 ? "content" : "peckish";

    // Chickens sometimes lay an egg at their feet (separate from pet bonuses).
    // Skip if there's already an egg nearby so they don't pile up.
    // Ranch hens lay into their coop instead (src/lib/ranch.ts).
    if (a.species === "chicken" && a.ownerId == null && state !== "sleep" && !raiding && Math.random() < 0.04) {
      const { x, y } = rowPositionAt(a, beat.nowMs);
      const [nearby] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(groundItems)
        .where(and(eq(groundItems.itemKey, "egg"), sql`${groundItems.x} BETWEEN ${x - 24} AND ${x + 24}`, sql`${groundItems.y} BETWEEN ${y - 24} AND ${y + 24}`));
      if (!nearby || nearby.n === 0) {
        await db.insert(groundItems).values({ itemKey: "egg", qty: 1, x, y: y + 4 });
      }
    }

    // Only write the row when a non-movement field changed. Movement
    // columns go out in one batched statement below.
    const changed =
      state !== a.state || hunger !== a.hunger || mood !== a.mood ||
      targetX !== a.targetX || targetY !== a.targetY || stateUntil !== a.stateUntil;
    if (changed) {
      await db
        .update(animals)
        .set({ targetX, targetY, state, hunger, mood, stateUntil })
        .where(eq(animals.id, a.id));
    }
  }
  await writeMoves("animal", writes);
  return writes.length;
}

/**
 * Animals don't carry a `homeX/homeY` the way NPCs do; their home is
 * the centre of their `zone`.
 */
function homePointForAnimal(a: { zone: { x: number; y: number; w: number; h: number } }): Point {
  return { x: a.zone.x + a.zone.w / 2, y: a.zone.y + a.zone.h / 2 };
}

async function tickWeather(ws: typeof worldState.$inferSelect, now: Date) {
  if (ws.weatherUntil > now) return;
  const roll = Math.random();
  const weather = roll < 0.58 ? "clear" : roll < 0.8 ? "rain" : roll < 0.92 ? "fog" : "snow";
  const minutes = 4 + Math.random() * 10;
  await db
    .update(worldState)
    .set({ weather, weatherUntil: new Date(now.getTime() + minutes * 60_000) })
    .where(eq(worldState.id, 1));
  if (weather !== ws.weather) {
    const text = { clear: "The clouds part and sun spills over the plaza.", rain: "A soft rain begins to fall over the grove.", fog: "Fog rolls in from the pond.", snow: "Snow! Fat, lazy flakes drift down on the rooftops." }[weather];
    await logEvent("weather", text ?? "The weather shifts.");
    // Weather changes are global; emit a sentinel event so WS clients can
    // refresh their overlay. The id=0 sentinel is ignored by proximity
    // filters; WS clients invalidate their cached snapshot on receipt.
  }
}

async function tickResources(now: Date) {
  // Advance stage for any resource node whose regrowth timer has
  // elapsed. Picking resets the timer, so this only ever moves nodes
  // toward (never past) `stages - 1`. Kinds with regrowthMs = 0 never
  // get a `nextAdvanceAt` set by the action route, so they're naturally
  // skipped here.
  const due = await db
    .select({ id: resourceNodes.id, kind: resourceNodes.kind, stage: resourceNodes.stage, ownerId: resourceNodes.ownerId })
    .from(resourceNodes)
    .where(and(isNotNull(resourceNodes.nextAdvanceAt), lt(resourceNodes.nextAdvanceAt, now)));
  // Green Thumb owners' crops grow faster.
  const owners = [...new Set(due.map((r) => r.ownerId).filter((id): id is number => id != null))];
  const perks = await perksOfMany(owners);
  for (const row of due) {
    const cfg = getCropKind(row.kind);
    const stages = cfg?.stages ?? 2;
    const thumb = row.ownerId != null && perks.get(row.ownerId)?.has("green_thumb");
    if (!cfg || cfg.regrowthMs <= 0) continue;
    const nextStage = row.stage + 1;
    // Perennials ripen their fruit at their own pace (src/lib/vineyard.ts).
    const regrowthMs = Math.round(stageMs(cfg, nextStage) * (thumb ? GREEN_THUMB_MULT : 1));
    const fullyGrown = nextStage >= stages - 1;
    await db
      .update(resourceNodes)
      .set({
        stage: nextStage,
        nextAdvanceAt: fullyGrown ? null : new Date(now.getTime() + regrowthMs),
      })
      .where(eq(resourceNodes.id, row.id));
  }
}

/** Online players heal 1 HP every this many beats (3 × 5 s = 15 s). */
const HP_REGEN_EVERY_BEATS = 3;
const ONLINE_WINDOW_MS = 45_000;

async function regenHp(now: Date): Promise<void> {
  await db
    .update(characters)
    .set({ hp: sql`least(${characters.maxHp}, ${characters.hp} + 1)` })
    .where(and(lt(characters.hp, characters.maxHp), gt(characters.lastSeenAt, new Date(now.getTime() - ONLINE_WINDOW_MS))));
}

async function tickEnemies(beat: TickBeat, now: Date, night: boolean): Promise<number> {
  let rows = await db.select().from(enemies);
  if (!night) {
    // Night creatures fade at dawn.
    const gone = rows.filter((e) => enemyKind(e.kind).nightOnly && !inDarkZone(e.x, e.y));
    if (gone.length > 0) {
      await db.delete(enemies).where(inArray(enemies.id, gone.map((e) => e.id)));
      const goneIds = new Set(gone.map((e) => e.id));
      rows = rows.filter((e) => !goneIds.has(e.id));
    }
  }
  const writes: MoveWrite[] = [];
  for (const e of rows) {
    if (isBossKind(e.kind)) continue; // bosses stand their ground
    if (!isDue("enemy", e.id, beat.index, ENEMY_MOVE_INTERVAL_MS)) continue;
    if (busyAt(e, beat.startAt)) continue;
    // Wild enemies roam around where they appeared (home = targetX/Y).
    const leash = (e.wild || e.elite) && e.targetX != null && e.targetY != null
      ? leashAround({ x: e.targetX, y: e.targetY }, WILD_LEASH_TILES)
      : leashOfRect(zoneForEnemy(e.x, e.y));
    const w = await wanderWrite(e, leash, ENEMY_SPEED, beat);
    if (w) writes.push(w);
  }
  await writeMoves("enemy", writes);
  // Refill each zone toward its target, one spawn per zone per beat at most.
  for (const zone of ENEMY_ZONES) {
    const z = zone.rect;
    const count = rows.filter((e) => e.kind in ENEMY_KINDS && !isBossKind(e.kind) && e.x >= z.x && e.x < z.x + z.w && e.y >= z.y && e.y < z.y + z.h).length;
    if (count >= (zone.target ?? ZONE_TARGET_ENEMIES) || Math.random() >= 0.35) continue;
    const kind = pickEnemyKind(zone, night);
    if (!kind) continue;
    const p = await randomPointIn(z);
    if (!p) continue;
    const hp = enemyHpAt(kind, tierAt(Math.floor(p.x / 16), Math.floor(p.y / 16)));
    await db.insert(enemies).values({ kind, x: p.x, y: p.y, hp, maxHp: hp, spawnedAt: now });
  }
  await tickWild(rows, now, night);
  // Bounty boards: lapsed bounties down, new ones up (every ~30 s).
  if (beat.index % 6 === 0) await refreshBounties(now).catch((err) => console.warn("[tick] bounty refresh failed:", err instanceof Error ? err.message : err));
  await tickBoss(rows, now);
  await tickLairs(rows, now).catch((err) => console.warn("[tick] lairs failed:", err instanceof Error ? err.message : err));
  return writes.length;
}

/**
 * The continent's wild enemies follow the players: keep each player's
 * surroundings (outside the heartland) topped up with biome- and
 * tier-appropriate enemies, and fade the ones nobody has been near for a
 * while. One spawn per player per beat at most.
 */
async function tickWild(rows: (typeof enemies.$inferSelect)[], now: Date, night: boolean): Promise<void> {
  const nowMs = now.getTime();
  const online = await db.select({ id: characters.id, x: characters.x, y: characters.y }).from(characters)
    .where(gt(characters.lastSeenAt, new Date(nowMs - ONLINE_WINDOW_MS)));
  const wild = rows.filter((e) => e.wild).map((e) => ({ e, p: rowPositionAt(e, nowMs) }));
  // Spatial grids: each check only looks at the few cells around it, so this
  // stays cheap with hundreds of players and thousands of beasts.
  const players = buildGrid(online, (o) => o, WILD_RADIUS_PX);
  const near = wild.filter(({ p }) => countWithin(players, p.x, p.y, WILD_RADIUS_PX * 1.5, (o) => o) > 0).map(({ e }) => e.id);
  const nearSet = new Set(near);
  if (near.length) await db.update(enemies).set({ nearAt: now }).where(inArray(enemies.id, near));
  const stale = wild.filter(({ e }) => !nearSet.has(e.id) && (e.nearAt ?? e.spawnedAt).getTime() < nowMs - WILD_DESPAWN_MS).map(({ e }) => e.id);
  const staleSet = new Set(stale);
  if (stale.length) await db.delete(enemies).where(inArray(enemies.id, stale));

  // Random encounters around travelling players (src/lib/encounters.ts).
  await tickEncounters(online, now, night).catch((err) => console.warn("[tick] encounters failed:", err instanceof Error ? err.message : err));

  // New packs are placed by the WS server in the land ahead of moving
  // players (src/lib/wildPopulation.ts), so they're there before anyone
  // sees the spot. Here: forget fill records nobody can use any more.
  if (nowMs - lastWildChunkPrune > 3600_000) {
    lastWildChunkPrune = nowMs;
    await db.delete(wildChunks).where(lt(wildChunks.populatedAt, new Date(nowMs - 2 * REPOPULATE_MS)));
  }
}
let lastWildChunkPrune = 0;


/** Things happened while nobody was watching. Write a few plausible entries. */
async function unattendedEvents(elapsedSec: number) {
  const n = Math.min(6, Math.max(1, Math.floor(elapsedSec / 240)));
  const beasts = await db.select().from(animals);
  const folks = await db.select().from(npcs).where(eq(npcs.active, true));
  const templates = [
    () => { const a = pick(beasts); return [a, `${a.name} the ${a.species} wandered off and came back muddy.`] as const; },
    () => { const a = pick(beasts); return [a, `${a.name} found a sunny patch and refused to move for an hour.`] as const; },
    () => { const a = beasts.find((b) => b.species === "fox") ?? pick(beasts); return [a, `${a.name} was spotted eyeing the chicken yard. The chickens were unimpressed.`] as const; },
    () => { const a = beasts.find((b) => b.species === "cat") ?? pick(beasts); return [a, `${a.name} napped on the bakery windowsill again.`] as const; },
    () => { const p = pick(folks); return [null, `${p.name} swept the step outside and hummed something old.`] as const; },
    () => { const p = pick(folks); return [null, `${p.name} was overheard arguing with a duck. The duck won.`] as const; },
  ];
  for (let i = 0; i < n; i++) {
    const [subject, text] = pick(templates)();
    await db.insert(worldEvents).values({
      kind: "ambient",
      text,
      subjectType: subject ? "animal" : "npc",
      subjectId: subject?.id,
      x: subject?.x,
      y: subject?.y,
      createdAt: new Date(Date.now() - Math.random() * elapsedSec * 1000),
    });
  }
}
