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
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { characters, sessions, users } from "@/db/schema";
import { chunkAtWorldPx } from "@/lib/chunkCollision";
import { getSnapshot } from "@/lib/snapshot";
import { refreshLastSeen } from "@/lib/presence";
import { initRedis, subscribePubSub } from "@/lib/redis";
import { WORLD_CHANGE_CHANNEL } from "@/lib/sim";
import { metrics } from "@/lib/metrics";
import { log } from "@/lib/logger";
import { isDraining, setDraining } from "@/lib/lifecycle";
import { localShardId } from "@/lib/shards";
import type { WorldChange } from "@/lib/protocol";
import type { Connection } from "@/types/websocket";

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

const connections = new Map<number, Connection>();
const SHARD_ID = localShardId();

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
    lastPresenceAt: 0,
    lastVersion: 0,
    pendingDeltas: new Set(),
    flushTimer: null,
    slowSince: 0,
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
    const snap = await getSnapshot(conn.playerId, auth.x, auth.y);
    conn.lastVersion = snap.version;
    try {
      ws.send(JSON.stringify({ type: "snapshot", data: snap }));
    } catch {
      // Socket buffer overflow or other transient send error. Drop
      // this frame; the next periodic refresh will catch up.
    }
  } catch (err) {
    console.error("[ws] initial snapshot failed:", err);
    ws.close(1011, "snapshot failed");
    return;
  }

  ws.on("message", (raw) => onMessage(conn, raw.toString()));
}

function onMessage(conn: Connection, raw: string): void {
  let msg: { type?: string; x?: number; y?: number; facing?: string; sessionId?: string };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.type === "ping") {
    try {
      conn.ws.send(JSON.stringify({ type: "pong" }));
    } catch {
      /* socket overflow — drop */
    }
    return;
  }
if (msg.type === "heartbeat" && typeof msg.x === "number" && typeof msg.y === "number") {
    const facing = ["up","down","left","right"].includes(msg.facing ?? "") ? msg.facing! : "down";
    // Update home chunk so subsequent refreshes use the right bbox. Cheap;
    // happens every client heartbeat.
    const { cx, cy } = chunkAtWorldPx(msg.x, msg.y);
    conn.homePx = msg.x;
    conn.homePy = msg.y;
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
  const chunks = Array.from(conn.pendingDeltas);
  conn.pendingDeltas.clear();
  if (chunks.length === 0) return;
  if (conn.ws.readyState !== conn.ws.OPEN) return;

  // Phase 2 minimum viable: when a relevant entity changes, fetch a fresh
  // full snapshot for this connection and push it. The bbox is centered
  // on conn.homePx/homePy, which the heartbeat handler keeps fresh
  // (default 1.5s). A pixel-centered bbox means small position staleness
  // only nudges the bbox rather than snapping it by a whole chunk.
  try {
    const snap = await getSnapshot(conn.playerId, conn.homePx, conn.homePy);
    conn.lastVersion = snap.version;
    try {
      conn.ws.send(JSON.stringify({ type: "snapshot", data: snap }));
    } catch {
      /* socket overflow — drop frame, next refresh will catch up */
    }
  } catch {
    /* ignore — DB hiccup */
  }
  void chunks; // Suppress unused warning — chunk list informs future logic.
}

// ── Bootstrap ──────────────────────────────────────────────────────────

// Periodic full-snapshot refresh per connection.
//
// We rely solely on the periodic refresh for client updates — no pub/sub.
// Reasons:
//
//   - Upstash HTTP subscribe is unreliable in this SDK version (the
//     AbortController streaming fetch often aborts silently, leaving
//     the WS process disconnected from world_change events).
//   - Per-entity change publishes would burn ~40 Redis commands/sec of
//     sim time even when coalesced — too expensive at any meaningful
//     player count.
//   - 60 s periodic refresh × 3 Redis ops per snapshot = 3 ops/min per
//     connection. At 1000 connections that's 3000 ops/min, dominated
//     by per-connection overhead rather than Redis.
//
// The trade-off is up to 60 s of staleness between sim updates reaching
// clients. For a pixel village with chunk-cache proximity filter this
// is invisible — the next snapshot is usually indistinguishable from
// the previous.

const PERIODIC_REFRESH_MS = Number(process.env.WS_REFRESH_MS ?? 5000);

let periodicStarted = false;
let periodicTimer: NodeJS.Timeout | null = null;

export function startPeriodicRefresh(): void {
  if (periodicStarted) return;
  periodicStarted = true;
  console.log(`[ws] periodic snapshot refresh every ${PERIODIC_REFRESH_MS}ms`);
  periodicTimer = setInterval(() => {
    void refreshAllConnections();
  }, PERIODIC_REFRESH_MS);
}

export function stopPeriodicRefresh(): void {
  if (periodicTimer) clearInterval(periodicTimer);
  periodicTimer = null;
  periodicStarted = false;
}

async function refreshAllConnections(): Promise<void> {
  for (const conn of connections.values()) {
    if (conn.ws.readyState !== conn.ws.OPEN) continue;
    try {
      const snap = await getSnapshot(conn.playerId, conn.homePx, conn.homePy);
      conn.lastVersion = snap.version;
      try {
        conn.ws.send(JSON.stringify({ type: "snapshot", data: snap }));
      } catch {
        /* socket overflow — drop frame, next refresh will catch up */
      }
    } catch {
      /* DB hiccup — try again next interval */
    }
  }
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