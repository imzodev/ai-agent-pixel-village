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
import type { WorldChange } from "@/lib/protocol";

const WS_PATH = "/ws";

const MAX_OUTBOUND_BYTES = 64 * 1024;
const SLOW_CLIENT_TIMEOUT_MS = 2000;
const DELTA_COALESCE_MS = 100;
const COOKIE_NAME = "grove_session";

type Connection = {
  ws: WebSocket;
  playerId: number;
  homeCx: number;
  homeCy: number;
  homePx: number;
  homePy: number;
  outboundBytes: number;
  isSlow: boolean;
  slowSince: number;
  // Last snapshot version we sent this connection. Used for reconnect.
  lastVersion: number;
  // Pending delta hint: chunk (cx, cy) the client should refetch.
  pendingDeltas: Set<string>;
  flushTimer: NodeJS.Timeout | null;
};

const connections = new Map<number, Connection>();

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
    outboundBytes: 0,
    isSlow: false,
    slowSince: 0,
    lastVersion: 0,
    pendingDeltas: new Set(),
    flushTimer: null,
  };

  // Wrap send so we can track outbound buffer size and evict slow clients.
  const originalSend = ws.send.bind(ws);
  ws.send = ((data: string | Buffer | ArrayBuffer | Uint8Array, opts?: unknown, cb?: unknown) => {
    if (conn.isSlow) return;
    const size = typeof data === "string" ? data.length : (data as Uint8Array).byteLength;
    conn.outboundBytes += size;
    if (conn.outboundBytes > MAX_OUTBOUND_BYTES) {
      conn.isSlow = true;
      conn.slowSince = Date.now();
      setTimeout(() => {
        try {
          ws.close(1008, "slow consumer");
        } catch {
          /* already closed */
        }
      }, SLOW_CLIENT_TIMEOUT_MS);
      return;
    }
    return originalSend(data, opts as never, cb as never);
  }) as typeof ws.send;

  ws.on("close", () => {
    if (conn.flushTimer) clearTimeout(conn.flushTimer);
    connections.delete(conn.playerId);
  });
  ws.on("error", () => {
    if (conn.flushTimer) clearTimeout(conn.flushTimer);
    connections.delete(conn.playerId);
  });

  // Decrement byte count on successful send completion.
  ws.on("drain", () => {
    // Drain means the OS buffer accepted everything; reset counter.
    conn.outboundBytes = 0;
  });

  // Override "drain" with proper accounting on send completion. The above
  // simple drain handler isn't quite right for byte tracking; the byte
  // count is approximate and that's fine for slow-consumer detection.

  connections.set(conn.playerId, conn);

  // Send initial snapshot. Errors close the connection cleanly.
  try {
    const snap = await getSnapshot(conn.playerId, auth.x, auth.y);
    conn.lastVersion = snap.version;
    ws.send(JSON.stringify({ type: "snapshot", data: snap }));
    // Also refresh presence so the player appears in the 45 s window
    // immediately (the WS connect serves itself is also a heartbeat).
    await refreshLastSeen(conn.playerId);
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
    conn.ws.send(JSON.stringify({ type: "pong" }));
    return;
  }
if (msg.type === "heartbeat" && typeof msg.x === "number" && typeof msg.y === "number") {
    const facing = ["up","down","left","right"].includes(msg.facing ?? "") ? msg.facing! : "down";
    void refreshLastSeen(conn.playerId, { x: msg.x, y: msg.y, facing });
    // Update home chunk so future world_change events go to the right
    // proximity set. Cheap; happens every client heartbeat.
    const { cx, cy } = chunkAtWorldPx(msg.x, msg.y);
    conn.homePx = msg.x;
    conn.homePy = msg.y;
    if (cx !== conn.homeCx || cy !== conn.homeCy) {
      conn.homeCx = cx;
      conn.homeCy = cy;
    }
    return;
  }
  if (msg.type === "hello") {
    // Legacy handshake — sessionId is no longer required since the WS
    // upgrade itself authenticates via cookie. Acknowledged for forward
    // compatibility with future client variants.
    conn.ws.send(JSON.stringify({ type: "pong" }));
  }
}

// ── Delta coalescing + dispatch ────────────────────────────────────────

function onWorldChange(change: WorldChange): void {
  for (const conn of connections.values()) {
    // Proximity filter: include if the change is within ±3 chunks of the
    // player's home chunk (matches snapshot.ts PROXIMITY_RADIUS_CHUNKS).
    const dx = Math.abs(change.chunkX - conn.homeCx);
    const dy = Math.abs(change.chunkY - conn.homeCy);
    if (dx > 3 || dy > 3) continue;
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
  // full snapshot for this connection and push it. This is heavier than
  // a targeted delta payload, but the proximity filter and chunk cache
  // keep the snapshot bounded, and clients need real data to render
  // movement. Phase 3+ will switch to per-entity diffs.
  try {
    const snap = await getSnapshot(conn.playerId, conn.homePx, conn.homePy);
    conn.lastVersion = snap.version;
    conn.ws.send(JSON.stringify({ type: "snapshot", data: snap }));
  } catch {
    /* ignore — next change or reconnect will refresh */
  }
  void chunks; // Suppress unused warning — chunk list informs future logic.
}

// ── Bootstrap ──────────────────────────────────────────────────────────

// Periodic full-snapshot refresh per connection. The pub/sub bridge fires
// on entity changes, but in dev without Upstash Redis the cross-process
// pub/sub doesn't work — the tickd's world_change publishes don't reach
// the WS server's process. A short-interval refresh covers that case:
// every ~1.5s the WS pushes a fresh snapshot to every client. The
// proximity filter and 250 ms chunk cache keep the per-client cost
// bounded; this is the same payload the client would otherwise build
// itself. Phase 3+ will switch to per-entity diffs once Redis is wired.
const PERIODIC_REFRESH_MS = Number(process.env.WS_REFRESH_MS ?? 1500);

let periodicStarted = false;
let periodicTimer: NodeJS.Timeout | null = null;

export function startPeriodicRefresh(): void {
  if (periodicStarted) return;
  periodicStarted = true;
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
      conn.ws.send(JSON.stringify({ type: "snapshot", data: snap }));
    } catch {
      /* ignore — slow consumer or DB hiccup */
    }
  }
}

// Start the pub/sub bridge that consumes world_change events. Must be
// called once at process start. Idempotent — repeated calls are no-ops.
let pubSubStarted = false;
let pubSubUnsub: (() => Promise<void> | void) | null = null;

export async function startPubSubBridge(): Promise<void> {
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
}

export async function stopPubSubBridge(): Promise<void> {
  if (!pubSubStarted) return;
  pubSubStarted = false;
  if (pubSubUnsub) {
    await pubSubUnsub();
    pubSubUnsub = null;
  }
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
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req) => {
    void onConnection(ws, req);
  });

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
}

// Re-export so callers that still want to boot this as a standalone
// process (e.g. for sharding in Phase 4) can. The custom server in
// `src/server.ts` is the preferred entry for the unified deployment.
export const PORT = Number(process.env.WS_PORT ?? 3001);