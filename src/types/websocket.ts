// WebSocket types shared by the WS server (lib/world-stream.ts) and the
// browser client (game/worldStream.ts). Types only — no logic.
//
// The client-side types only reference `WorldSnapshot`/`Facing`, so the
// `ws` import for the server-side `Connection` is type-only and erased at
// build time; nothing here pulls Node code into the browser bundle.

import type { WebSocket } from "ws";
import type { WorldSnapshot } from "@/lib/protocol";
import type { Facing } from "@/types/world";

/** Per-connection state held by the WS server. */
export type Connection = {
  ws: WebSocket;
  playerId: number;
  homeCx: number;
  homeCy: number;
  homePx: number;
  homePy: number;
  /** Last time we persisted this player's presence (in-memory throttle). */
  lastPresenceAt: number;
  /** Last snapshot version we sent this connection. Used for reconnect. */
  lastVersion: number;
  /** Pending delta hint: chunk keys the client should refetch. */
  pendingDeltas: Set<string>;
  flushTimer: NodeJS.Timeout | null;
  /** When the client first exceeded the slow-client buffer threshold. */
  slowSince: number;
};

/** Client-side stream callbacks. */
export type StreamHandlers = {
  onSnapshot: (data: WorldSnapshot) => void;
  onDelta: () => void;
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
