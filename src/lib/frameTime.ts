// How long the last frame really took, for moving things. Phaser's 60 fps
// limiter (TimeStep.stepLimitFPS) passes the whole accumulated delta and then
// keeps the remainder for the next frame too, so with uneven frames (a chunk
// being built, a 120/144 Hz screen) its `delta` runs up to ~1.5× real time:
// enough to outrun the server's speed limit (src/lib/speedGuard.ts) when
// running or riding. The frame's own timestamp never lies. Pure.

/** Longest step one frame may take (a hitch or a background tab doesn't teleport). */
export const MAX_FRAME_S = 0.05;

/** Seconds from the previous frame's timestamp to this one's (ms), capped. */
export function frameSeconds(time: number, last: number | null): number {
  if (last === null || !Number.isFinite(last) || time <= last) return 0;
  return Math.min(MAX_FRAME_S, (time - last) / 1000);
}
