// Universal LPC spritesheet compositing. Layer sheets are 832x768
// (scripts/fetch-lpc.mjs), 64x64 frames, rows up/left/down/right:
//   rows 0-3:  walk  — 9 frames (frame 0 = standing)
//   rows 4-7:  slash — 6 frames (the attack swing)
//   rows 8-11: shoot — 13 frames (drawing and loosing a bow)
import type { Appearance } from "@/db/schema";
import { HAIR_STYLES, WEAPON_LAYERS, layersFor, tintPixels } from "@/lib/lpcLayers";
import type { EquippedCosmetics } from "@/types/cosmetic";

// Re-exported for callers that previously imported these from this module
// (the layer stack itself lives in src/lib/lpcLayers.ts, shared with the server).
export type { EquippedCosmetics };
export { HAIR_STYLES, WEAPON_LAYERS, layersFor, weaponOf } from "@/lib/lpcLayers";

export const FRAME = 64;
export const ROWS = { up: 0, left: 1, down: 2, right: 3 } as const;
/** Composed sheet size and the slash block (see the header comment). */
export const SHEET_W = 832;
export const SHEET_H = 768;
export const SLASH_ROW = 4;
export const SLASH_FRAMES = 6;
export const SHOOT_ROW = 8;
export const SHOOT_FRAMES = 13;
/** The frame where the arrow leaves the string. */
export const SHOOT_RELEASE_FRAME = 9;
export const SKIN_TONES = ["#f1c9a5", "#e8c39e", "#d9a066", "#c68e5a", "#a86a3d", "#7a4a2a", "#5a3a22"];
export const HAIR_COLORS = ["#2b1d14", "#5a3a1a", "#8c5a2b", "#c94f2a", "#e8c14a", "#dcdcdc", "#4a6fa5", "#b04a8a", "#3d8a5a"];
export const CLOTH_COLORS = ["#4a7c59", "#e76f51", "#f4a261", "#2a9d8f", "#264653", "#e9c46a", "#7b5ea7", "#d94f70", "#f7e7d3", "#3a3a4a", "#7a4a2a", "#5b7db1"];
/** Default names offered at character creation. */
export const VILLAGER_NAMES = ["Fennel", "Juniper", "Bramble", "Sorrel", "Tansy", "Rowan", "Clover", "Basil", "Hazel", "Pip"];

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** A random villager look (character creation's "Surprise me"). */
export function randomAppearance(): Appearance {
  return {
    body: Math.random() < 0.5 ? "male" : "female",
    skin: pick(SKIN_TONES),
    hair: pick(HAIR_STYLES),
    hairColor: pick(HAIR_COLORS),
    shirtColor: pick(CLOTH_COLORS),
    pantsColor: pick(CLOTH_COLORS),
  };
}

export const randomVillagerName = () => pick(VILLAGER_NAMES);

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

function tintLayer(img: HTMLImageElement, tint: string, mode: "skin" | "recolor") {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  tintPixels(data.data, tint, mode);
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
