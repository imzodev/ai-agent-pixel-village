// Night lighting and atmosphere (src/game/lighting.ts). Types only.

/** A point light: cuts a soft hole in the night and adds a coloured glow. */
export type LightSource = {
  x: number;
  y: number;
  /** Radius of the lit pool, world px. */
  radius: number;
  /** Glow colour (0xRRGGBB). */
  color: number;
  /** Flickers like a flame. */
  flicker?: boolean;
};

/** What the scene asks the lighting layer to draw this frame. */
export type AtmosphereState = {
  /** Night darkness 0 (day) … ~0.8 (deep night / underground). */
  darkness: number;
  /** Night tint colour. */
  nightColor: number;
  /** Colour grading overlay (sunset, dawn) and its strength. */
  gradeColor: number;
  gradeAlpha: number;
  /** Drifting cloud shadows on the ground (day, outdoors). */
  clouds: boolean;
  /** Fog banks (0 = none). */
  fog: number;
  /** Raining: splash rings on the ground. */
  rain: boolean;
};
