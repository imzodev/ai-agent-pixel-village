// How fast a player may move, enforced on the server. The client moves
// itself (src/game/WorldScene.ts) using the same speeds; the WS server
// (src/lib/world-stream.ts) checks every reported position against a
// budget of distance that refills at the fastest legal speed — running, or
// riding if you really own a bike — and is capped at a short burst, so
// network jitter is fine but speed hacks are clamped and snapped back.
// Teleports the server makes itself (waystones, portals, knockouts) reset
// the guard. Pure.

import type { SpeedGuard } from "@/types/websocket";

// Every player speed lives here, for the client and the server alike.
export const PLAYER_SPEED = 120; // px/s walking
/** Running = walking × this. */
export const RUN_SPEED_MULT = 1.75;
/** Riding a bike (src/lib/bike.ts) = walking × this. Keep it above running. */
export const BIKE_SPEED_MULT = 2.5;
/** Headroom over the true top speed (frame timing, clock drift). */
export const SPEED_TOLERANCE = 1.1;
/** The budget holds at most this many seconds of travel (absorbs bunched packets). */
export const BURST_S = 1.5;
/** Wiggle room for rounding and collision nudges (borrowed, then repaid). */
export const SLACK_PX = 16;
/** A reconnecting player may catch up on at most this long offline. */
export const RECONNECT_GRACE_S = 30;

/** The fastest a player may legally go (px/s), with tolerance. */
export function maxSpeedPx(mounted: boolean): number {
  return PLAYER_SPEED * (mounted ? BIKE_SPEED_MULT : RUN_SPEED_MULT) * SPEED_TOLERANCE;
}

export const newGuard = (x: number, y: number, now: number, mounted = false): SpeedGuard => ({ x, y, t: now, budget: maxSpeedPx(mounted) * BURST_S });

/** Refill the budget for the time since the last report (never past the cap,
 *  but a larger reconnect grace is kept until spent). */
function refill(g: SpeedGuard, now: number, speed: number): void {
  const cap = speed * BURST_S;
  const dt = Math.max(0, (now - g.t) / 1000);
  if (g.budget < cap) g.budget = Math.min(cap, g.budget + speed * dt);
  g.t = now;
}

/**
 * Check a reported move to (x, y). Accepts it (spending budget), or clamps
 * it to as far as the budget reaches. Mutates and returns the guard's new
 * position; `ok` is false when the client must be corrected.
 */
export function guardStep(g: SpeedGuard, x: number, y: number, now: number, mounted: boolean): { x: number; y: number; ok: boolean } {
  refill(g, now, maxSpeedPx(mounted));
  const d = Math.hypot(x - g.x, y - g.y);
  // The slack is a cushion, not a gift: dipping into it is paid back
  // (the budget can go slightly negative), so it can't add speed.
  if (d <= g.budget + SLACK_PX) {
    g.budget -= d;
    g.x = x; g.y = y;
    return { x, y, ok: true };
  }
  const k = Math.max(0, g.budget) / d;
  g.x += (x - g.x) * k;
  g.y += (y - g.y) * k;
  g.budget = 0;
  return { x: g.x, y: g.y, ok: false };
}

/** A reconnect: credit the time since the last report (up to the grace). */
export function resumeGuard(g: SpeedGuard, now: number): void {
  const offline = Math.min(RECONNECT_GRACE_S, Math.max(0, (now - g.t) / 1000));
  g.budget = Math.max(g.budget, maxSpeedPx(true) * offline);
  g.t = now;
}

/** A move the server made itself (waystone, portal, knockout). */
export function placeGuard(g: SpeedGuard, x: number, y: number, now: number): void {
  g.x = x; g.y = y; g.t = now; g.budget = 0;
}
