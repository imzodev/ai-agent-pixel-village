// Town reputation (src/lib/reputation.ts). Types only.

/** A reputation tier: from `min` points, with its shop discount (0–1). */
export type RepTier = { name: string; min: number; discount: number };

/** Your standing with one town. */
export type RepView = { town: string; name: string; points: number; tier: string; discount: number; next: { name: string; min: number } | null };
