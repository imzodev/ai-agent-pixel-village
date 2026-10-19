// How fast a player may move, enforced on the server. The client moves
// itself (src/game/WorldScene.ts) using the same speeds; the WS server
// (src/lib/world-stream.ts) checks every reported position against a
// budget of distance that refills at the fastest legal speed — running, or
// riding if you really own a bike — and is capped at a short burst, so
// network jitter is fine but speed hacks are clamped and snapped back.
// Time is measured by each report's own (server-synced) stamp, so reports
// the network held up and then delivered at once still count as on time.
// Teleports the server makes itself (waystones, portals, knockouts) reset
// the guard. Pure.

import type { GuardResult, SpeedGuard } from "@/types/websocket";

// Every player speed lives here, for the client and the server alike.
export const PLAYER_SPEED = 120; // px/s walking
/** Running = walking × this. */
export const RUN_SPEED_MULT = 1.75;
/** Riding a bike (src/lib/bike.ts) = walking × this. Keep it above running. */
export const BIKE_SPEED_MULT = 2.5;
/** Headroom over the true top speed (frame timing, clock drift). Lenient on
 *  purpose: the guard is there to stop teleports and speed hacks, never to pull
 *  back honest play. Kept under the bike's lead over running, so riding without
 *  a bike is still (slowly) caught. */
export const SPEED_TOLERANCE = 1.35;
/** The budget holds at most this many seconds of travel (absorbs bunched packets and hitches). */
export const BURST_S = 3;
/** Wiggle room for rounding and collision nudges (borrowed, then repaid). */
export const SLACK_PX = 32;
/** A reconnecting player may catch up on at most this long offline. */
export const RECONNECT_GRACE_S = 30;
/** A report may be stamped at most this far ahead of the server's clock (clock-sync slack). */
export const CLOCK_AHEAD_MS = 250;

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
 * When a report counts as made: its stamp `t` (the client's server-synced
 * clock), kept between the previous report and a little past the server's
 * `now`. Judging by when you moved, not when the message arrived, lets
 * reports held up by the network and then delivered in a burst pass; and a
 * forged stamp can never earn more time than the arrival time would.
 */
export function reportTime(g: SpeedGuard, now: number, t?: number): number {
  const at = t !== undefined && Number.isFinite(t) ? t : now;
  // Stamped before the last report: the client's clock offset jumped back (a
  // better ping, a bad first sync). Go by arrival instead, so the time it
  // really moved for isn't lost. g.t is never past an earlier now + CLOCK_AHEAD_MS,
  // so this can't earn more than arrival time would.
  if (at < g.t) return Math.max(now, g.t);
  return Math.min(at, now + CLOCK_AHEAD_MS);
}

/**
 * Check a reported move to (x, y), made at `t` (see reportTime; arrival time
 * if absent). Accepts it (spending budget), or clamps it to as far as the
 * budget reaches. Mutates and returns the guard's new position; `ok` is
 * false when the client must be corrected.
 */
export function guardStep(g: SpeedGuard, x: number, y: number, now: number, mounted: boolean, t?: number): GuardResult {
  const prevT = g.t;
  refill(g, reportTime(g, now, t), maxSpeedPx(mounted));
  const d = Math.hypot(x - g.x, y - g.y);
  // The slack is a cushion, not a gift: dipping into it is paid back
  // (the budget can go slightly negative), so it can't add speed.
  if (d <= g.budget + SLACK_PX) {
    g.budget -= d;
    g.x = x; g.y = y;
    return { x, y, ok: true };
  }
  const why = { d: Math.round(d), budget: Math.round(g.budget), sinceLastMs: Math.round(g.t - prevT), stampLagMs: t !== undefined && Number.isFinite(t) ? Math.round(now - t) : null };
  const k = Math.max(0, g.budget) / d;
  g.x += (x - g.x) * k;
  g.y += (y - g.y) * k;
  g.budget = 0;
  return { x: g.x, y: g.y, ok: false, why };
}

/** A reconnect: credit the time since the last report (up to the grace). */
export function resumeGuard(g: SpeedGuard, now: number): void {
  const offline = Math.min(RECONNECT_GRACE_S, Math.max(0, (now - g.t) / 1000));
  g.budget = Math.max(g.budget, maxSpeedPx(true) * offline);
  g.t = now;
}

/**
 * A report made before the client applied our latest correction (`cs` is the
 * last correction it saw): it still carries the old, further-on position, so
 * judging it would only snap the player back again. Ignore it. Clients that
 * don't send `cs` are judged as before.
 */
export function isStaleReport(correctSeq: number, cs: unknown): boolean {
  return typeof cs === "number" && Number.isFinite(cs) && cs < correctSeq;
}

/** A move the server made itself (waystone, portal, knockout). */
export function placeGuard(g: SpeedGuard, x: number, y: number, now: number): void {
  g.x = x; g.y = y; g.t = now; g.budget = 0;
}
