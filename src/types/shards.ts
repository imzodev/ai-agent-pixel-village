// Shard descriptors. Types only — no logic.

/** A rectangular band of chunk coordinates a WS shard owns. */
export type ShardRegion = {
  /** Inclusive x range, in chunks. */
  xMin: number;
  xMax: number;
  /** Inclusive y range, in chunks. */
  yMin: number;
  yMax: number;
};
