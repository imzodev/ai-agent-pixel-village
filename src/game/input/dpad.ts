// The touch arrow pad's direction: which arrow a thumb at (dx, dy) from the
// pad's centre is pressing, and whether it's pushed far enough out to run. Movement is four-way (the scene snaps diagonals
// to the stronger axis), so the pad is too: the larger offset wins, and a
// touch near the centre is no direction at all. Screen y grows downward,
// matching the movement axis (up = y −1).

/** Touches closer to the centre than this (px) press nothing. */
export const DPAD_DEADZONE_PX = 14;

/** Past this share of the pad's radius, the thumb is "pushing all the way": run. */
export const RUN_FRACTION = 0.7;

/** Is a touch at (dx, dy) from the centre of a pad of `radius` px far enough out to run? */
export function dpadRuns(dx: number, dy: number, radius: number, fraction = RUN_FRACTION): boolean {
  return radius > 0 && Math.hypot(dx, dy) >= radius * fraction;
}

/** The movement axis for a touch at (dx, dy) px from the pad's centre. */
export function dpadAxis(dx: number, dy: number, deadzone = DPAD_DEADZONE_PX): { x: number; y: number } {
  if (Math.hypot(dx, dy) < deadzone) return { x: 0, y: 0 };
  return Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}
