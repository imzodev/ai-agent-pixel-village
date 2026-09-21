// Snapshot assembly + Redis-backed TTL cache + proximity filter.
//
// What this replaces:
//   Before: every /api/world request ran 9 parallel SELECTs returning
//   every NPC, animal, enemy, ground item, resource node, building,
//   player, sponsor, chat message, and world event — globally. At 5k
//   concurrent players that's ~5k RPS × ~14 SQL queries = 70k QPS on a
//   single Postgres.
//
//   After: NPCs/animals/enemies/ground items/resource nodes are filtered
//   to ±1 chunk around the requesting player. Players stay global (chat
//   needs them). The whole snapshot is cached in Redis keyed by player
//   chunk for 250 ms — many players in the same chunk share one query
//   result.
//
//   5k RPS becomes ~5k cache reads + ~5 RPS actual queries when players
//   are spatially clustered. That fits a small primary with a snapshot
//   per chunk per quarter second.

import { and, desc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import {
  animals,
  buildings,
  characters,
  enemies,
  groundItems,
  inventory,
  npcs,
  resourceNodes,
  sponsors,
  worldChat,
  worldEvents,
  worldState,
} from "@/db/schema";
import { onlinePlayers } from "@/db/views";
import { chunkAtWorldPx } from "@/lib/chunkCollision";
import { gameHour } from "@/lib/worldmap";
import { getBuildingDoors } from "@/lib/buildingsServer";
import { redis, initRedis } from "@/lib/redis";
import { withReadDb } from "@/lib/db";
import { metrics } from "@/lib/metrics";
import type { WorldSnapshot } from "@/lib/protocol";
import type {
  PlayerRow,
  RawSnapshot,
  Snapshot,
  SnapshotCacheState,
  SponsorLite,
  ViewState,
} from "@/types/snapshot";

export type { Snapshot };

// Optional cross-process snapshot cache in Redis. OFF by default.
//
// The WS server and the HTTP routes run in the SAME process (custom
// server in src/server.ts), so the in-process cache below already
// serves every reader. A Redis copy adds a GET per cache miss and a
// SET per rebuild with no in-process benefit — at one rebuild every
// WS_REFRESH_MS that alone exceeds a small Upstash plan. Enable it only
// for a multi-process deployment that shares snapshots across processes.
const SNAPSHOT_REDIS_CACHE = process.env.SNAPSHOT_REDIS_CACHE === "1";

// TTL for the opt-in Redis snapshot cache (seconds). Only read when
// SNAPSHOT_REDIS_CACHE is on.
const SNAPSHOT_TTL_SECONDS = Math.max(1, Math.floor(Number(process.env.SNAPSHOT_TTL_MS ?? 250) / 1000));

// Proximity radius in PIXELS, centered on the player's actual position.
//
// The previous implementation anchored the bbox on the player's CHUNK
// origin (multiples of 384×240), which meant the whole bbox JUMPED by
// an entire chunk every time the player crossed a chunk boundary.
// Entities near the boundary (e.g. the chicken coop straddling two
// chunk rows) flickered in/out on every crossing. A pixel-centered
// bbox moves smoothly with the player and entities only leave view
// when they genuinely cross the radius — like a normal view distance.
//
// Default 1152 px = 3 chunk-widths, comfortably larger than the
// viewport (clamped to a 3×3 chunk area ≈ 1152×720 px) so entities
// slightly off-screen are still tracked and can walk into view.
const PROXIMITY_RADIUS_PX = Number(process.env.PROXIMITY_RADIUS_PX ?? 1152);

const PRESENCE_WINDOW_MS = 45_000;
const CHAT_WINDOW_MS = 12_000;

// Shared snapshot cache keyed by chunk ONLY. Every player in a chunk
// shares one rebuild; the local player's `me` row is injected from the
// shared `players` array at send time, so `meId` must not be part of the
// key (it would force a rebuild per player).
const cacheKey = (cx: number, cy: number): string => `snap:${cx}:${cy}`;

// Player projection shared by the view read and the direct fallback.
const playerColumns = {
  id: characters.id,
  name: characters.name,
  x: characters.x,
  y: characters.y,
  facing: characters.facing,
  appearance: characters.appearance,
  level: characters.level,
  hp: characters.hp,
  maxHp: characters.maxHp,
  coins: characters.coins,
  gems: characters.gems,
  xp: characters.xp,
} as const;

// View availability, cached so a missing view doesn't cost a failed query
// per snapshot. Retried every VIEW_RETRY_MS so a view created later (by
// the sim worker on boot) is picked up without a process restart.
let viewState: ViewState = { available: true, checkedAt: 0 };
const VIEW_RETRY_MS = 30_000;

// Projection over the online_players view (same columns under its name).
const viewColumns = {
  id: onlinePlayers.id,
  name: onlinePlayers.name,
  x: onlinePlayers.x,
  y: onlinePlayers.y,
  facing: onlinePlayers.facing,
  appearance: onlinePlayers.appearance,
  level: onlinePlayers.level,
  hp: onlinePlayers.hp,
  maxHp: onlinePlayers.maxHp,
  coins: onlinePlayers.coins,
  gems: onlinePlayers.gems,
  xp: onlinePlayers.xp,
} as const;

/**
 * Fetch the online player rows inside the proximity bbox, plus the global
 * online count.
 *
 * Players are proximity-filtered like every other entity (the local
 * player is at the bbox center, so they are always included). The global
 * count is read separately so the HUD can show "N online" without
 * shipping N player rows to every client. Primary source is the
 * `online_players` materialized view (refreshed by the sim worker); if it
 * is missing we fall back to the indexed characters range scan.
 */
async function fetchPlayers(
  rdb: ReturnType<typeof withReadDb>,
  since: Date,
  bbox: { xMin: number; xMax: number; yMin: number; yMax: number },
): Promise<{ players: PlayerRow[]; onlineCount: number }> {
  const tryView = viewState.available || Date.now() - viewState.checkedAt > VIEW_RETRY_MS;

  // Global count — cheap on the view, indexed range scan on characters.
  const countQuery = rdb
    .select({ n: sql<number>`count(*)::int` })
    .from(onlinePlayers);

  if (tryView) {
    try {
      const [rows, countRows] = await Promise.all([
        rdb
          .select(viewColumns)
          .from(onlinePlayers)
          .where(
            and(
              gte(onlinePlayers.x, bbox.xMin), lt(onlinePlayers.x, bbox.xMax),
              gte(onlinePlayers.y, bbox.yMin), lt(onlinePlayers.y, bbox.yMax),
            ),
          ),
        countQuery,
      ]);
      viewState = { available: true, checkedAt: Date.now() };
      return { players: rows, onlineCount: countRows[0]?.n ?? rows.length };
    } catch {
      // View missing (not created yet) — remember and use the direct query
      // until the retry window elapses.
      viewState = { available: false, checkedAt: Date.now() };
      console.warn("[snapshot] online_players view unavailable; using characters directly");
    }
  }

  const [rows, countRows] = await Promise.all([
    rdb
      .select(playerColumns)
      .from(characters)
      .where(
        and(
          gt(characters.lastSeenAt, since),
          gte(characters.x, bbox.xMin), lt(characters.x, bbox.xMax),
          gte(characters.y, bbox.yMin), lt(characters.y, bbox.yMax),
        ),
      ),
    rdb
      .select({ n: sql<number>`count(*)::int` })
      .from(characters)
      .where(gt(characters.lastSeenAt, since)),
  ]);
  return { players: rows, onlineCount: countRows[0]?.n ?? rows.length };
}

// ── Assembler ──────────────────────────────────────────────────────────
// Pulls only entities within the player's reach. Called once per (chunk,
// TTL window); results are JSON-serialised and served to every player in
// that chunk for the rest of the window.
async function buildRawSnapshot(playerX: number, playerY: number): Promise<RawSnapshot> {
  // All reads go through the replica when one is configured (falls back to
  // the primary otherwise). Writes never happen in this module.
  const rdb = withReadDb();
  const [ws] = await rdb.select().from(worldState).where(eq(worldState.id, 1));
  const since = new Date(Date.now() - PRESENCE_WINDOW_MS);
  const chatSince = new Date(Date.now() - CHAT_WINDOW_MS);

  // Bounding box for proximity-filtered entities — pixel-centered on the
  // player's actual position so it moves smoothly with them (no chunk
  // snapping). See the PROXIMITY_RADIUS_PX comment above.
  const xMin = playerX - PROXIMITY_RADIUS_PX;
  const xMax = playerX + PROXIMITY_RADIUS_PX;
  const yMin = playerY - PROXIMITY_RADIUS_PX;
  const yMax = playerY + PROXIMITY_RADIUS_PX;

  const [
    playersResult,
    npcRows,
    animalRows,
    buildingRows,
    sponsorRows,
    ground,
    nodes,
    enemyRows,
    chat,
    events,
  ] = await Promise.all([
    fetchPlayers(rdb, since, { xMin, xMax, yMin, yMax }),
    rdb.select().from(npcs).where(
      and(
        eq(npcs.active, true),
        gte(npcs.x, xMin), lt(npcs.x, xMax),
        gte(npcs.y, yMin), lt(npcs.y, yMax),
      ),
    ),
    rdb.select().from(animals).where(
      and(
        gte(animals.x, xMin), lt(animals.x, xMax),
        gte(animals.y, yMin), lt(animals.y, yMax),
      ),
    ),
    rdb.select().from(buildings),
    rdb
      .select({
        id: sponsors.id,
        businessName: sponsors.businessName,
        brandColor: sponsors.brandColor,
        tagline: sponsors.tagline,
        status: sponsors.status,
      })
      .from(sponsors)
      .where(eq(sponsors.status, "active")),
    rdb.select().from(groundItems).where(
      and(
        gte(groundItems.x, xMin), lt(groundItems.x, xMax),
        gte(groundItems.y, yMin), lt(groundItems.y, yMax),
      ),
    ),
    rdb.select().from(resourceNodes),
    rdb.select().from(enemies).where(
      and(
        gte(enemies.x, xMin), lt(enemies.x, xMax),
        gte(enemies.y, yMin), lt(enemies.y, yMax),
      ),
    ),
    rdb
      .select()
      .from(worldChat)
      .where(gt(worldChat.createdAt, chatSince))
      .orderBy(desc(worldChat.id))
      .limit(30),
    rdb.select().from(worldEvents).orderBy(desc(worldEvents.id)).limit(10),
  ]);

  const spById = new Map<number, SponsorLite>(sponsorRows.map((s) => [s.id, s]));
  const doors = await getBuildingDoors();

  // Equipment for the (proximity-filtered) players we are actually
  // shipping. The local player's own equipment comes from this same list,
  // so no separate per-player query is needed.
  const { players, onlineCount } = playersResult;
  const playerIds = players.map((p) => p.id);
  const equippedAll =
    playerIds.length > 0
      ? await rdb
          .select({ characterId: inventory.characterId, itemKey: inventory.itemKey })
          .from(inventory)
          .where(and(inArray(inventory.characterId, playerIds), eq(inventory.equipped, true)))
      : [];

  const equippedByChar = new Map<number, string[]>();
  for (const e of equippedAll) {
    const list = equippedByChar.get(e.characterId);
    if (list) list.push(e.itemKey);
    else equippedByChar.set(e.characterId, [e.itemKey]);
  }

  return {
    world: ws,
    players,
    npcs: npcRows,
    animals: animalRows,
    buildings: buildingRows,
    sponsors: sponsorRows,
    groundItems: ground,
    resourceNodes: nodes,
    enemies: enemyRows,
    chat,
    events,
    onlineCount,
    doors,
    equippedByChar,
    spById: Object.fromEntries(spById),
  };
}

function formatSnapshot(raw: RawSnapshot, version: number): WorldSnapshot {
  const ws = raw.world;
  const spById = raw.spById;
  const doors = raw.doors;

  return {
    version,
    now: Date.now(),
    hour: gameHour(ws.epochStart.getTime(), ws.dayLengthMinutes),
    weather: ws.weather,
    dayLengthMinutes: ws.dayLengthMinutes,
    epochStart: ws.epochStart.getTime(),
    // `me` is injected per requester by getSnapshot(); the cached shared
    // snapshot always carries null here.
    me: null,
    onlineCount: raw.onlineCount,
    players: raw.players.map((p) => ({
      ...p,
      equipped: raw.equippedByChar.get(p.id) ?? [],
    })),
    npcs: raw.npcs.map((n) => {
      const sp = n.sponsorId != null ? spById[String(n.sponsorId)] : null;
      return {
        id: n.id,
        key: n.key,
        name: n.name,
        role: n.role,
        x: n.x,
        y: n.y,
        targetX: n.targetX,
        targetY: n.targetY,
        facing: n.facing,
        appearance: n.appearance,
        mood: n.mood,
        kind: n.kind,
        sponsor: sp ? { businessName: sp.businessName, brandColor: sp.brandColor } : null,
      };
    }),
    animals: raw.animals.map((a) => ({
      id: a.id,
      species: a.species,
      name: a.name,
      x: a.x,
      y: a.y,
      targetX: a.targetX,
      targetY: a.targetY,
      facing: a.facing,
      state: a.state,
      mood: a.mood,
    })),
    buildings: raw.buildings.map((b) => {
      const sp = b.sponsorId != null ? spById[String(b.sponsorId)] : null;
      const door = doors.get(b.key);
      return {
        id: b.id,
        key: b.key,
        name: b.name,
        kind: b.kind,
        color: b.color,
        tx: b.tx,
        ty: b.ty,
        tw: b.tw,
        th: b.th,
        reservable: b.reservable,
        doorX: door?.x ?? (b.tx + b.tw / 2) * 16,
        doorY: door?.y ?? (b.ty + b.th) * 16 + 12,
        sponsor: sp
          ? { businessName: sp.businessName, brandColor: sp.brandColor, tagline: sp.tagline }
          : null,
      };
    }),
    groundItems: raw.groundItems,
    nodes: raw.resourceNodes.map((n) => ({ id: n.id, kind: n.kind, x: n.x, y: n.y, qty: n.qty, ready: !n.respawnAt })),
    enemies: raw.enemies.map((e) => ({
      id: e.id,
      kind: e.kind,
      x: e.x,
      y: e.y,
      targetX: e.targetX,
      targetY: e.targetY,
      hp: e.hp,
      maxHp: e.maxHp,
    })),
    chat: raw.chat.map((c) => ({
      id: c.id,
      speakerType: c.speakerType,
      speakerId: c.speakerId,
      text: c.text,
      at: c.createdAt.getTime(),
    })),
    events: raw.events.map((e) => ({
      id: e.id,
      kind: e.kind,
      text: e.text,
      at: e.createdAt.getTime(),
    })),
  };
}

// ── Public API ─────────────────────────────────────────────────────────

let initStarted = false;

// In-process shared snapshot cache. THE cache for the WS + HTTP paths
// (they share one process). Keyed by chunk only, so every player in a
// chunk within the TTL window shares one DB rebuild.
const PROC_CACHE_MAX = Number(process.env.SNAPSHOT_PROC_CACHE_SIZE ?? 256);
const PROC_CACHE_TTL_MS = Math.max(50, Number(process.env.SNAPSHOT_PROC_CACHE_TTL_MS ?? 5000));

// Anchored on globalThis: this module is loaded both by src/server.ts and
// by Next's bundled API routes, and a mutation invalidated in one copy
// must also drop the other copy's cache (see SnapshotCacheState).
const SNAPSHOT_CACHE_KEY = "__grove_snapshot_cache__";

function getCacheState(): SnapshotCacheState {
  const g = globalThis as unknown as Record<string, SnapshotCacheState | undefined>;
  let s = g[SNAPSHOT_CACHE_KEY];
  if (!s) {
    s = { procCache: new Map(), version: 0 };
    g[SNAPSHOT_CACHE_KEY] = s;
  }
  return s;
}

const cacheState = getCacheState();
const procCache = cacheState.procCache;

function procCacheGet(key: string): Snapshot | null {
  const e = procCache.get(key);
  if (!e) return null;
  // `<=` so an entry whose TTL equals the refresh interval is rebuilt at
  // the next refresh rather than lingering one extra cycle.
  if (e.expiresAt <= Date.now()) {
    procCache.delete(key);
    return null;
  }
  // Refresh recency for LRU.
  procCache.delete(key);
  procCache.set(key, e);
  return e.snap;
}

function procCacheSet(key: string, snap: Snapshot): void {
  if (procCache.size >= PROC_CACHE_MAX) {
    const oldest = procCache.keys().next().value;
    if (oldest !== undefined) procCache.delete(oldest);
  }
  procCache.set(key, { snap, expiresAt: Date.now() + PROC_CACHE_TTL_MS });
}

/**
 * Drop every cached shared snapshot. Called after a mutation so the next
 * read rebuilds with the change (and the WS server can push it immediately
 * instead of waiting out the TTL).
 */
export function invalidateSnapshots(): void {
  procCache.clear();
}

/**
 * Build (or serve from cache) the shared snapshot for a chunk. The
 * returned object has `me: null`; callers inject the local player via
 * `withMe()`.
 */
async function getSharedSnapshot(
  playerX: number,
  playerY: number,
  opts?: { bypassRedis?: boolean },
): Promise<Snapshot> {
  const { cx, cy } = chunkAtWorldPx(playerX, playerY);
  const key = cacheKey(cx, cy);

  const hit = procCacheGet(key);
  if (hit) {
    metrics.snapshotCacheHitsTotal.inc();
    return hit;
  }
  metrics.snapshotCacheMissesTotal.inc();

  // Optional cross-process Redis cache (off by default). `bypassRedis` is
  // used by the post-mutation broadcast so it never serves a stale entry.
  if (SNAPSHOT_REDIS_CACHE && !opts?.bypassRedis) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        try {
          const snap = JSON.parse(String(cached)) as Snapshot;
          procCacheSet(key, snap);
          return snap;
        } catch {
          // Bad cache entry — fall through to rebuild.
        }
      }
    } catch {
      // Redis unreachable — fall through and serve fresh from DB.
    }
  }

  const version = ++cacheState.version;
  const raw = await buildRawSnapshot(playerX, playerY);
  const snap = formatSnapshot(raw, version);
  procCacheSet(key, snap);
  if (SNAPSHOT_REDIS_CACHE) {
    try {
      await redis.set(key, JSON.stringify(snap), { ex: SNAPSHOT_TTL_SECONDS });
    } catch {
      // Redis unreachable — serve anyway, just without caching.
    }
  }
  return snap;
}

/**
 * Inject the local player's `me` row from the shared `players` list. The
 * shared snapshot has `me: null`; this produces the per-requester shape
 * without a per-player cache entry.
 */
export function withMe(shared: Snapshot, meId: number | null): Snapshot {
  if (!meId) return shared;
  const me = shared.players.find((p) => p.id === meId) ?? null;
  return me ? { ...shared, me } : shared;
}

/**
 * Get a snapshot for the player at (x, y). Proximity-filtered, cached per
 * chunk, with `me` injected. Many players in the same chunk share one
 * cache entry.
 */
export async function getSnapshot(
  meId: number | null,
  playerX: number,
  playerY: number,
  opts?: { bypassRedis?: boolean },
): Promise<Snapshot> {
  if (!initStarted) {
    initStarted = true;
    // Fire and forget — first request may use the fallback once.
    void initRedis();
  }
  const shared = await getSharedSnapshot(playerX, playerY, opts);
  return withMe(shared, meId);
}