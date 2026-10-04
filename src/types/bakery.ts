// Fresh batches of free bread on a table outside a bakery (src/lib/bakery.ts).
// Types only.

/** A bread table: where it stands, and who bakes for it. */
export type BreadTableDef = {
  key: string;
  name: string;
  /** NPC key of the baker; no batch is baked while they're away. */
  bakerKey: string;
  /** The table's top-left tile (world tiles); it's two tiles wide. */
  tx: number;
  ty: number;
};

/** A table as the world snapshot carries it. */
export type BreadTableSnapshot = {
  key: string;
  /** Where you stand to take a loaf (world px, the table's front). */
  x: number;
  y: number;
  /** Loaves left in the current batch (0 = none baked or all taken). */
  left: number;
  /** The current batch (null before the first one). */
  batchId: number | null;
  /** What's on the table: bread, honey_bun… */
  itemKey: string;
};

/** What a player knows about the tables: the batches they took from. */
export type BreadState = { taken: number[] };

/** Taking a loaf. */
export type BreadTakeResult =
  | { ok: true; message: string; batchId: number; left: number; gained: { itemKey: string; qty: number }[]; bakerId: number | null }
  | { ok: false; error: string };

/** Where one loaf sits on a table (world px, its top-left). */
export type LoafSlot = { x: number; y: number };
