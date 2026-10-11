// Which LPC sheets make up a character, in what order, and how each is
// recoloured. Shared by the game (src/game/lpc.ts composes them on a canvas)
// and the server (src/lib/cards/characterPng.ts composes them with sharp), so
// a character looks the same in the world and on a share card. Pure: no DOM.

import type { Appearance } from "@/types/domain";
import { cosmoByKey } from "@/lib/cosmetics";
import type { CosmeticSlot, EquippedCosmetics } from "@/types/cosmetic";
import type { LpcLayer, LpcWeaponArt } from "@/types/lpc";

/** Held items with LPC art. The Wooden Sword uses the dagger, tinted wood;
 *  the axe (scripts/draw-axe.mjs) is shown only while chopping. */
export const WEAPON_LAYERS: Record<string, LpcWeaponArt> = {
  wooden_sword: { front: "/lpc/weapon_dagger.png", behind: "/lpc/weapon_dagger_behind.png", tint: "#b07a44" },
  stone_sword: { front: "/lpc/weapon_dagger.png", behind: "/lpc/weapon_dagger_behind.png", tint: "#a4a6ae" },
  thorn_blade: { front: "/lpc/weapon_dagger.png", behind: "/lpc/weapon_dagger_behind.png", tint: "#7aa548" },
  wisp_blade: { front: "/lpc/weapon_dagger.png", behind: "/lpc/weapon_dagger_behind.png", tint: "#a98cf0" },
  // The far lands' blades (src/lib/recipes.ts).
  steel_sword: { front: "/lpc/weapon_dagger.png", behind: "/lpc/weapon_dagger_behind.png", tint: "#cfd8e4" },
  wyvernbone_blade: { front: "/lpc/weapon_dagger.png", behind: "/lpc/weapon_dagger_behind.png", tint: "#ecdcb8" },
  elder_blade: { front: "/lpc/weapon_dagger.png", behind: "/lpc/weapon_dagger_behind.png", tint: "#6ab858" },
  // The lair bosses' unique weapons (src/lib/lairs.ts).
  glacier_blade: { front: "/lpc/weapon_dagger.png", behind: "/lpc/weapon_dagger_behind.png", tint: "#a8e8ff" },
  drakefire_blade: { front: "/lpc/weapon_dagger.png", behind: "/lpc/weapon_dagger_behind.png", tint: "#ff7a3a" },
  hollow_edge: { front: "/lpc/weapon_dagger.png", behind: "/lpc/weapon_dagger_behind.png", tint: "#9a6aff" },
  axe: { front: "/lpc/weapon_axe.png", behind: "/lpc/weapon_axe_behind.png" },
  // Bows (src/lib/progression.ts BOWS): carried while walking, drawn when shooting.
  short_bow: { front: "/lpc/weapon_bow.png", behind: "/lpc/weapon_bow_behind.png" },
  recurve_bow: { front: "/lpc/weapon_bow.png", behind: "/lpc/weapon_bow_behind.png", tint: "#8a4a2c" },
  great_bow: { front: "/lpc/weapon_bow.png", behind: "/lpc/weapon_bow_behind.png", tint: "#d8a838" },
  runed_bow: { front: "/lpc/weapon_bow.png", behind: "/lpc/weapon_bow_behind.png", tint: "#8a6ad8" },
  dunecaller_bow: { front: "/lpc/weapon_bow.png", behind: "/lpc/weapon_bow_behind.png", tint: "#e8c070" },
};
export const HAIR_STYLES = ["plain", "bob", "spiked", "messy1", "long", "bangs", "afro", "buzzcut", "bedhead", "cowlick"];

/** The skin colour the body and head sheets are drawn in. */
const BASE_SKIN = [0xf1, 0xc9, 0xa5];

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The held weapon (with LPC art) among a character's equipped item keys. */
export function weaponOf(equipped: readonly string[] | undefined): string | undefined {
  return equipped?.find((k) => k in WEAPON_LAYERS);
}

/** Resolve the catalog entries for whatever the player is wearing. */
function resolveCosmetics(eq: EquippedCosmetics | undefined) {
  const out: { item: NonNullable<ReturnType<typeof cosmoByKey>>; slot: CosmeticSlot }[] = [];
  if (!eq) return out;
  for (const slot of Object.keys(eq) as CosmeticSlot[]) {
    const key = eq[slot];
    if (!key) continue;
    const item = cosmoByKey(key);
    if (item) out.push({ item, slot });
  }
  return out;
}

/**
 * Z-order of the base sprite body. The catalog contributes additional
 * layers (glasses over eyes, apron over torso, hat over hair).
 */
export function layersFor(a: Appearance, eq?: EquippedCosmetics, weapon?: string): LpcLayer[] {
  const b = a.body === "female" ? "female" : "male";
  const w = weapon ? WEAPON_LAYERS[weapon] : undefined;
  const cos = resolveCosmetics(eq);
  const glasses = cos.find((c) => c.slot === "glasses")?.item;
  const outfit = cos.find((c) => c.slot === "outfit")?.item;
  const hat = cos.find((c) => c.slot === "hat")?.item;
  const worn = (item: { assetRef: string; tintColor?: string | null }): LpcLayer => ({ src: item.assetRef, tint: item.tintColor ?? undefined, mode: "recolor" });

  return [
    // The part of the weapon that passes behind the body (e.g. facing up).
    ...(w ? [{ src: w.behind, tint: w.tint, mode: "recolor" as const }] : []),
    { src: `/lpc/body_${b}.png`, tint: a.skin, mode: "skin" },
    { src: `/lpc/head_${b}.png`, tint: a.skin, mode: "skin" },
    { src: `/lpc/eyes.png` },
    // Glasses render on the face, between the head/eyes and the legs/torso;
    // a tintColor recolours sponsor-branded glasses to the brand colour.
    ...(glasses ? [worn(glasses)] : []),
    { src: `/lpc/legs_${b}.png`, tint: a.pantsColor, mode: "recolor" },
    { src: `/lpc/feet_${b}.png` },
    { src: `/lpc/torso_${b}.png`, tint: a.shirtColor, mode: "recolor" },
    // Aprons/overtunics render over the torso, before the hair.
    ...(outfit ? [worn(outfit)] : []),
    { src: `/lpc/hair_${HAIR_STYLES.includes(a.hair) ? a.hair : "plain"}.png`, tint: a.hairColor, mode: "recolor" },
    // Hats render last so they sit on top of the hair.
    ...(hat ? [worn(hat)] : []),
    // The weapon in hand renders over everything else.
    ...(w ? [{ src: w.front, tint: w.tint, mode: "recolor" as const }] : []),
  ];
}

/** Recolour RGBA pixels in place: skin scales the base skin tone; recolor
 *  maps each pixel's luminance onto the target hue, leaving dark outlines. */
export function tintPixels(d: Uint8ClampedArray | Uint8Array, tint: string, mode: "skin" | "recolor"): void {
  const [tr, tg, tb] = hexToRgb(tint);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (mode === "skin") {
      d[i] = Math.min(255, (r * tr) / BASE_SKIN[0]);
      d[i + 1] = Math.min(255, (g * tg) / BASE_SKIN[1]);
      d[i + 2] = Math.min(255, (b * tb) / BASE_SKIN[2]);
    } else {
      // Outline pixels (very dark) stay dark; everything else gets the target hue by luminance.
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      if (lum < 40) continue;
      const k = lum / 150; // ~mid-tone maps to the target color
      d[i] = Math.min(255, tr * k);
      d[i + 1] = Math.min(255, tg * k);
      d[i + 2] = Math.min(255, tb * k);
    }
  }
}
