// Lot banners: the colour and emblem an owner flies over their lot so it can be
// told from every other (src/game/lotBanners.ts draws it, the lot card picks
// it). Pure data. A lot nobody has painted flies a default derived from its
// owner's id, so neighbours differ from the first day.

import type { LotBanner } from "@/types/garden";

export const LOT_COLORS: readonly { name: string; hex: string }[] = [
  { name: "Crimson", hex: "#d94a4a" },
  { name: "Orange", hex: "#e8883a" },
  { name: "Gold", hex: "#e8c23a" },
  { name: "Lime", hex: "#8ac43a" },
  { name: "Forest", hex: "#3a9a52" },
  { name: "Teal", hex: "#2fb0a0" },
  { name: "Sky", hex: "#4aa8e8" },
  { name: "Royal", hex: "#4a5ee0" },
  { name: "Violet", hex: "#8a52d8" },
  { name: "Pink", hex: "#e865b0" },
  { name: "Brown", hex: "#9a6a3a" },
  { name: "Slate", hex: "#6a7a8a" },
];

export const LOT_EMBLEMS: readonly { key: string; name: string; icon: string }[] = [
  { key: "leaf", name: "Leaf", icon: "🍃" },
  { key: "grape", name: "Grapes", icon: "🍇" },
  { key: "apple", name: "Apple", icon: "🍎" },
  { key: "wheat", name: "Wheat", icon: "🌾" },
  { key: "hammer", name: "Hammer", icon: "🔨" },
  { key: "horseshoe", name: "Horseshoe", icon: "🧲" },
  { key: "star", name: "Star", icon: "⭐" },
  { key: "moon", name: "Moon", icon: "🌙" },
  { key: "key", name: "Key", icon: "🗝️" },
  { key: "fish", name: "Fish", icon: "🐟" },
  { key: "heart", name: "Heart", icon: "❤️" },
  { key: "crown", name: "Crown", icon: "👑" },
];

/** The banner a lot flies before its owner picks one: stable per owner. */
export function defaultBanner(ownerId: number): LotBanner {
  const n = Math.abs(Math.floor(ownerId));
  return { color: n % LOT_COLORS.length, emblem: Math.floor(n / LOT_COLORS.length) % LOT_EMBLEMS.length };
}

/** Whether (color, emblem) are indices into the palette and the emblem list. */
export function isBanner(color: unknown, emblem: unknown): boolean {
  return Number.isInteger(color) && Number.isInteger(emblem)
    && (color as number) >= 0 && (color as number) < LOT_COLORS.length
    && (emblem as number) >= 0 && (emblem as number) < LOT_EMBLEMS.length;
}

/** What a lot flies: its owner's pick, or the default where nothing (valid) was picked. */
export function resolveBanner(ownerId: number, color: number | null, emblem: number | null): LotBanner {
  return color != null && emblem != null && isBanner(color, emblem) ? { color, emblem } : defaultBanner(ownerId);
}
