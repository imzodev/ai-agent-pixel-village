// WebSocket server. Streams world snapshots to clients over a single
// persistent connection, replacing the 1 Hz HTTP polling loop in
// WorldScene. Cuts per-player server work from "1 HTTP request per
// second" to "events delivered only when state changes."
//
// IMPORTANT: the WS is attached to the same HTTP server as Next.js
// (`src/server.ts`). They MUST share a port so the browser sends the
// session cookie on the WS upgrade. Cross-port WS upgrades are blocked
// by same-origin rules; the browser will silently drop the cookie and
// the WS server will see no `grove_session` header.
//
// Architecture:
// - One process per host. (Phase 4 splits across multiple shards by
//   chunk region.)
// - Each connection holds per-player state (id, homeChunk, lastVersion).
// - On connect: validate session via cookie, fetch initial snapshot,
//   subscribe to world_changes channel via Redis pub/sub.
// - On world_change: proximity filter against each connection's
//   homeChunk; queue a delta hint.
// - Coalesce per-connection sends at ~10 Hz so a fox raid doesn't
//   generate 60 messages/sec to one client.

import type http from "node:http";
import type { Duplex } from "node:stream";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { and, asc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, enemies, inventory, sessions, users, wildChunks, worldState } from "@/db/schema";
import { CHUNK_TILE_H, CHUNK_TILE_W, chunkAtWorldPx } from "@/lib/chunkCollision";
import { enemySnapshotOf, getSnapshot, invalidateSnapshots, PROXIMITY_RADIUS_PX } from "@/lib/snapshot";
import { refreshLastSeen } from "@/lib/presence";
import { initRedis, subscribePubSub } from "@/lib/redis";
import { WORLD_CHANGE_CHANNEL } from "@/lib/sim";
import { metrics } from "@/lib/metrics";
import { log } from "@/lib/logger";
import { isDraining } from "@/lib/lifecycle";
import { localShardId } from "@/lib/shards";
import { BROADCAST_OFFSET_MS, WORLD_TICK_MS, WS_RESYNC_MS } from "@/lib/constants";
import { beatIndex, nextBeatAt, rowPositionAt, tileCenter, tileOf } from "@/lib/motion";
import { ENEMY_KINDS, enemyDmgAt, enemyHpAt, enemyKind, enemyZoneAt, isAggressive } from "@/lib/progression";
import { biomeAt, inHeartland, tierAt } from "@/lib/continent";
import { damagePlayer, perksOfMany } from "@/lib/combat";
import { chunksAhead, packFor } from "@/lib/wildPopulation";
import type { ChunkXY } from "@/types/wildlife";
import { CROWD_CHUNKS, REPOPULATE_MS, WILD_MAX_TOTAL } from "@/lib/wildlife";
import { gameHour } from "@/lib/worldmap";
import { planMoveFanout, planPointFanout } from "@/lib/moveFanout";
import { fetchMovesStartingAt, writeMoves } from "@/lib/moveStore";
import { planHunt } from "@/lib/hunt";
import { postponeRegrowth, syncFelledTrees } from "@/lib/treesServer";
import { trunkPoint } from "@/lib/trees";
import type { ChunkRef } from "@/types/trees";
import { isWalkableServer, nearestOpenGround } from "@/lib/chunkCollisionServer";
import type { WorldChange, WorldSnapshot, Facing, ScheduledMove } from "@/lib/protocol";
import { WANTED_DMG_MULT } from "@/lib/bounties";
import { guardStep, newGuard, placeGuard, resumeGuard } from "@/lib/speedGuard";
import { buildGrid, nearby } from "@/lib/spatialGrid";
import type { SpatialGrid } from "@/types/world";
import { CHIP_EVERY_MS, ROLL_LATE_MS, ROLL_PX, canRoll, chipDamage, dirVec, dodged, inShape } from "@/lib/combat/strikes";
import { DASH_SPEED, planStrike, speedScale, usableMoves } from "@/lib/combat/movesets";
import { buildMoveWrite } from "@/lib/moveStore";
import type { CombatState, StatusEffect, Strike } from "@/types/combat";
import type { Move, MoveWrite } from "@/types/motion";
import { BIKE_ITEM } from "@/lib/bike";
import type { Connection, WsInbound, WsSharedState } from "@/types/websocket";

const WS_PATH = "/ws";

const DELTA_COALESCE_MS = 100;
const COOKIE_NAME = "grove_session";

// How often a connected player's position is written to Postgres/Redis.
// Heartbeats arrive much more often than this; the in-memory throttle
// keeps downstream writes bounded.
const PRESENCE_WRITE_INTERVAL_MS = Math.max(
  1000,
  Number(process.env.PRESENCE_WRITE_INTERVAL_MS ?? 10_000),
);

// Slow-client detection. We sample the actual OS-level buffer instead
// of a counter (counters proved unreliable and disconnected active
// clients). An upgrade that hasn't drained within
// SLOW_CLIENT_THRESHOLD_MS bytes for SLOW_CLIENT_HOLD_MS is closed.
// A high threshold protects the flicker fix from Phase 2.
const SLOW_CLIENT_THRESHOLD_BYTES = Number(
  process.env.SLOW_CLIENT_THRESHOLD_BYTES ?? 256 * 1024,
);
const SLOW_CLIENT_HOLD_MS = Number(process.env.SLOW_CLIENT_HOLD_MS ?? 2000);

// Reconnect-storm protection. Per-IP sliding window of upgrade attempts;
// upgrades over WS_MAX_UPGRADES_PER_IP per WS_IP_WINDOW_MS are refused.
const WS_IP_WINDOW_MS = Number(process.env.WS_IP_WINDOW_MS ?? 10_000);
const WS_MAX_UPGRADES_PER_IP = Number(process.env.WS_MAX_UPGRADES_PER_IP ?? 10);
const wsUpgradeTimestamps = new Map<string, number[]>();

// Shared WS state, anchored on globalThis.
//
// This module is loaded TWICE in one process: once by src/server.ts (the
// custom server that actually attaches the WS upgrade handler) and again
// inside Next's bundle for every API route. Each copy would otherwise
// have its own `connections` Map and its own dirty queue, so a route
// calling markWorldDirty() would touch an empty map and no post-mutation
// push would ever happen (the client waited for the 5 s periodic
// refresh). A single globalThis-backed state object makes both copies see
// the same connections, live positions and dirty queue.
const SHARED_STATE_KEY = "__grove_ws_shared__";

const newCombat = (): CombatState => ({ strikes: new Map(), busyUntil: new Map(), rows: [], rowsAt: 0, nextId: 0, rolls: new Map(), timer: null });

function getSharedState(): WsSharedState {
  const g = globalThis as unknown as Record<string, WsSharedState | undefined>;
  let s = g[SHARED_STATE_KEY];
  if (!s) {
    s = { connections: new Map(), dirtyPoints: [], dirtyTimer: null, guards: new Map(), bikes: new Map(), combat: newCombat() };
    g[SHARED_STATE_KEY] = s;
  }
  // Added later: a hot-reloaded process may hold an older state object.
  s.guards ??= new Map();
  s.bikes ??= new Map();
  s.combat ??= newCombat();
  return s;
}

const shared = getSharedState();
const connections = shared.connections;
const guards = shared.guards;
const combat = shared.combat;
const bikes = shared.bikes;

// ── Speed limit (src/lib/speedGuard.ts) ────────────────────────────────
/** How long a "does this player own a bike" answer is trusted. */
const BIKE_CHECK_MS = 20_000;
const CORRECT_MIN_INTERVAL_MS = 250;

/** Look up (again) whether a player owns a bicycle. */
export async function refreshBikeOwnership(playerId: number): Promise<void> {
  const [r] = await db.select({ id: inventory.id }).from(inventory).where(and(eq(inventory.characterId, playerId), eq(inventory.itemKey, BIKE_ITEM))).limit(1);
  bikes.set(playerId, { has: !!r, at: Date.now() });
}

/** Whether a player owns a bike, from the cache (refreshed in the background). */
function ownsBike(playerId: number): boolean {
  const b = bikes.get(playerId);
  if (!b || Date.now() - b.at > BIKE_CHECK_MS) {
    bikes.set(playerId, { has: b?.has ?? false, at: Date.now() }); // one lookup at a time
    void refreshBikeOwnership(playerId).catch(() => {});
  }
  return b?.has ?? false;
}

/**
 * Check a client's reported position against its speed budget. Returns the
 * position to believe; a client that moved too far is told where it is.
 */
function acceptPosition(conn: Connection, x: number, y: number, mounted: boolean): { x: number; y: number } {
  const now = Date.now();
  let g = guards.get(conn.playerId);
  if (!g) { g = newGuard(conn.homePx, conn.homePy, now); guards.set(conn.playerId, g); }
  conn.mounted = mounted && ownsBike(conn.playerId);
  const r = guardStep(g, x, y, now, conn.mounted);
  if (!r.ok && now - (conn.lastCorrectAt ?? 0) >= CORRECT_MIN_INTERVAL_MS) {
    conn.lastCorrectAt = now;
    try { conn.ws.send(JSON.stringify({ type: "correct", x: r.x, y: r.y })); } catch { /* socket closed */ }
  }
  return r;
}

/**
 * The server moved a player itself (waystone travel, a portal, a
 * knockout): reset their speed guard and live position to there.
 */
export function placePlayer(playerId: number, x: number, y: number): void {
  const now = Date.now();
  const g = guards.get(playerId);
  if (g) placeGuard(g, x, y, now); else guards.set(playerId, { ...newGuard(x, y, now), budget: 0 });
  const c = connections.get(playerId);
  if (c) {
    c.homePx = x;
    c.homePy = y;
    const { cx, cy } = chunkAtWorldPx(x, y);
    c.homeCx = cx;
    c.homeCy = cy;
    c.mounted = false;
    populateSoon(null, { cx, cy }); // travelled: fill the ring around the new spot
  }
}
const SHARD_ID = localShardId();

// Movement relay: how far a player's `pos` reaches, and the per-connection
// coalescing window for the post-mutation snapshot push.
const RELAY_RADIUS_PX = Number(process.env.WS_RELAY_RADIUS_PX ?? 1200);
const DIRTY_FLUSH_MS = Math.max(50, Number(process.env.WS_DIRTY_FLUSH_MS ?? 150));
// Minimum gap between relayed one-shot actions (attack swings) per player.
const ACT_MIN_INTERVAL_MS = 250;

// ── Live positions + shared send path ──────────────────────────────────

/**
 * The freshest known position for a connected player, or null. Used for
 * mutation validation so a HTTP route does not compare against a stale
 * DB row.
 */
export function getLivePlayerPosition(playerId: number): { x: number; y: number } | null {
  const c = connections.get(playerId);
  return c ? { x: c.homePx, y: c.homePy } : null;
}

/**
 * Overwrite player positions in a snapshot with the live WS positions so
 * the periodic snapshot never yanks a moving player's sprite backward
 * (the DB row can be ~10 s stale).
 */
function applyLivePositions(snap: WorldSnapshot): void {
  for (const p of snap.players) {
    const c = connections.get(p.id);
    if (c) {
      p.x = c.homePx;
      p.y = c.homePy;
      p.facing = c.homeFacing;
      p.mounted = !!c.mounted;
    }
  }
  if (snap.me) {
    const c = connections.get(snap.me.id);
    if (c) {
      snap.me.x = c.homePx;
      snap.me.y = c.homePy;
      snap.me.facing = c.homeFacing;
    }
  }
}

/**
 * Build this connection's snapshot (shared build + `me` injection + live
 * positions) and send it. Returns true on success.
 */
async function sendSnapshot(conn: Connection, opts?: { bypassRedis?: boolean }): Promise<boolean> {
  if (conn.ws.readyState !== conn.ws.OPEN) return false;
  try {
    const snap = await getSnapshot(conn.playerId, conn.homePx, conn.homePy, opts);
    applyLivePositions(snap);
    conn.lastVersion = snap.version;
    try {
      // Stamp the send time (the shared snapshot may be cached) so the
      // client can sync its clock to the server's.
      conn.ws.send(JSON.stringify({ type: "snapshot", data: { ...snap, now: Date.now() } }));
      return true;
    } catch {
      return false; // socket closed mid-send
    }
  } catch (err) {
    // A failed build means the client gets no world at all: never silent.
    log.error({ err, playerId: conn.playerId, x: conn.homePx, y: conn.homePy }, "snapshot build failed");
    return false;
  }
}

/** Mark the world dirty near (x, y) and schedule a coalesced push. */
/** Connected players within `r` px of (x, y) (live positions). */
/** Nudge these players (if connected here) that a saloon game changed. */
export function nudgeSaloon(playerIds: readonly number[], inn: string): void {
  const msg = JSON.stringify({ type: "saloon", inn });
  for (const id of playerIds) {
    const c = connections.get(id);
    if (!c) continue;
    try { c.ws.send(msg); } catch { /* socket closed */ }
  }
}

export function livePlayersNear(x: number, y: number, r: number): number[] {
  const out: number[] = [];
  for (const c of connections.values()) if (Math.hypot(c.homePx - x, c.homePy - y) <= r) out.push(c.playerId);
  return [...new Set(out)];
}

export function markWorldDirty(x?: number, y?: number): void {
  if (x !== undefined && y !== undefined) shared.dirtyPoints.push({ x, y });
  if (shared.dirtyTimer) return;
  shared.dirtyTimer = setTimeout(() => void flushDirty(), DIRTY_FLUSH_MS);
}

async function flushDirty(): Promise<void> {
  shared.dirtyTimer = null;
  const points = shared.dirtyPoints;
  shared.dirtyPoints = [];
  // Rebuild fresh: the cached snapshot still contains the pre-mutation
  // state until we drop it.
  invalidateSnapshots();
  for (const conn of connections.values()) {
    if (conn.ws.readyState !== conn.ws.OPEN) continue;
    // No point recorded means "everywhere" (e.g. a global event).
    const near =
      points.length === 0 ||
      points.some((p) => Math.hypot(p.x - conn.homePx, p.y - conn.homePy) <= RELAY_RADIUS_PX);
    if (!near) continue;
    await sendSnapshot(conn, { bypassRedis: true });
  }
}

/** Relay a player's live position to nearby connections. */
function relayPosition(from: Connection, x: number, y: number, facing: Facing): void {
  const msg = JSON.stringify({ type: "playerPos", id: from.playerId, x, y, facing, mounted: !!from.mounted });
  for (const conn of connections.values()) {
    if (conn === from) continue;
    if (conn.ws.readyState !== conn.ws.OPEN) continue;
    if (Math.hypot(conn.homePx - x, conn.homePy - y) > RELAY_RADIUS_PX) continue;
    try {
      conn.ws.send(msg);
    } catch {
      /* socket overflow — drop */
    }
  }
}

function normalizeFacing(value: string | undefined): Facing {
  return value === "up" || value === "down" || value === "left" || value === "right" ? value : "down";
}

// ── Auth ────────────────────────────────────────────────────────────────

function parseCookie(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

async function authenticate(req: http.IncomingMessage): Promise<{ playerId: number; x: number; y: number } | null> {
  const cookies = parseCookie(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const now = new Date();
  const rows = await db
    .select({ character: characters })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(characters, eq(characters.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
    .limit(1);

  const ch = rows[0]?.character;
  if (!ch) return null;
  return { playerId: ch.id, x: ch.x, y: ch.y };
}

// ── Connection lifecycle ───────────────────────────────────────────────

async function onConnection(ws: WebSocket, req: http.IncomingMessage): Promise<void> {
  const auth = await authenticate(req);
  if (!auth) {
    ws.close(4401, "unauthenticated");
    return;
  }

  // Pick up the speed guard where it left off (a reconnect may catch up on
  // the time it was away, no more); a first connection starts it at the
  // saved position.
  const now = Date.now();
  let guard = guards.get(auth.playerId);
  if (guard) resumeGuard(guard, now);
  else {
    // A saved spot that's no longer walkable (the continent was regenerated
    // around it): start on the nearest open ground instead.
    const at = await nearestOpenGround(auth.x, auth.y);
    if (at.x !== auth.x || at.y !== auth.y) await db.update(characters).set({ x: at.x, y: at.y }).where(eq(characters.id, auth.playerId));
    guard = newGuard(at.x, at.y, now);
    guards.set(auth.playerId, guard);
  }
  void refreshBikeOwnership(auth.playerId).catch(() => {});
  const { cx, cy } = chunkAtWorldPx(guard.x, guard.y);
  const conn: Connection = {
    ws,
    playerId: auth.playerId,
    homeCx: cx,
    homeCy: cy,
    homePx: guard.x,
    homePy: guard.y,
    homeFacing: "down",
    lastPresenceAt: 0,
    lastVersion: 0,
    pendingDeltas: new Set(),
    flushTimer: null,
    slowSince: 0,
    lastActAt: 0,
  };

  // We don't wrap ws.send or evict "slow consumers" here. The previous
  // implementation used a per-connection outbound byte counter that
  // only reset on `drain` events, which were unreliable under any
  // network jitter — false positives disconnected active clients every
  // ~15 s and forced them to reconnect with a stale bbox, producing
  // the entity-flicker bug. Slow-client eviction happens in a separate
  // sweep that watches `ws.bufferedAmount` (the real OS-level queued
  // bytes), not a hand-rolled counter. Each ws.send below is wrapped
  // in a try/catch so frame-level errors don't tear the connection.
  ws.on("close", (code) => {
    if (conn.flushTimer) clearTimeout(conn.flushTimer);
    connections.delete(conn.playerId);
    metrics.wsConnections.dec({ shard: SHARD_ID });
    // 1008 = slow-consumer eviction (set by the sweep); anything else
    // is a normal close.
    if (code === 1008) {
      metrics.wsEvictionsTotal.inc({ reason: "slow" });
    }
  });
  ws.on("error", () => {
    if (conn.flushTimer) clearTimeout(conn.flushTimer);
    connections.delete(conn.playerId);
  });

  connections.set(conn.playerId, conn);
  populateSoon(null, { cx: conn.homeCx, cy: conn.homeCy }); // arrived: fill the ring around them
  metrics.wsConnections.inc({ shard: SHARD_ID });
  metrics.wsConnectionsTotal.inc({ shard: SHARD_ID });

  // Send initial snapshot. Errors close the connection cleanly.
  try {
    // Refresh presence FIRST so the snapshot's `s.me` reflects the fresh
    // lastSeenAt. Without this, on a reconnect after the previous WS
    // connection dropped, lastSeenAt could be >45 s old and the snapshot
    // would exclude the local player entirely. (This is the path that
    // triggered the "respawn" symptom before the WorldScene fix.)
    // force: true — this is the first write of the connection, so skip
    // the Redis throttle gate.
    await refreshLastSeen(conn.playerId, undefined, { force: true });
    conn.lastPresenceAt = Date.now();
    await sendSnapshot(conn);
    // Tell nearby players we exist so their next snapshot includes us
    // (players are proximity-filtered).
    markWorldDirty(auth.x, auth.y);
  } catch (err) {
    console.error("[ws] initial snapshot failed:", err);
    ws.close(1011, "snapshot failed");
    return;
  }

  ws.on("message", (raw) => onMessage(conn, raw.toString()));
}

function onMessage(conn: Connection, raw: string): void {
  let msg: WsInbound;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.type === "act" && (msg.kind === "slash" || msg.kind === "chop" || msg.kind === "shoot")) {
    // Attack swing: relay to nearby players like movement. Throttled so a
    // client can't flood its neighbours.
    const now = Date.now();
    if (now - conn.lastActAt < ACT_MIN_INTERVAL_MS) return;
    conn.lastActAt = now;
    const out = JSON.stringify({ type: "playerAct", id: conn.playerId, kind: msg.kind, facing: normalizeFacing(msg.facing) });
    for (const other of connections.values()) {
      if (other === conn || other.ws.readyState !== other.ws.OPEN) continue;
      if (Math.hypot(other.homePx - conn.homePx, other.homePy - conn.homePy) > RELAY_RADIUS_PX) continue;
      try {
        other.ws.send(out);
      } catch {
        /* socket overflow — drop */
      }
    }
    return;
  }
  if (msg.type === "ping") {
    try {
      // Echo the client's send time with ours: the client derives its
      // clock offset from the lowest round-trip sample.
      conn.ws.send(JSON.stringify({ type: "pong", t: msg.t, serverTime: Date.now() }));
    } catch {
      /* socket overflow — drop */
    }
    return;
  }
if (msg.type === "roll") {
    onRoll(conn, Number(msg.t));
    return;
  }
  if (msg.type === "pos" && Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
    // Fast in-memory movement update. Never writes the DB for position —
    // presence (below) stays on its own slow cadence. Relay to nearby
    // players so they see movement within a frame or two. Only as far as
    // the speed limit allows.
    const facing = normalizeFacing(msg.facing);
    const at = acceptPosition(conn, msg.x!, msg.y!, msg.mounted === true);
    const { cx, cy } = chunkAtWorldPx(at.x, at.y);
    const changedChunk = cx !== conn.homeCx || cy !== conn.homeCy;
    conn.homePx = at.x;
    conn.homePy = at.y;
    conn.homeFacing = facing;
    if (changedChunk) {
      populateSoon({ cx: conn.homeCx, cy: conn.homeCy }, { cx, cy });
      conn.homeCx = cx;
      conn.homeCy = cy;
      // Crossing a chunk edge may move us into (or out of) another
      // player's proximity window; push a fresh snapshot so sprites are
      // created/removed promptly rather than waiting for the 5 s refresh.
      markWorldDirty(at.x, at.y);
    }
    relayPosition(conn, at.x, at.y, facing);
    return;
  }
if (msg.type === "heartbeat" && Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
    const facing = normalizeFacing(msg.facing);
    // Update home chunk so subsequent refreshes use the right bbox. Cheap;
    // happens every client heartbeat. Speed-checked like `pos`.
    const at = acceptPosition(conn, msg.x!, msg.y!, conn.mounted === true);
    const { cx, cy } = chunkAtWorldPx(at.x, at.y);
    conn.homePx = at.x;
    conn.homePy = at.y;
    conn.homeFacing = facing;
    if (cx !== conn.homeCx || cy !== conn.homeCy) {
      populateSoon({ cx: conn.homeCx, cy: conn.homeCy }, { cx, cy });
      conn.homeCx = cx;
      conn.homeCy = cy;
    }

    // Persist presence at most once per PRESENCE_WRITE_INTERVAL_MS. The
    // in-memory throttle means heartbeats cost no Redis command; only the
    // occasional actual write does (DB UPDATE + presence SET + ping SET).
    // `force: true` skips refreshLastSeen's own Redis EXISTS gate, which
    // would otherwise add a command per heartbeat.
    const now = Date.now();
    if (now - conn.lastPresenceAt >= PRESENCE_WRITE_INTERVAL_MS) {
      conn.lastPresenceAt = now;
      refreshLastSeen(conn.playerId, { x: at.x, y: at.y, facing }, { force: true }).catch((err) => {
        console.error(`[ws] refreshLastSeen failed for player ${conn.playerId}:`, err);
      });
    }
    return;
  }
  if (msg.type === "hello") {
    // Legacy handshake — sessionId is no longer required since the WS
    // upgrade itself authenticates via cookie. Acknowledged for forward
    // compatibility with future client variants.
    try {
      conn.ws.send(JSON.stringify({ type: "pong" }));
    } catch {
      /* socket overflow — drop */
    }
  }
}

// ── Delta coalescing + dispatch ────────────────────────────────────────

function onWorldChange(change: WorldChange): void {
  for (const conn of connections.values()) {
    // Proximity filter in chunk space. The snapshot bbox is
    // PROXIMITY_RADIUS_PX (default 1152 px) centered on the player;
    // 1152px = 3 chunk-widths on X and ~4.8 chunk-heights on Y. Using 5
    // chunks on both axes is a safe over-estimate so we never skip a
    // change the snapshot would have included.
    const dx = Math.abs(change.chunkX - conn.homeCx);
    const dy = Math.abs(change.chunkY - conn.homeCy);
    if (dx > 5 || dy > 5) continue;
    conn.pendingDeltas.add(`${change.chunkX},${change.chunkY}`);
    scheduleFlush(conn);
  }
}

function scheduleFlush(conn: Connection): void {
  if (conn.flushTimer) return;
  conn.flushTimer = setTimeout(() => flushDeltas(conn), DELTA_COALESCE_MS);
}

async function flushDeltas(conn: Connection): Promise<void> {
  conn.flushTimer = null;
  const had = conn.pendingDeltas.size > 0;
  conn.pendingDeltas.clear();
  if (!had) return;
  await sendSnapshot(conn);
}

// ── Bootstrap ──────────────────────────────────────────────────────────

// Beat broadcaster.
//
// NPC / animal / enemy motion is deterministic (src/lib/motion.ts): the
// sim worker decides each move on beat k and it starts on beat k+1. So
// instead of pushing positions, this process wakes BROADCAST_OFFSET_MS
// after every epoch-aligned beat boundary (the same boundaries the sim
// worker uses — no coordination needed), reads that beat's new moves
// with ONE query per mover table, and fans a small `moves` message out.
// Every client therefore holds each move ~4 s before it starts and
// starts it at the same server instant.
//
// Scaling properties:
//   - DB cost is 3 indexed lookups per beat per WS process, independent
//     of the number of connections.
//   - Each message is serialised once per spatial bucket, not once per
//     connection; every socket in the bucket gets the same string.
//   - Sends are skipped for sockets with a backed-up buffer (the next
//     beat / resync heals them) so one slow client never stalls others.
//
// Full snapshots remain the safety net: on connect, after mutations
// (markWorldDirty), and every WS_RESYNC_MS for everything else (chat,
// items, spawns). Upstash HTTP subscribe proved unreliable (see the
// pub/sub note below), so the per-beat read goes to Postgres.

// Connections are bucketed on a coarse pixel grid; a bucket's message
// carries every move within PROXIMITY_RADIUS_PX of any point in it, so
// it covers each member's own proximity window.
const BUCKET_PX = 512;
// Skip (rather than queue) a beat message when this much is still
// buffered for the socket.
const SKIP_BUFFERED_BYTES = Number(process.env.WS_SKIP_BUFFERED_BYTES ?? 64 * 1024);
const RESYNC_EVERY_BEATS = Math.max(1, Math.round(WS_RESYNC_MS / WORLD_TICK_MS));
const RESYNC_CONCURRENCY = 32;

let periodicStarted = false;
let periodicTimer: NodeJS.Timeout | null = null;

export function startPeriodicRefresh(): void {
  if (periodicStarted) return;
  periodicStarted = true;
  startCombatClock();
  log.info({ beatMs: WORLD_TICK_MS, offsetMs: BROADCAST_OFFSET_MS, resyncMs: WS_RESYNC_MS }, "beat broadcaster armed");
  scheduleNextBroadcast();
}

export function stopPeriodicRefresh(): void {
  stopCombatClock();
  if (periodicTimer) clearTimeout(periodicTimer);
  periodicTimer = null;
  periodicStarted = false;
}

function scheduleNextBroadcast(): void {
  if (!periodicStarted) return;
  // Fire at the next boundary + offset that is still in the future.
  const now = Date.now();
  let at = nextBeatAt(now - BROADCAST_OFFSET_MS) + BROADCAST_OFFSET_MS;
  if (at <= now) at += WORLD_TICK_MS;
  periodicTimer = setTimeout(() => {
    void onBeat(at - BROADCAST_OFFSET_MS).finally(scheduleNextBroadcast);
  }, at - now);
}

async function onBeat(boundary: number): Promise<void> {
  // Moves decided on this beat start on the next one. (A late tick
  // schedules for the beat after; that beat's broadcast carries it.)
  const startAt = boundary + WORLD_TICK_MS;
  // Drop cached snapshots so anything built from now on includes them.
  invalidateSnapshots();
  try {
    await treeBeat();
  } catch (err) {
    log.error({ err }, "tree sync failed");
  }
  if (connections.size === 0) {
    // Nobody to tell: whoever connects next gets them in their snapshot.
    spawnScan.cursor = new Date();
    spawnScan.atCursor = new Set();
    return;
  }
  try {
    await scanSpawns(Date.now());
  } catch (err) {
    log.error({ err }, "spawn scan failed");
  }
  try {
    // Hunters (wolves) replace their wander with a chase before the
    // beat's moves go out, so the broadcast below already carries it.
    await enemyHunts(startAt);
  } catch (err) {
    log.error({ err }, "enemy hunts failed");
  }
  try {
    const moves = await fetchMovesStartingAt(startAt);
    if (moves.length > 0) broadcastMoves(startAt, moves);
  } catch (err) {
    log.error({ err }, "beat move broadcast failed");
  }
  if (beatIndex(boundary) % RESYNC_EVERY_BEATS === 0) await resyncAll();
}

/**
 * Felled trees: keep any due to grow back where a player stands felled a
 * little longer, then pick up fells / regrowths (from any process) and tell
 * clients which chunks to re-read.
 */
async function treeBeat(): Promise<void> {
  const players = [...connections.values()];
  await postponeRegrowth((vx, vy) => {
    const t = trunkPoint(vx, vy);
    return players.some((c) => Math.abs(c.homePx - t.x) < 28 && c.homePy > t.y - 40 && c.homePy < t.y + 24);
  }, WORLD_TICK_MS * 2);
  const chunks = await syncFelledTrees();
  if (chunks.length > 0) broadcastChunkReload(chunks);
}

/** Tell every client to re-read these chunks (trees felled / regrown). */
export function broadcastChunkReload(chunks: ChunkRef[]): void {
  const msg = JSON.stringify({ type: "chunkReload", chunks });
  for (const c of connections.values()) {
    if (c.ws.readyState !== c.ws.OPEN) continue;
    try { c.ws.send(msg); } catch { /* socket closed */ }
  }
}

const HUNTER_KINDS = Object.entries(ENEMY_KINDS).filter(([, k]) => k.hunts).map(([key]) => key);

/**
 * Hunting enemies run at connected players who come close. Runs here, not
 * in tickd, because only this process knows every player's live position.
 */
async function enemyHunts(startAt: number): Promise<void> {
  const players = [...connections.values()].filter((c) => c.ws.readyState === c.ws.OPEN).map((c) => ({ x: c.homePx, y: c.homePy }));
  if (players.length === 0 || HUNTER_KINDS.length === 0) return;
  const rows = await db.select().from(enemies).where(inArray(enemies.kind, HUNTER_KINDS));
  const writes = [];
  const now = Date.now();
  for (const e of rows) {
    if (!seenLongEnough(e, now)) continue; // not on screen yet: no chase
    // Zone hunters keep to their zone; wild ones to ~10 tiles of home.
    const box = enemyZoneAt(e.x, e.y)?.rect
      ?? (e.wild && e.targetX != null && e.targetY != null ? { x: e.targetX - 160, y: e.targetY - 160, w: 320, h: 320 } : null);
    if (!box) continue;
    const w = await planHunt(e, players, box, startAt, isWalkableServer);
    if (w) writes.push(w);
  }
  await writeMoves("enemy", writes);
}

// ── Fights (src/lib/combat): telegraphed attacks and dodging ────────────
/** How often the combat clock looks for attacks to start. */
const COMBAT_TICK_MS = 200;
/** An aggressive enemy fights players within this distance. */
const ENGAGE_PX = 8 * 16;
/** Aggressive enemies are re-read this often (kills happen in the API routes). */
const COMBAT_ROWS_MS = 1000;
/** The kinds that fight (only their rows are read each second). */
const AGGRESSIVE_KINDS = Object.keys(ENEMY_KINDS).filter((k) => isAggressive(k));
/** No attack shape reaches further than this from its origin (the boss's sweep). */
const STRIKE_REACH_PX = 140;
/** A staggered enemy can't attack again for this long. */
const STAGGER_MS = 900;
/** Poison: this many ticks of damage, this far apart. */
const POISON_TICKS = 3, POISON_EVERY_MS = 1000;

const openPlayers = () => [...connections.values()].filter((c) => c.ws.readyState === c.ws.OPEN);
function sendNear(x: number, y: number, msg: string): void {
  for (const c of connections.values()) {
    if (c.ws.readyState !== c.ws.OPEN || Math.hypot(c.homePx - x, c.homePy - y) > RELAY_RADIUS_PX) continue;
    try { c.ws.send(msg); } catch { /* socket closed */ }
  }
}

function startCombatClock(): void {
  if (combat.timer) return;
  combat.timer = setInterval(() => { void combatTick().catch((err) => log.error({ err }, "combat tick failed")); }, COMBAT_TICK_MS);
}
function stopCombatClock(): void {
  if (combat.timer) clearInterval(combat.timer);
  combat.timer = null;
}

/** A lunge or charge: up to `tiles` along `dir`, stopping at walls. */
async function dashMove(from: { x: number; y: number }, dir: Facing, tiles: number, startAt: number): Promise<Move | null> {
  const start = tileOf(from.x, from.y);
  const [dx, dy] = dirVec(dir);
  let end = start;
  for (let k = 1; k <= tiles; k++) {
    const t = { tx: start.tx + dx * k, ty: start.ty + dy * k };
    const c = tileCenter(t);
    if (!(await isWalkableServer(c.x, c.y))) break;
    end = t;
  }
  return end.tx === start.tx && end.ty === start.ty ? null : { path: [start, end], startAt, speed: DASH_SPEED };
}

// ── New enemies ──────────────────────────────────────────────────────────
// Wild packs and encounters are inserted by tickd. Once a second the WS
// server reads just the rows newer than its cursor (indexed, usually none)
// and sends them — a few hundred bytes — to the players near them, instead
// of waiting for the 30 s resync. One query a second whatever the number of
// players; no snapshot is rebuilt.
/** A new enemy neither attacks nor chases for this long after it was sent,
 *  so it's on screen before it acts. */
const SPAWN_GRACE_MS = 1200;
const spawnScan = {
  at: 0,
  /** Everything spawned up to here has been sent (or came with a snapshot). */
  cursor: new Date(),
  /** Ids already read at exactly `cursor` (a beat's spawns share a timestamp). */
  atCursor: new Set<number>(),
  /** When each recent spawn was sent; pruned after a minute. */
  announced: new Map<number, number>(),
};

/** Once a beat: enemies tickd created (encounters, zone respawns) since the
 *  last look. Packs this server placed itself were sent when written. */
async function scanSpawns(now: number): Promise<void> {
  spawnScan.at = now;
  const rows = (await db.select().from(enemies).where(gte(enemies.spawnedAt, spawnScan.cursor)).orderBy(asc(enemies.spawnedAt)).limit(500))
    .filter((e) => !spawnScan.atCursor.has(e.id));
  for (const [id, at] of spawnScan.announced) if (now - at > 60_000) spawnScan.announced.delete(id);
  if (!rows.length) return;
  const last = rows[rows.length - 1].spawnedAt;
  if (last.getTime() !== spawnScan.cursor.getTime()) spawnScan.atCursor = new Set();
  for (const e of rows) if (e.spawnedAt.getTime() === last.getTime()) spawnScan.atCursor.add(e.id);
  spawnScan.cursor = last;
  const fresh = rows.filter((e) => !spawnScan.announced.has(e.id));
  for (const e of fresh) spawnScan.announced.set(e.id, now);
  announce(fresh, now);
}

/** Send new enemies to the players near them (one payload per area). */
function announce(rows: readonly (typeof enemies.$inferSelect)[], now: number): void {
  if (!rows.length) return;
  const peers = [];
  for (const conn of connections.values()) {
    if (conn.ws.readyState !== conn.ws.OPEN) continue;
    peers.push({ x: conn.homePx, y: conn.homePy, backedUp: isBackedUp(conn), conn });
  }
  // Fanned out by where each one stands now; sent as clients store them
  // (x/y is the move's destination, the client follows the move).
  const items = rows.map((e) => ({ ...rowPositionAt(e, now), snap: enemySnapshotOf(e) }));
  for (const bucket of planPointFanout(peers, items, BUCKET_PX, PROXIMITY_RADIUS_PX)) {
    const msg = JSON.stringify({ type: "spawns", enemies: bucket.items.map((i) => i.snap) });
    for (const { conn } of bucket.peers) {
      try { conn.ws.send(msg); } catch { /* the next resync heals it */ }
    }
  }
}

// ── The land ahead ───────────────────────────────────────────────────────
// As a player crosses into a new chunk, the chunks 3 out in the direction
// they're heading get their packs (src/lib/wildPopulation.ts), so enemies
// are already standing there when they arrive. Claimed in wild_chunks so a
// chunk is filled once for everyone (across processes) per REPOPULATE_MS.
// Standing still costs nothing.
const clock = { at: 0, epochStart: 0, dayLengthMinutes: 24 };
async function isNightNow(now: number): Promise<boolean> {
  if (now - clock.at > 10 * 60_000) {
    const [w] = await db.select({ epochStart: worldState.epochStart, dayLengthMinutes: worldState.dayLengthMinutes }).from(worldState).where(eq(worldState.id, 1));
    if (w) Object.assign(clock, { at: now, epochStart: w.epochStart.getTime(), dayLengthMinutes: w.dayLengthMinutes });
  }
  const hour = gameHour(clock.epochStart, clock.dayLengthMinutes, now);
  return hour < 6 || hour >= 21;
}

/** A chunk that could hold wild enemies at all (not the heartland, not sea). */
function wildChunk(c: ChunkXY): boolean {
  const tx = c.cx * CHUNK_TILE_W + 12, ty = -c.cy * CHUNK_TILE_H + 7;
  return !inHeartland(tx, ty) && biomeAt(tx, ty) !== "ocean";
}

/** How many wild enemies the world holds (read at most once a minute, only while populating). */
const wildCount = { at: 0, n: 0 };

async function populateAhead(from: ChunkXY | null, to: ChunkXY): Promise<void> {
  const want = chunksAhead(from, to).filter(wildChunk);
  if (!want.length) return;
  const now = Date.now(), at = new Date(now);
  if (now - wildCount.at > 60_000) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(enemies).where(eq(enemies.wild, true));
    Object.assign(wildCount, { at: now, n: r?.n ?? 0 });
  }
  if (wildCount.n >= WILD_MAX_TOTAL) return; // the world is full
  const claimed = await db.insert(wildChunks).values(want.map((c) => ({ ...c, populatedAt: at })))
    .onConflictDoUpdate({ target: [wildChunks.cx, wildChunks.cy], set: { populatedAt: at }, setWhere: lt(wildChunks.populatedAt, new Date(now - REPOPULATE_MS)) })
    .returning({ cx: wildChunks.cx, cy: wildChunks.cy });
  if (!claimed.length) return;
  const night = await isNightNow(now);
  const players = openPlayers();
  const rows: (typeof enemies.$inferInsert)[] = [];
  for (const c of claimed) {
    const crowd = players.filter((p) => Math.max(Math.abs(p.homeCx - c.cx), Math.abs(p.homeCy - c.cy)) <= CROWD_CHUNKS);
    const pack = await packFor(c, now, night, Math.max(1, crowd.length), crowd.map((p) => ({ x: p.homePx, y: p.homePy })), isWalkableServer);
    for (const m of pack) {
      const hp = enemyHpAt(m.kind, tierAt(Math.floor(m.x / 16), Math.floor(m.y / 16)));
      rows.push({ kind: m.kind, x: m.x, y: m.y, targetX: m.x, targetY: m.y, hp, maxHp: hp, spawnedAt: at, wild: true, nearAt: at });
    }
  }
  if (!rows.length) return;
  const made = await db.insert(enemies).values(rows).returning();
  wildCount.n += made.length;
  for (const e of made) spawnScan.announced.set(e.id, now);
  announce(made, now);
}
function populateSoon(from: ChunkXY | null, to: ChunkXY): void {
  void populateAhead(from, to).catch((err) => log.error({ err }, "populate ahead failed"));
}

/** Has this enemy been on players' screens long enough to act? */
function seenLongEnough(e: { id: number; spawnedAt: Date }, now: number): boolean {
  if (e.spawnedAt.getTime() > spawnScan.cursor.getTime() || (e.spawnedAt.getTime() === spawnScan.cursor.getTime() && !spawnScan.atCursor.has(e.id))) return false; // not sent yet
  const sent = spawnScan.announced.get(e.id);
  return sent === undefined || now - sent >= SPAWN_GRACE_MS;
}

/**
 * The combat clock: aggressive enemies near players pick an attack they can
 * reach, telegraph it to everyone nearby at once, and it lands at `hitAt`.
 * Only engaged enemies cost anything.
 */
async function combatTick(): Promise<void> {
  const players = openPlayers();
  const now = Date.now();
  if (!players.length) return;
  if (now - combat.rowsAt > COMBAT_ROWS_MS) {
    combat.rows = await db.select().from(enemies).where(inArray(enemies.kind, AGGRESSIVE_KINDS));
    combat.rowsAt = now;
  }
  // Players bucketed by area: each enemy only looks at the cells around it.
  const grid = buildGrid(players, (c) => ({ x: c.homePx, y: c.homePy }), ENGAGE_PX);
  await chipStrikes(grid, now);
  const planned: Strike[] = [];
  const dashes: MoveWrite[] = [];
  for (const e of combat.rows) {
    if ((combat.busyUntil.get(e.id) ?? 0) > now) continue;
    if (!seenLongEnough(e, now)) continue; // not on screen yet
    const at = rowPositionAt(e, now);
    const near = nearby(grid, at.x, at.y, ENGAGE_PX).map((c) => ({ c, d: Math.hypot(c.homePx - at.x, c.homePy - at.y) })).filter((x) => x.d <= ENGAGE_PX).sort((a, b) => a.d - b.d);
    if (!near.length) continue;
    const moves = usableMoves(e.kind, near[0].d);
    if (!moves.length) continue;
    const move = moves[Math.floor(Math.random() * moves.length)];
    const def = enemyKind(e.kind);
    const scale = speedScale(def.tier === "boss" ? 3 : def.tier, e.elite);
    // Danger grows with the land (tierAt): the same wolf bites harder far out.
    const baseDmg = enemyDmgAt(e.kind, tierAt(Math.floor(at.x / 16), Math.floor(at.y / 16))) * (e.elite ? WANTED_DMG_MULT : 1);
    // Spikes and bolts aimed at a spot hit every engaged player in reach (the boss's root spikes); others pick the nearest.
    const targets = move.atTarget && !move.projectile ? near.filter((x) => x.d <= move.trigger) : [near[0]];
    let last = now;
    for (const { c } of targets) {
      const s = planStrike({ id: ++combat.nextId, enemyId: e.id, kind: e.kind, move, at, target: { x: c.homePx, y: c.homePy }, now, baseDmg, scale });
      if (move.dash) {
        const m = await dashMove(at, s.dir, move.dash, s.releaseAt);
        if (m) {
          s.dash = m;
          const w = buildMoveWrite(e.id, m.path, m.startAt, m.speed);
          dashes.push(w);
          Object.assign(e, { x: w.x, y: w.y, movePath: m.path, moveStartAt: m.startAt, moveSpeed: m.speed, moveAfter: null });
        }
      }
      combat.strikes.set(s.id, { ...s, timer: setTimeout(() => { void resolveStrike(s.id).catch((err) => log.error({ err }, "strike failed")); }, Math.max(0, s.hitAt - Date.now())) });
      planned.push(s);
      last = Math.max(last, s.hitAt);
    }
    combat.busyUntil.set(e.id, last + Math.round(move.cooldownMs * scale));
  }
  if (dashes.length) await writeMoves("enemy", dashes);
  for (const s of planned) sendNear(s.origin.x, s.origin.y, JSON.stringify({ type: "strikes", strikes: [s] }));
}

/**
 * While an attack winds up, anyone standing in it takes a little damage every
 * CHIP_EVERY_MS — waiting it out isn't free. Bolts don't chip (nothing has
 * hit you until the bolt arrives); a roll avoids it like the real hit.
 */
async function chipStrikes(grid: SpatialGrid<Connection>, now: number): Promise<void> {
  for (const s of combat.strikes.values()) {
    if (s.from || now >= s.releaseAt || now - (s.chipAt ?? s.windupAt) < CHIP_EVERY_MS) continue;
    s.chipAt = now;
    const row = combat.rows.find((r) => r.id === s.enemyId);
    if (!row) continue;
    const name = row.title ?? enemyKind(row.kind).name;
    for (const c of nearby(grid, s.origin.x, s.origin.y, STRIKE_REACH_PX)) {
      if (!inShape(s.shape, s.origin, s.dir, { x: c.homePx, y: c.homePy }) || dodged(combat.rolls.get(c.playerId) ?? [], now)) continue;
      await hurtPlayer(c, chipDamage(s.dmg), name, s.origin);
    }
  }
}

/** An attack lands: everyone in its shape who isn't mid-roll is hit. */
async function resolveStrike(id: number): Promise<void> {
  const s = combat.strikes.get(id);
  if (!s) return; // interrupted
  combat.strikes.delete(id);
  const [e] = await db.select({ id: enemies.id, kind: enemies.kind, title: enemies.title }).from(enemies).where(eq(enemies.id, s.enemyId));
  if (!e) return; // it died first
  const name = e.title ?? enemyKind(e.kind).name;
  const hit = openPlayers().filter((c) => inShape(s.shape, s.origin, s.dir, { x: c.homePx, y: c.homePy }) && !dodged(combat.rolls.get(c.playerId) ?? [], s.hitAt));
  const from = s.from ?? s.origin;
  sendNear(s.origin.x, s.origin.y, JSON.stringify({ type: "enemyAct", id: s.enemyId, x: s.origin.x, y: s.origin.y }));
  if (!hit.length) return;
  const perks = await perksOfMany(hit.map((c) => c.playerId));
  for (const conn of hit) {
    const amount = Math.max(1, s.dmg - (perks.get(conn.playerId)?.has("tough") ? 1 : 0));
    await hurtPlayer(conn, amount, name, from, s.status);
    if (s.status?.kind === "poison") {
      for (let k = 1; k <= POISON_TICKS; k++) setTimeout(() => { void hurtPlayer(conn, 1, `${name}'s poison`, from).catch(() => {}); }, k * POISON_EVERY_MS);
    }
  }
}

/** Damage a connected player and tell them (or knock them out). */
async function hurtPlayer(conn: Connection, amount: number, by: string, from: { x: number; y: number }, status?: StatusEffect): Promise<void> {
  if (conn.ws.readyState !== conn.ws.OPEN) return;
  const r = await damagePlayer(conn.playerId, amount);
  if (!r) return;
  try {
    if (r.knockedOut) {
      placePlayer(conn.playerId, r.x!, r.y!);
      conn.ws.send(JSON.stringify({ type: "knockout", x: r.x, y: r.y, coinsLost: r.coinsLost, hp: r.hp, by }));
      return;
    }
    conn.ws.send(JSON.stringify({ type: "hurt", amount, hp: r.hp, maxHp: r.maxHp, by, from, ...(status ? { status } : {}) }));
  } catch {
    /* socket closed */
  }
}

/**
 * A player hit this enemy while it was winding up: the attack is broken off
 * and the enemy reels for a moment. Returns true when that happened (the
 * hit counts as a stagger). Called from the attack API (same process).
 */
export function interruptStrike(enemyId: number): boolean {
  const now = Date.now();
  let hit = false;
  for (const [id, s] of combat.strikes) {
    if (s.enemyId !== enemyId || now >= s.releaseAt) continue;
    if (s.timer) clearTimeout(s.timer);
    combat.strikes.delete(id);
    sendNear(s.origin.x, s.origin.y, JSON.stringify({ type: "strikeCancel", id }));
    hit = true;
    if (s.dash) {
      // Called off: it stays where it stood.
      const stay = buildMoveWrite(enemyId, [s.dash.path[0], s.dash.path[0]], now, DASH_SPEED);
      void writeMoves("enemy", [stay]).catch(() => {});
      const row = combat.rows.find((r) => r.id === enemyId);
      if (row) Object.assign(row, { x: stay.x, y: stay.y, movePath: stay.move.path, moveStartAt: now, moveSpeed: DASH_SPEED, moveAfter: null });
    }
  }
  if (hit) combat.busyUntil.set(enemyId, now + STAGGER_MS);
  return hit;
}

/** A dodge roll: its window makes attacks miss — unless it came too soon after the last. */
function onRoll(conn: Connection, t: number): void {
  const now = Date.now();
  const at = Number.isFinite(t) && t >= now - ROLL_LATE_MS && t <= now + 50 ? t : now;
  const past = combat.rolls.get(conn.playerId) ?? [];
  if (!canRoll(past.at(-1), at)) return;
  combat.rolls.set(conn.playerId, [...past.filter((r) => r > now - 2000), at]);
  // The dash covers ground fast: let the speed limit allow it.
  const g = guards.get(conn.playerId);
  if (g) g.budget += ROLL_PX + 8;
}

function isBackedUp(conn: Connection): boolean {
  const buffered = (conn.ws as unknown as { bufferedAmount?: number }).bufferedAmount ?? 0;
  return buffered > SKIP_BUFFERED_BYTES;
}

/** Fan one beat's moves out, serialising once per spatial bucket. */
function broadcastMoves(startAt: number, moves: ScheduledMove[]): void {
  const peers = [];
  for (const conn of connections.values()) {
    if (conn.ws.readyState !== conn.ws.OPEN) continue;
    peers.push({ x: conn.homePx, y: conn.homePy, backedUp: isBackedUp(conn), conn });
  }
  const serverTime = Date.now();
  for (const bucket of planMoveFanout(peers, moves, BUCKET_PX, PROXIMITY_RADIUS_PX)) {
    const msg = JSON.stringify({ type: "moves", serverTime, startAt, moves: bucket.moves });
    for (const { conn } of bucket.peers) {
      try {
        conn.ws.send(msg);
      } catch {
        /* socket overflow — the next beat / resync heals it */
      }
    }
  }
}

/** Safety resync: a full snapshot to every healthy connection, bounded concurrency. */
async function resyncAll(): Promise<void> {
  const queue = [...connections.values()].filter((c) => !isBackedUp(c));
  const worker = async (): Promise<void> => {
    for (let conn = queue.shift(); conn; conn = queue.shift()) await sendSnapshot(conn);
  };
  await Promise.all(Array.from({ length: Math.min(RESYNC_CONCURRENCY, queue.length) }, worker));
}

// Pub/sub bridge. DISABLED by default.
//
// Nothing publishes `world_changes` any more (the sim stopped emitting
// per-entity events), and the Upstash HTTP subscriber does not reliably
// deliver messages. Starting it therefore costs Redis commands for no
// updates. The WS server pushes fresh snapshots on its own schedule
// instead. Set ENABLE_REDIS_PUBSUB=1 to turn it on for future use.
//
// subscribePubSub returns an "unsubscribe" thunk. The Upstash variant
// returns a Promise of a void-returning function; the memory variant
// returns a sync void-returning function. We coalesce both into a
// single callable.
const PUBSUB_ENABLED = process.env.ENABLE_REDIS_PUBSUB === "1";

let pubSubStarted = false;
let pubSubUnsub: () => Promise<void> | void = () => {};

export async function startPubSubBridge(): Promise<void> {
  if (!PUBSUB_ENABLED) return;
  if (pubSubStarted) return;
  pubSubStarted = true;
  pubSubUnsub = await subscribePubSub(WORLD_CHANGE_CHANNEL, (_channel, message) => {
    let change: WorldChange;
    try {
      change = JSON.parse(message);
    } catch {
      return;
    }
    onWorldChange(change);
  });
  if (typeof pubSubUnsub !== "function") {
    // Defensive: subscribePubSub returned something unexpected (e.g. the
    // Upstash Subscriber object). Fall back to a no-op so stopPubSubBridge
    // never crashes on shutdown.
    pubSubUnsub = () => {};
  }
}

export async function stopPubSubBridge(): Promise<void> {
  if (!pubSubStarted) return;
  pubSubStarted = false;
  try {
    await pubSubUnsub();
  } catch {
    // Best-effort; the underlying connection may already be gone.
  }
  pubSubUnsub = () => {};
}

/**
 * Attach the WebSocket handler to an existing HTTP server (the same
 * one Next.js runs on). Path matching: only requests to `WS_PATH` are
 * upgraded; everything else falls through to the provided fallback
 * handler (typically Next.js's HMR upgrade handler).
 *
 * Browser same-origin rules require WS and HTTP to share scheme+host+
 * port, otherwise the browser silently drops the session cookie on the
 * upgrade and the WS server sees no auth.
 */
export function attachWsServer(
  httpServer: http.Server,
  fallback: (req: http.IncomingMessage, socket: Duplex, head: Buffer) => void = (req, socket) => {
    // Default fallback: destroy the socket so Node doesn't keep it open.
    // Callers (Next.js integration) should pass a real handler so HMR
    // and other internal WS endpoints continue to work.
    socket.destroy();
  },
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url) {
      socket.destroy();
      return;
    }
    const path = req.url.split("?")[0];
    if (path !== WS_PATH) {
      // Not for us — let the fallback handle it (e.g. Next.js HMR).
      fallback(req, socket, head);
      return;
    }
    // Refuse new upgrades during shutdown so the LB can drain.
    if (isDraining()) {
      try {
        socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
        socket.destroy();
        metrics.wsUpgradeRejectedTotal.inc({ reason: "draining" });
      } catch {
        /* ignore */
      }
      return;
    }
    // Reconnect-storm protection. Sliding-window per IP.
    const ip = (req.socket.remoteAddress ?? "unknown").split(",")[0].trim();
    const now = Date.now();
    const stamps = wsUpgradeTimestamps.get(ip) ?? [];
    const recent = stamps.filter((t) => now - t < WS_IP_WINDOW_MS);
    if (recent.length >= WS_MAX_UPGRADES_PER_IP) {
      try {
        socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
        socket.destroy();
        metrics.wsUpgradeRejectedTotal.inc({ reason: "rate_limit" });
      } catch {
        /* ignore */
      }
      return;
    }
    recent.push(now);
    wsUpgradeTimestamps.set(ip, recent);

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req) => {
    void onConnection(ws, req);
  });

  // Slow-client sweep. Every `SLOW_CLIENT_HOLD_MS` we sample every open
  // connection's underlying OS-level buffer (`ws.bufferedAmount`). When a
  // connection stays above the threshold for longer than the hold window
  // we close it with code 1008 and bump the eviction counter. Tracking the
  // OS buffer (rather than our own counter) avoids the false positives
  // that bit us in Phase 2.
  const slowSweep = setInterval(() => {
    if (connections.size === 0) return;
    const sweepAt = Date.now();
    for (const [playerId, conn] of connections) {
      try {
        const buffered = (conn.ws as unknown as { bufferedAmount?: number }).bufferedAmount ?? 0;
        if (buffered > SLOW_CLIENT_THRESHOLD_BYTES) {
          if (conn.slowSince === 0) conn.slowSince = sweepAt;
          if (sweepAt - conn.slowSince >= SLOW_CLIENT_HOLD_MS) {
            metrics.wsEvictionsTotal.inc({ reason: "slow" });
            log.warn({ playerId, buffered }, "closing slow WS client");
            try {
              conn.ws.close(1008, "slow consumer");
            } catch {
              /* ignore */
            }
          }
        } else {
          conn.slowSince = 0;
        }
      } catch {
        /* ignore — connection likely gone */
      }
    }
  }, Math.max(500, SLOW_CLIENT_HOLD_MS));
  // Stop the sweep on process exit so it doesn't keep Node alive.
  // attachWsServer may be called once per process; we tag the timer
  // and clear it via closeAllWs.
  (wss as unknown as { __slowSweep?: NodeJS.Timeout }).__slowSweep = slowSweep;

  return wss;
}

/** Send a graceful close to all WS clients. */
export function closeAllWs(wss: WebSocketServer): void {
  wss.clients.forEach((ws) => {
    try {
      ws.close(1001, "server shutting down");
    } catch {
      /* ignore */
    }
  });
  // Stop the slow-client sweep so it doesn't keep the event loop alive.
  const sweep = (wss as unknown as { __slowSweep?: NodeJS.Timeout }).__slowSweep;
  if (sweep) clearInterval(sweep);
}

/** Number of currently-open WS connections. Exposed via `wsConnectionCount()`
 *  for future operational tooling; no HTTP endpoint currently reads it. */
export function wsConnectionCount(): number {
  return connections.size;
}

// Re-export so callers that still want to boot this as a standalone
// process (e.g. for sharding in Phase 4) can. The custom server in
// `src/server.ts` is the preferred entry for the unified deployment.
export const PORT = Number(process.env.WS_PORT ?? 3001);