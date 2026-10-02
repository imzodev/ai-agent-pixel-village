// WebSocket types shared by the WS server (lib/world-stream.ts) and the
// browser client (game/worldStream.ts). Types only — no logic.
//
// The client-side types only reference `WorldSnapshot`/`Facing`, so the
// `ws` import for the server-side `Connection` is type-only and erased at
// build time; nothing here pulls Node code into the browser bundle.

import type { WebSocket } from "ws";
import type { ScheduledMove, WorldSnapshot } from "@/lib/protocol";
import type { Facing, PlayerActKind } from "@/types/world";

/** Per-connection state held by the WS server. */
export type Connection = {
  ws: WebSocket;
  playerId: number;
  homeCx: number;
  homeCy: number;
  homePx: number;
  homePy: number;
  /** Latest facing from `pos`/`heartbeat`, used when relaying positions. */
  homeFacing: Facing;
  /** Last time we persisted this player's presence (in-memory throttle). */
  lastPresenceAt: number;
  /** Last snapshot version we sent this connection. Used for reconnect. */
  lastVersion: number;
  /** Pending delta hint: chunk keys the client should refetch. */
  pendingDeltas: Set<string>;
  flushTimer: NodeJS.Timeout | null;
  /** When the client first exceeded the slow-client buffer threshold. */
  slowSince: number;
  /** Last relayed one-shot action (attack swing), for throttling. */
  lastActAt: number;
};

/**
 * Process-wide WS state shared by every loaded copy of the WS module
 * (custom server + Next's bundled API routes). See world-stream.ts.
 */
export type WsSharedState = {
  connections: Map<number, Connection>;
  dirtyPoints: Array<{ x: number; y: number }>;
  dirtyTimer: ReturnType<typeof setTimeout> | null;
};

/** Client-side stream callbacks. */
export type StreamHandlers = {
  onSnapshot: (data: WorldSnapshot) => void;
  onDelta: () => void;
  /** Another player's live position (movement relay). */
  onPlayerPos: (data: { id: number; x: number; y: number; facing: Facing }) => void;
  /** Another player's one-shot action (e.g. the attack swing). */
  onPlayerAct: (data: { id: number; kind: PlayerActKind; facing: Facing }) => void;
  /** An enemy hit you (amount, new HP, and what hit you). */
  onHurt?: (data: { amount: number; hp: number; maxHp: number; by: string }) => void;
  /** You were knocked out and woke at (x, y). */
  onKnockout?: (data: { x: number; y: number; coinsLost: number; by: string }) => void;
  /** Moves scheduled on the last beat (all starting at `startAt`). */
  onMoves: (data: { startAt: number; moves: ScheduledMove[] }) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

/** Client-side stream construction options. */
export type WorldStreamOptions = {
  url: string;
  handlers: StreamHandlers;
  heartbeatIntervalMs?: number;
};

/** A position the client has reported to the stream. */
export type StreamPosition = { x: number; y: number; facing: Facing };

/** Best clock-offset sample so far (server clock − client clock). */
export type ClockSample = { offsetMs: number; rttMs: number };
