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
import { and, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { characters, enemies, sessions, users } from "@/db/schema";
import { chunkAtWorldPx } from "@/lib/chunkCollision";
import { getSnapshot, invalidateSnapshots, PROXIMITY_RADIUS_PX } from "@/lib/snapshot";
import { refreshLastSeen } from "@/lib/presence";
import { initRedis, subscribePubSub } from "@/lib/redis";
import { WORLD_CHANGE_CHANNEL } from "@/lib/sim";
import { metrics } from "@/lib/metrics";
import { log } from "@/lib/logger";
import { isDraining } from "@/lib/lifecycle";
import { localShardId } from "@/lib/shards";
import { BROADCAST_OFFSET_MS, WORLD_TICK_MS, WS_RESYNC_MS } from "@/lib/constants";
import { beatIndex, nextBeatAt, rowPositionAt } from "@/lib/motion";
import { ENEMY_KINDS, enemyHit, enemyKind, enemyZoneAt, isAggressive } from "@/lib/progression";
import { damagePlayer, perksOfMany } from "@/lib/combat";
import { planMoveFanout } from "@/lib/moveFanout";
import { fetchMovesStartingAt, writeMoves } from "@/lib/moveStore";
import { planHunt } from "@/lib/hunt";
import { postponeRegrowth, syncFelledTrees } from "@/lib/treesServer";
import { trunkPoint } from "@/lib/trees";
import type { ChunkRef } from "@/types/trees";
import { isWalkableServer } from "@/lib/chunkCollisionServer";
import type { WorldChange, WorldSnapshot, Facing, ScheduledMove } from "@/lib/protocol";
import type { Connection, WsSharedState } from "@/types/websocket";

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

function getSharedState(): WsSharedState {
  const g = globalThis as unknown as Record<string, WsSharedState | undefined>;
  let s = g[SHARED_STATE_KEY];
  if (!s) {
    s = { connections: new Map(), dirtyPoints: [], dirtyTimer: null };
    g[SHARED_STATE_KEY] = s;
  }
  return s;
}

const shared = getSharedState();
const connections = shared.connections;
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
  const msg = JSON.stringify({ type: "playerPos", id: from.playerId, x, y, facing });
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

  const { cx, cy } = chunkAtWorldPx(auth.x, auth.y);
  const conn: Connection = {
    ws,
    playerId: auth.playerId,
    homeCx: cx,
    homeCy: cy,
    homePx: auth.x,
    homePy: auth.y,
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
  let msg: { type?: string; x?: number; y?: number; facing?: string; sessionId?: string; t?: number; kind?: string };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.type === "act" && (msg.kind === "slash" || msg.kind === "chop")) {
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
if (msg.type === "pos" && typeof msg.x === "number" && typeof msg.y === "number") {
    // Fast in-memory movement update. Never writes the DB for position —
    // presence (below) stays on its own slow cadence. Relay to nearby
    // players so they see movement within a frame or two.
    const facing = normalizeFacing(msg.facing);
    const { cx, cy } = chunkAtWorldPx(msg.x, msg.y);
    const changedChunk = cx !== conn.homeCx || cy !== conn.homeCy;
    conn.homePx = msg.x;
    conn.homePy = msg.y;
    conn.homeFacing = facing;
    if (changedChunk) {
      conn.homeCx = cx;
      conn.homeCy = cy;
      // Crossing a chunk edge may move us into (or out of) another
      // player's proximity window; push a fresh snapshot so sprites are
      // created/removed promptly rather than waiting for the 5 s refresh.
      markWorldDirty(msg.x, msg.y);
    }
    relayPosition(conn, msg.x, msg.y, facing);
    return;
  }
if (msg.type === "heartbeat" && typeof msg.x === "number" && typeof msg.y === "number") {
    const facing = normalizeFacing(msg.facing);
    // Update home chunk so subsequent refreshes use the right bbox. Cheap;
    // happens every client heartbeat.
    const { cx, cy } = chunkAtWorldPx(msg.x, msg.y);
    conn.homePx = msg.x;
    conn.homePy = msg.y;
    conn.homeFacing = facing;
    if (cx !== conn.homeCx || cy !== conn.homeCy) {
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
      refreshLastSeen(conn.playerId, { x: msg.x, y: msg.y, facing }, { force: true }).catch((err) => {
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
  log.info({ beatMs: WORLD_TICK_MS, offsetMs: BROADCAST_OFFSET_MS, resyncMs: WS_RESYNC_MS }, "beat broadcaster armed");
  scheduleNextBroadcast();
}

export function stopPeriodicRefresh(): void {
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
  if (connections.size === 0) return;
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
  try {
    await enemyAggression();
  } catch (err) {
    log.error({ err }, "enemy aggression failed");
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
  for (const e of rows) {
    // Zone hunters keep to their zone; wild ones to ~10 tiles of home.
    const box = enemyZoneAt(e.x, e.y)?.rect
      ?? (e.wild && e.targetX != null && e.targetY != null ? { x: e.targetX - 160, y: e.targetY - 160, w: 320, h: 320 } : null);
    if (!box) continue;
    const w = await planHunt(e, players, box, startAt, isWalkableServer);
    if (w) writes.push(w);
  }
  await writeMoves("enemy", writes);
}

/** How close an aggressive enemy must be to hit a player (players attack
 *  from 80 px, so standing in reach to fight means getting hit back). */
const ENEMY_REACH_PX = 72;
/** The world boss's area attack reaches further. */
const BOSS_REACH_PX = 110;

/**
 * Aggressive enemies (tier 2+, the world boss) hit connected players who
 * stand next to them, once per beat. Runs here because this process knows
 * every player's live position; enemy positions come from their moves.
 */
async function enemyAggression(): Promise<void> {
  const players = [...connections.values()].filter((c) => c.ws.readyState === c.ws.OPEN);
  if (players.length === 0) return;
  const rows = (await db.select().from(enemies)).filter((e) => isAggressive(e.kind));
  if (rows.length === 0) return;
  const now = Date.now();
  const live = rows.map((e) => ({ e, p: rowPositionAt(e, now), reach: enemyKind(e.kind).tier === "boss" ? BOSS_REACH_PX : ENEMY_REACH_PX }));
  const hits: { conn: Connection; kind: string; name: string }[] = [];
  const struck = new Map<number, { x: number; y: number; ex: number; ey: number }>(); // enemy id → its victim
  for (const conn of players) {
    for (const { e, p, reach } of live) {
      if (Math.hypot(p.x - conn.homePx, p.y - conn.homePy) > reach) continue;
      hits.push({ conn, kind: e.kind, name: enemyKind(e.kind).name });
      if (!struck.has(e.id)) struck.set(e.id, { x: conn.homePx, y: conn.homePy, ex: p.x, ey: p.y });
    }
  }
  if (hits.length === 0) return;
  // Everyone nearby sees the enemy strike (bite / lunge animation).
  for (const [id, s] of struck) {
    const msg = JSON.stringify({ type: "enemyAct", id, x: s.x, y: s.y });
    for (const conn of players) {
      if (Math.hypot(conn.homePx - s.ex, conn.homePy - s.ey) > RELAY_RADIUS_PX) continue;
      try { conn.ws.send(msg); } catch { /* socket closed */ }
    }
  }
  const perks = await perksOfMany([...new Set(hits.map((h) => h.conn.playerId))]);
  const knockedOut = new Set<number>();
  for (const { conn, kind, name } of hits) {
    if (knockedOut.has(conn.playerId)) continue; // already out of the fight this beat
    const amount = enemyHit(kind, perks.get(conn.playerId)?.has("tough") ?? false);
    const r = await damagePlayer(conn.playerId, amount);
    if (!r) continue;
    try {
      if (r.knockedOut) {
        conn.homePx = r.x!;
        conn.homePy = r.y!;
        knockedOut.add(conn.playerId);
        conn.ws.send(JSON.stringify({ type: "knockout", x: r.x, y: r.y, coinsLost: r.coinsLost, hp: r.hp, by: name }));
        continue;
      }
      conn.ws.send(JSON.stringify({ type: "hurt", amount, hp: r.hp, maxHp: r.maxHp, by: name }));
    } catch {
      /* socket closed */
    }
  }
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