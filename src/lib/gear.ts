// Gear slots: what you wear, one item per slot, so a sword, the lantern and
// a charm can all be worn at once. Every equippable item is a weapon unless
// listed here; a new shield, charm, armour or boots is one line below (plus
// the item in src/lib/seed.ts). Cosmetics are their own looks-only slots
// (src/types/cosmetic.ts).

import type { GearSlot } from "@/types/domain";

/** Equippable items that aren't weapons, and their slot. */
export const GEAR_SLOT: Readonly<Record<string, GearSlot>> = {
  lantern: "offhand",
  fox_charm: "charm",
};

/** The slots open today, in the bag's order, with their look. */
export const GEAR_SLOT_LABEL: Readonly<Partial<Record<GearSlot, { icon: string; name: string }>>> = {
  weapon: { icon: "🗡️", name: "Weapon" },
  offhand: { icon: "🏮", name: "Off-hand" },
  charm: { icon: "🦊", name: "Charm" },
};

/** The slot an equippable item goes in. */
export const slotOf = (itemKey: string): GearSlot => GEAR_SLOT[itemKey] ?? "weapon";

/** Of what's worn, what comes off when `newKey` goes on: whatever shares its slot. */
export function toUnequip(equippedKeys: readonly string[], newKey: string): string[] {
  const slot = slotOf(newKey);
  return equippedKeys.filter((k) => slotOf(k) === slot);
}
