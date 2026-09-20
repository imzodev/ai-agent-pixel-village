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
import { db } from "@/db";
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
import { chunkAtWorldPx } from "@/lib/chunkCollision";
import { gameHour } from "@/lib/worldmap";
import { getBuildingDoors } from "@/lib/buildingsServer";
import { redis, initRedis } from "@/lib/redis";
import type { WorldSnapshot } from "@/lib/protocol";

// Cache TTL — long enough that several polls share a snapshot, short
// enough that state changes are visible. 250 ms is a sensible default
// for a pixel village; tune via SNAPSHOT_TTL_MS if needed.
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

// Cache key includes meId so two players in the same chunk don't see
// each other's `me` field. Without this, the second player's request
// would return the first player's snapshot, including their position
// as `me`.
const cacheKey = (cx: number, cy: number, meId: number | null): string =>
  `snap:${cx}:${cy}:${meId ?? "anon"}`;

type SponsorLite = {
  id: number;
  businessName: string;
  brandColor: string;
  tagline: string;
};

type PlayerRow = {
  id: number;
  name: string;
  x: number;
  y: number;
  facing: string;
  appearance: typeof characters.$inferSelect.appearance;
  level: number;
  hp: number;
  maxHp: number;
  coins: number;
  gems: number;
  xp: number;
};

type RawSnapshot = {
  world: typeof worldState.$inferSelect;
  players: PlayerRow[];
  npcs: Array<typeof npcs.$inferSelect>;
  animals: Array<typeof animals.$inferSelect>;
  buildings: Array<typeof buildings.$inferSelect>;
  sponsors: SponsorLite[];
  groundItems: Array<typeof groundItems.$inferSelect>;
  resourceNodes: Array<typeof resourceNodes.$inferSelect>;
  enemies: Array<typeof enemies.$inferSelect>;
  chat: Array<typeof worldChat.$inferSelect>;
  events: Array<typeof worldEvents.$inferSelect>;
  doors: Map<string, { x: number; y: number }>;
  meId: number | null;
  meEquipped: string[];
  equippedByChar: Map<number, string[]>;
  spById: Record<string, SponsorLite>;
};

export type Snapshot = WorldSnapshot;

// ── Assembler ──────────────────────────────────────────────────────────
// Pulls only entities within the player's reach. Called once per (chunk,
// TTL window); results are JSON-serialised and served to every player in
// that chunk for the rest of the window.
async function buildRawSnapshot(meId: number | null, playerX: number, playerY: number): Promise<RawSnapshot> {
  const [ws] = await db.select().from(worldState).where(eq(worldState.id, 1));
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
    players,
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
    // Players stay global but time-bounded — chat needs everyone, and the
    // result is bounded to ~last 45 s. Indexed on lastSeenAt.
    db
      .select({
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
      })
      .from(characters)
      .where(gt(characters.lastSeenAt, since)),
    db.select().from(npcs).where(
      and(
        eq(npcs.active, true),
        gte(npcs.x, xMin), lt(npcs.x, xMax),
        gte(npcs.y, yMin), lt(npcs.y, yMax),
      ),
    ),
    db.select().from(animals).where(
      and(
        gte(animals.x, xMin), lt(animals.x, xMax),
        gte(animals.y, yMin), lt(animals.y, yMax),
      ),
    ),
    db.select().from(buildings),
    db
      .select({
        id: sponsors.id,
        businessName: sponsors.businessName,
        brandColor: sponsors.brandColor,
        tagline: sponsors.tagline,
        status: sponsors.status,
      })
      .from(sponsors)
      .where(eq(sponsors.status, "active")),
    db.select().from(groundItems).where(
      and(
        gte(groundItems.x, xMin), lt(groundItems.x, xMax),
        gte(groundItems.y, yMin), lt(groundItems.y, yMax),
      ),
    ),
    db.select().from(resourceNodes),
    db.select().from(enemies).where(
      and(
        gte(enemies.x, xMin), lt(enemies.x, xMax),
        gte(enemies.y, yMin), lt(enemies.y, yMax),
      ),
    ),
    db
      .select()
      .from(worldChat)
      .where(gt(worldChat.createdAt, chatSince))
      .orderBy(desc(worldChat.id))
      .limit(30),
    db.select().from(worldEvents).orderBy(desc(worldEvents.id)).limit(10),
  ]);

  const spById = new Map<number, SponsorLite>(sponsorRows.map((s) => [s.id, s]));
  const doors = await getBuildingDoors();

  // Equipment lookup: per-player single query avoids the O(P×E) nested
  // scan the old code did in JS. Two short queries replace the cost.
  let meEquipped: string[] = [];
  if (meId) {
    const rows = await db
      .select({ itemKey: inventory.itemKey })
      .from(inventory)
      .where(sql`${inventory.characterId} = ${meId} and ${inventory.equipped} = true`);
    meEquipped = rows.map((r) => r.itemKey);
  }
  const playerIds = players.map((p) => p.id);
  const equippedAll =
    playerIds.length > 0
      ? await db
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
    doors,
    meId,
    meEquipped,
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
    me: (() => {
      if (!raw.meId) return null;
      const found = raw.players.find((p) => p.id === raw.meId);
      if (!found) return null;
      return {
        ...found,
        gems: found.gems ?? 0,
        equipped: raw.meEquipped,
      };
    })(),
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

/**
 * Get a snapshot for the player at (x, y). Proximity-filtered and cached
 * per chunk for SNAPSHOT_TTL_SECONDS. Many players in the same chunk
 * share one cache entry.
 */
// In-process LRU cache for the WS path. Each WS process keeps its own
// snapshot cache keyed by chunk. The TTL is short (one SNAPSHOT_TTL_MS)
// so the WS server always serves fresh-ish data. Crucially, this avoids
// per-refresh Redis GETs — at scale, those would burn Upstash budget
// quickly. The HTTP path (/api/world fallback) bypasses this layer and
// reads through to Redis directly.
const PROC_CACHE_MAX = Number(process.env.SNAPSHOT_PROC_CACHE_SIZE ?? 256);
const PROC_CACHE_TTL_MS = Math.max(50, Number(process.env.SNAPSHOT_PROC_CACHE_TTL_MS ?? 750));

type ProcCacheEntry = { snap: Snapshot; expiresAt: number };

const procCache = new Map<string, ProcCacheEntry>();

function procCacheGet(key: string): Snapshot | null {
  const e = procCache.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
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

export async function getSnapshot(meId: number | null, playerX: number, playerY: number): Promise<Snapshot> {
  if (!initStarted) {
    initStarted = true;
    // Fire and forget — first request may use the fallback once.
    void initRedis();
  }

  const { cx, cy } = chunkAtWorldPx(playerX, playerY);
  const key = cacheKey(cx, cy, meId);

  // Layer 1: in-process cache. No Redis call. Hot path for the WS
  // server's periodic refresh.
  const hit = procCacheGet(key);
  if (hit) return hit;

  // Layer 2: Redis cache. Shared across processes (e.g. for the HTTP
  // /api/world fallback). One read per cache miss; one read per call
  // for the WS path is too expensive at scale.
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

  // Cache miss — rebuild from DB. world:version only increments on
  // actual rebuild, not on every cache hit.
  let version = 0;
  try {
    version = await redis.incr("world:version");
  } catch {
    version = Date.now();
  }

  const raw = await buildRawSnapshot(meId, playerX, playerY);
  const snap = formatSnapshot(raw, version);
  procCacheSet(key, snap);
  try {
    await redis.set(key, JSON.stringify(snap), { ex: SNAPSHOT_TTL_SECONDS });
  } catch {
    // Redis unreachable — serve anyway, just without caching.
  }
  return snap;
}