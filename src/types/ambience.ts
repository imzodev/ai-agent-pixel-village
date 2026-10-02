// Ambient life (src/game/ambience.ts). Types only.

/** What the scene tells the ambience layer each frame. */
export type AmbienceContext = {
  /** The camera's world view. */
  view: { x: number; y: number; width: number; height: number; right: number; bottom: number };
  /** The local player's feet, or null when spectating. */
  player: { x: number; y: number; depth: number; moving: boolean; running: boolean } | null;
  /** Region key under the player/camera (src/lib/regions.ts), if any. */
  region: string | null;
  /** Night darkness 0..1 (from the lighting). */
  darkness: number;
  underground: boolean;
  raining: boolean;
};

/** A point that puffs chimney smoke. */
export type SmokeSource = { x: number; y: number };
