// The touch arrow pad's direction: which arrow a thumb at (dx, dy) from the
// pad's centre is pressing. Movement is four-way (the scene snaps diagonals
// to the stronger axis), so the pad is too: the larger offset wins, and a
// touch near the centre is no direction at all. Screen y grows downward,
// matching the movement axis (up = y −1).

/** Touches closer to the centre than this (px) press nothing. */
export const DPAD_DEADZONE_PX = 14;

/** The movement axis for a touch at (dx, dy) px from the pad's centre. */
export function dpadAxis(dx: number, dy: number, deadzone = DPAD_DEADZONE_PX): { x: number; y: number } {
  if (Math.hypot(dx, dy) < deadzone) return { x: 0, y: 0 };
  return Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}
