// Wild foraging (src/lib/forage.ts). Types only.

/** How likely a biome's 26×20 cell holds a patch, and which kinds (weighted). */
export type ForageBiome = { chance: number; kinds: Readonly<Record<string, number>> };
