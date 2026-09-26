// Pure classifier for NPC behaviour labels. No DB, no Phaser — feed it
// the inputs the snapshot already collects and it returns a string
// the wire can render. Lives in lib/ alongside other pure-logic
// helpers (movement, sim constants).

import type { NpcState } from "@/types/world";

export interface NpcStateInput {
  x: number;
  y: number;
  /** The entity's currently-set goal; null when idle-between-targets. */
  targetX: number | null;
  targetY: number | null;
  homeX: number;
  homeY: number;
  /** True when a player is within the configured proximity radius. */
  hasPlayerNearby: boolean;
  /** In-game hour, 0-24. Used for the resting schedule. */
  hour: number;
}

/**
 * Resting window: between the last "dusk" hour and the next "dawn" hour.
 * Mirrors the threshold the world day/night cycle uses (see
 * src/lib/sim.ts), so an NPC's resting state lines up with the visible
 * sky colour.
 */
const REST_HOUR_START = 19;
const REST_HOUR_END = 6;

/** How close an entity's "home" has to be for us to call it resting. */
const REST_HOME_RADIUS_PX = 64;

/** A wanderer counts as "moving" once the distance is > one cell. */
const WALK_MIN_DIST_PX = 8;

/**
 * Map raw inputs to one of the wire-visible `NpcState` values. The
 * ordering matters: facing_player takes precedence over walking so an
 * NPC paused to greet the player doesn't show as "walking".
 */
export function classifyNpc(input: NpcStateInput): NpcState {
  if (input.hasPlayerNearby) return "facing_player";

  if (input.targetX != null && input.targetY != null) {
    const dx = input.x - input.targetX;
    const dy = input.y - input.targetY;
    if (Math.hypot(dx, dy) > WALK_MIN_DIST_PX) return "walking";
    // Targeted and arrived — treat as idle for the wire (sprite has
    // already stopped animating, label stays neutral).
  }

  const atHome =
    Math.hypot(input.x - input.homeX, input.y - input.homeY) <= REST_HOME_RADIUS_PX;
  const restHours = input.hour >= REST_HOUR_START || input.hour < REST_HOUR_END;
  if (atHome && restHours) return "resting";

  return "idle";
}
