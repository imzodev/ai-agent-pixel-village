// Resource-node (crop) kind configuration. Types only — the runtime data
// lives in src/lib/crops.ts.

export type CropRect = {
  x: number; y: number; w: number; h: number;
  /** Where this frame's trunk meets the ground (px in the frame), when it
   *  differs from the kind's baseX/baseY (fruit trees whose fruiting art
   *  stands elsewhere in its cell). */
  ax?: number; ay?: number;
};

export type CropKindConfig = {
  /** Total visual stages. Stage 0 = picked/empty; (stages-1) = fully grown. */
  stages: number;
  /** Milliseconds per regrowth tick. 0 disables auto-regrowth. */
  regrowthMs: number;
  /** Items given to the player per pick. */
  yield: number;
  /**
   * Source-pixel rectangle for each stage, in row-major order:
   * `frames[0]` is the picked/empty tile, `frames[stages-1]` is the
   * fully-grown tile. Empty array = use the procedural node_<kind>
   * sprite (no frame).
   */
  frames: CropRect[];
  /** Texture key (NODE_SHEETS) the frames are cut from; default lpc_crops. */
  sheet?: string;
  /** Needs an axe in the bag to pick (trees). */
  needsAxe?: boolean;
  /**
   * Bears fruit again and again (vines, fruit trees). Stages up to `mature`
   * are growth (each `regrowthMs`); the stages after it are fruit ripening,
   * `fruitMs` in all. Harvesting drops it back to `mature` instead of
   * removing it.
   */
  perennial?: { fruitMs: number; mature: number };
  /** Where the ground line is in a frame (px from its top-left): the node
   *  stands there. Default: bottom centre. */
  baseX?: number;
  baseY?: number;
};
