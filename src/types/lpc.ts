// LPC character sprite layers (src/lib/lpcLayers.ts). Types only.

/** One sheet in a character's stack: its file, and how it's recoloured. */
export type LpcLayer = { src: string; tint?: string; mode?: "skin" | "recolor" };

/** A held item's LPC art: the part drawn in front of the body and behind it. */
export type LpcWeaponArt = { front: string; behind: string; tint?: string };
