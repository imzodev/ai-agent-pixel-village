// scripts/load-test.ts. Types only.

/** One bot: a "Play now" player on the WebSocket, or a logged-out visitor. */
export type LoadBot = { ws: import("ws").WebSocket; cookie?: string; msgs: number; bytes: number; closedWith?: number };

/** What one step of the ramp measured. */
export type LoadStep = {
  players: number;
  spectators: number;
  /** Event-loop delay p99 / max over the server's last 10 s window, ms. */
  lagP99: number;
  lagMax: number;
  rssMb: number;
  /** /api/me response time, median and worst of a few, ms. */
  meP50: number;
  meMax: number;
  /** Messages per second the bots received. */
  msgsPerSec: number;
  /** Bots turned away or dropped during the step. */
  refused: number;
};
