// Browser-side WebSocket client with auto-reconnect + heartbeat.
//
// Replaces the 1 Hz HTTP poll loop in WorldScene. The browser opens a
// persistent WS to /ws (or the configured NEXT_PUBLIC_WS_URL), receives
// a snapshot on connect, applies state changes on delta hints, and
// sends heartbeats every 5 s.
//
// Reconnect is jittered exponential: starts at 250 ms, doubles each
// attempt, capped at 8 s, plus random jitter to spread reconnect storms
// after a server restart.

import type { WsClientMessage, WsServerMessage } from "@/lib/protocol";
import type { Facing, PlayerActKind } from "@/types/world";
import type { ClockSample, StreamHandlers, StreamPosition, WorldStreamOptions } from "@/types/websocket";

export type { StreamHandlers, WorldStreamOptions };

// How often the client streams its position to the server for relay to
// nearby players. Separate from the slower presence heartbeat so the DB
// write stays throttled.
const POS_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_WS_POS_MS ?? 200);

// Clock sync. NPC / animal / enemy motion is a pure function of SERVER
// time (see src/lib/motion.ts), so every client must agree on "now".
// We fire a short burst of pings on connect and one every
// CLOCK_PING_EVERY_MS after, and keep the sample with the lowest
// round-trip time (its one-way-delay error is smallest).
const CLOCK_BURST = 5;
const CLOCK_BURST_GAP_MS = 250;
const CLOCK_PING_EVERY_MS = 30_000;

export class WorldStream {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private posTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private lastPosition: StreamPosition | null = null;
  private clockTimers: ReturnType<typeof setTimeout>[] = [];
  private clock: ClockSample | null = null;
  /** Rough offset from message stamps, used until the first pong lands. */
  private roughOffsetMs: number | null = null;

  constructor(private readonly opts: WorldStreamOptions) {}

  /** Current server time (epoch ms), as best this client can tell. */
  serverNow(): number {
    return Date.now() + (this.clock?.offsetMs ?? this.roughOffsetMs ?? 0);
  }

  private noteServerStamp(serverTime: number | undefined): void {
    if (typeof serverTime === "number" && !this.clock) this.roughOffsetMs = serverTime - Date.now();
  }

  private startClockSync(): void {
    const ping = () => this.send({ type: "ping", t: Date.now() });
    for (let i = 0; i < CLOCK_BURST; i++) this.clockTimers.push(setTimeout(ping, i * CLOCK_BURST_GAP_MS));
    this.clockTimers.push(setInterval(ping, CLOCK_PING_EVERY_MS));
  }

  private stopClockSync(): void {
    for (const t of this.clockTimers) clearTimeout(t);
    this.clockTimers = [];
  }

  start(): void {
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.posTimer) clearInterval(this.posTimer);
    this.stopClockSync();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  /** Tell nearby players about a one-shot action (sent immediately). */
  sendAct(kind: PlayerActKind, facing: Facing): void {
    this.send({ type: "act", kind, facing });
  }

  /** Update the player's position; sent on the next pos/heartbeat tick. */
  setPosition(x: number, y: number, facing: Facing, mounted = false): void {
    this.lastPosition = { x, y, facing, mounted };
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.opts.url);
    } catch (err) {
      console.warn("[ws] connect failed:", err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.opts.handlers.onOpen?.();
      this.startHeartbeat();
      this.startPositionStream();
      this.startClockSync();
      // Send a hello so the server knows we're a fresh client. lastVersion
      // is unknown on first connect — server sends a full snapshot.
      this.send({ type: "hello" });
    };

    this.ws.onmessage = (ev) => {
      let msg: WsServerMessage;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }
      if (msg.type === "snapshot") {
        this.noteServerStamp(msg.data.now);
        this.opts.handlers.onSnapshot(msg.data);
      } else if (msg.type === "moves") {
        this.noteServerStamp(msg.serverTime);
        this.opts.handlers.onMoves({ startAt: msg.startAt, moves: msg.moves });
      } else if (msg.type === "pong") {
        if (typeof msg.t === "number" && typeof msg.serverTime === "number") {
          const now = Date.now();
          const rttMs = now - msg.t;
          // Server stamped mid-flight: assume symmetric latency.
          const offsetMs = msg.serverTime + rttMs / 2 - now;
          if (!this.clock || rttMs <= this.clock.rttMs) this.clock = { offsetMs, rttMs };
        }
      } else if (msg.type === "delta") {
        this.opts.handlers.onDelta();
      } else if (msg.type === "playerAct") {
        this.opts.handlers.onPlayerAct({ id: msg.id, kind: msg.kind, facing: msg.facing });
      } else if (msg.type === "hurt") {
        this.opts.handlers.onHurt?.({ amount: msg.amount, hp: msg.hp, maxHp: msg.maxHp, by: msg.by });
      } else if (msg.type === "chunkReload") {
        this.opts.handlers.onChunkReload?.({ chunks: msg.chunks });
      } else if (msg.type === "enemyAct") {
        this.opts.handlers.onEnemyAct?.({ id: msg.id, x: msg.x, y: msg.y });
      } else if (msg.type === "knockout") {
        this.opts.handlers.onKnockout?.({ x: msg.x, y: msg.y, coinsLost: msg.coinsLost, by: msg.by });
      } else if (msg.type === "saloon") {
        this.opts.handlers.onSaloon?.({ inn: msg.inn });
      } else if (msg.type === "playerPos") {
        this.opts.handlers.onPlayerPos({ id: msg.id, x: msg.x, y: msg.y, facing: msg.facing, mounted: msg.mounted });
      }
      // "error" is observable via close events; nothing to do.
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.stopPositionStream();
      this.stopClockSync();
      this.opts.handlers.onClose?.();
      if (!this.closed) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire right after; let it handle reconnect.
    };
  }

  private scheduleReconnect(): void {
    const base = Math.min(8000, 250 * 2 ** this.reconnectAttempts);
    const jitter = Math.random() * 250;
    const delay = base + jitter;
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat(): void {
    const interval = this.opts.heartbeatIntervalMs ?? 5000;
    const tick = () => {
      if (!this.lastPosition) return;
      this.send({
        type: "heartbeat",
        x: this.lastPosition.x,
        y: this.lastPosition.y,
        facing: this.lastPosition.facing,
      });
    };
    // Send immediately so the server's proximity bbox is anchored on the
    // player's real position from the first instant after connect (the
    // DB position it authenticates with can be up to 10s stale).
    tick();
    this.heartbeatTimer = setInterval(tick, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // Fast position stream for player-to-player movement. Only sends when
  // the position actually changed since the last frame, so an idle client
  // costs nothing.
  private startPositionStream(): void {
    let sent: StreamPosition | null = null;
    const tick = () => {
      const p = this.lastPosition;
      if (!p) return;
      if (sent && p.x === sent.x && p.y === sent.y && p.facing === sent.facing && p.mounted === sent.mounted) return;
      sent = { ...p };
      this.send({ type: "pos", x: p.x, y: p.y, facing: p.facing, mounted: p.mounted });
    };
    this.posTimer = setInterval(tick, POS_INTERVAL_MS);
  }

  private stopPositionStream(): void {
    if (this.posTimer) {
      clearInterval(this.posTimer);
      this.posTimer = null;
    }
  }

  private send(msg: WsClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      /* connection died mid-send */
    }
  }
}