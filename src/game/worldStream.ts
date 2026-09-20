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

import type { WsClientMessage, WsServerMessage, Facing } from "@/lib/protocol";

export type StreamHandlers = {
  onSnapshot: (data: import("@/lib/protocol").WorldSnapshot) => void;
  onDelta: () => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export type WorldStreamOptions = {
  url: string;
  handlers: StreamHandlers;
  heartbeatIntervalMs?: number;
};

export class WorldStream {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private lastPosition: { x: number; y: number; facing: Facing } | null = null;

  constructor(private readonly opts: WorldStreamOptions) {}

  start(): void {
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  /** Update the player's position; sent on the next heartbeat tick. */
  setPosition(x: number, y: number, facing: Facing): void {
    this.lastPosition = { x, y, facing };
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
        this.opts.handlers.onSnapshot(msg.data);
      } else if (msg.type === "delta") {
        this.opts.handlers.onDelta();
      }
      // "pong" and "error" are observable via close events; nothing to do.
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
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

  private send(msg: WsClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      /* connection died mid-send */
    }
  }
}