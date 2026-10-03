// Choppable terrain trees (src/lib/trees.ts). Types only.

/** A generated tree, by the lattice corner it stands on. */
export type TreeSpot = { vx: number; vy: number; kind: "oak" | "pine" };

/** A chunk to re-read after the terrain in it changed. */
export type ChunkRef = { cx: number; cy: number };

/** The result of one chop at a terrain tree. */
export type ChopTreeResult =
  | { ok: true; felled: boolean; hitsLeft: number; chunks: ChunkRef[] }
  | { ok: false; error: string };
