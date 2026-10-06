// Wild population of the land ahead of players (src/lib/wildPopulation.ts). Types only.

/** A chunk coordinate. */
export type ChunkXY = { cx: number; cy: number };

/** One enemy a chunk's pack places: its kind and world-pixel spot. */
export type PackMember = { kind: string; x: number; y: number };
