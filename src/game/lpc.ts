// Universal LPC spritesheet compositing. Layer sheets are 576x512
// (scripts/fetch-lpc.mjs), 64x64 frames, rows up/left/down/right:
//   rows 0-3: walk  — 9 frames (frame 0 = standing)
//   rows 4-7: slash — 6 frames (the attack swing)
import type { Appearance } from "@/db/schema";
import { COSMETIC_CATALOG, cosmoByKey } from "@/lib/cosmetics";
import type { CosmeticSlot, EquippedCosmetics } from "@/types/cosmetic";

// Re-exported for callers that previously imported the type from this module.
export type { EquippedCosmetics };

export const FRAME = 64;
export const ROWS = { up: 0, left: 1, down: 2, right: 3 } as const;
/** Composed sheet size and the slash block (see the header comment). */
export const SHEET_W = 576;
export const SHEET_H = 512;
export const SLASH_ROW = 4;
export const SLASH_FRAMES = 6;
/** Held items with LPC art. The Wooden Sword uses the dagger, tinted wood;
 *  the axe (scripts/draw-axe.mjs) is shown only while chopping. */
export const WEAPON_LAYERS: Record<string, { front: string; behind: string; tint?: string }> = {
  wooden_sword: { front: "/lpc/weapon_dagger.png", behind: "/lpc/weapon_dagger_behind.png", tint: "#b07a44" },
  axe: { front: "/lpc/weapon_axe.png", behind: "/lpc/weapon_axe_behind.png" },
};
export const HAIR_STYLES = ["plain", "bob", "spiked", "messy1", "long", "bangs", "afro", "buzzcut", "bedhead", "cowlick"];
export const SKIN_TONES = ["#f1c9a5", "#e8c39e", "#d9a066", "#c68e5a", "#a86a3d", "#7a4a2a", "#5a3a22"];
export const HAIR_COLORS = ["#2b1d14", "#5a3a1a", "#8c5a2b", "#c94f2a", "#e8c14a", "#dcdcdc", "#4a6fa5", "#b04a8a", "#3d8a5a"];
export const CLOTH_COLORS = ["#4a7c59", "#e76f51", "#f4a261", "#2a9d8f", "#264653", "#e9c46a", "#7b5ea7", "#d94f70", "#f7e7d3", "#3a3a4a", "#7a4a2a", "#5b7db1"];

const BASE_SKIN = [0xf1, 0xc9, 0xa5];
const imgCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string) {
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("failed " + src));
      img.src = src;
    });
    imgCache.set(src, p);
  }
  return p;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

type Layer = { src: string; tint?: string; mode?: "skin" | "recolor" };

/** Resolve the catalog entries for whatever the player is wearing. */
function resolveCosmetics(eq: EquippedCosmetics | undefined) {
  const out: { item: ReturnType<typeof cosmoByKey>; slot: CosmeticSlot }[] = [];
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
export function layersFor(a: Appearance, eq?: EquippedCosmetics, weapon?: string): Layer[] {
  const b = a.body === "female" ? "female" : "male";
  const w = weapon ? WEAPON_LAYERS[weapon] : undefined;
  const cos = resolveCosmetics(eq);
  const glasses = cos.find((c) => c.slot === "glasses")?.item;
  const outfit = cos.find((c) => c.slot === "outfit")?.item;
  const hat = cos.find((c) => c.slot === "hat")?.item;

  return [
    // The part of the weapon that passes behind the body (e.g. facing up).
    ...(w ? [{ src: w.behind, tint: w.tint, mode: "recolor" as const }] : []),
    { src: `/lpc/body_${b}.png`, tint: a.skin, mode: "skin" },
    { src: `/lpc/head_${b}.png`, tint: a.skin, mode: "skin" },
    { src: `/lpc/eyes.png` },
    // Glasses render on the face, between the head/eyes and the legs/torso.
    // Glasses don't use a skin recolor; if a tintColor is set, recolor it
    // so sponsor-branded glasses match the brand color.
    ...(glasses
      ? [
          {
            src: glasses.assetRef,
            tint: glasses.tintColor ?? undefined,
            mode: "recolor" as const,
          },
        ]
      : []),
    { src: `/lpc/legs_${b}.png`, tint: a.pantsColor, mode: "recolor" },
    { src: `/lpc/feet_${b}.png` },
    { src: `/lpc/torso_${b}.png`, tint: a.shirtColor, mode: "recolor" },
    // Aprons/overtunics render over the torso, before the hair.
    ...(outfit
      ? [
          {
            src: outfit.assetRef,
            tint: outfit.tintColor ?? undefined,
            mode: "recolor" as const,
          },
        ]
      : []),
    { src: `/lpc/hair_${HAIR_STYLES.includes(a.hair) ? a.hair : "plain"}.png`, tint: a.hairColor, mode: "recolor" },
    // Hats render last so they sit on top of the hair.
    ...(hat
      ? [
          {
            src: hat.assetRef,
            tint: hat.tintColor ?? undefined,
            mode: "recolor" as const,
          },
        ]
      : []),
    // The weapon in hand renders over everything else.
    ...(w ? [{ src: w.front, tint: w.tint, mode: "recolor" as const }] : []),
  ];
}

function tintLayer(img: HTMLImageElement, tint: string, mode: "skin" | "recolor") {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const d = data.data;
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
  ctx.putImageData(data, 0, 0);
  return c;
}

const composedCache = new Map<string, Promise<HTMLCanvasElement>>();

/** Cache key includes appearance and equipped cosmetics so re-equipping
 *  recomposes. The catalog is cheap, so the key is just the visible gear. */
export function appearanceKey(a: Appearance, eq?: EquippedCosmetics, weapon?: string) {
  const cos = eq ? Object.entries(eq).sort().flat().join("|") : "";
  const w = weapon && WEAPON_LAYERS[weapon] ? `__w_${weapon}` : "";
  return `lpc_${a.body}_${a.skin}_${a.hair}_${a.hairColor}_${a.shirtColor}_${a.pantsColor}__${cos}${w}`.replace(/#/g, "");
}

/** The held weapon (with LPC art) among a character's equipped item keys. */
export function weaponOf(equipped: readonly string[] | undefined): string | undefined {
  return equipped?.find((k) => k in WEAPON_LAYERS);
}

/** Compose all layers into one sheet (walk + slash). Cached by look + gear. */
export function composeCharacter(a: Appearance, eq?: EquippedCosmetics, weapon?: string): Promise<HTMLCanvasElement> {
  const key = appearanceKey(a, eq, weapon);
  let p = composedCache.get(key);
  if (!p) {
    p = (async () => {
      const canvas = document.createElement("canvas");
      canvas.width = SHEET_W; canvas.height = SHEET_H;
      const ctx = canvas.getContext("2d")!;
      for (const layer of layersFor(a, eq, weapon)) {
        try {
          const img = await loadImage(layer.src);
          ctx.drawImage(layer.tint && layer.mode ? tintLayer(img, layer.tint, layer.mode) : img, 0, 0);
        } catch {
          /* missing layer: skip */
        }
      }
      return canvas;
    })();
    composedCache.set(key, p);
  }
  return p;
}

/** Draw a single frame (for previews). */
export async function drawPreview(
  target: HTMLCanvasElement,
  a: Appearance,
  eq: EquippedCosmetics | undefined,
  dir: keyof typeof ROWS = "down",
  frame = 0,
  scale = 3,
) {
  const sheet = await composeCharacter(a, eq);
  target.width = FRAME * scale; target.height = FRAME * scale;
  const ctx = target.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(sheet, frame * FRAME, ROWS[dir] * FRAME, FRAME, FRAME, 0, 0, FRAME * scale, FRAME * scale);
}
