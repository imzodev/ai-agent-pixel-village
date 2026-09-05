// Universal LPC spritesheet compositing. Layers are 576x256 walk sheets
// (9 frames x 4 rows: up, left, down, right; 64x64 per frame).
import type { Appearance } from "@/db/schema";

export const FRAME = 64;
export const ROWS = { up: 0, left: 1, down: 2, right: 3 } as const;
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

export function layersFor(a: Appearance): Layer[] {
  const b = a.body === "female" ? "female" : "male";
  return [
    { src: `/lpc/body_${b}.png`, tint: a.skin, mode: "skin" },
    { src: `/lpc/head_${b}.png`, tint: a.skin, mode: "skin" },
    { src: `/lpc/eyes.png` },
    { src: `/lpc/legs_${b}.png`, tint: a.pantsColor, mode: "recolor" },
    { src: `/lpc/feet_${b}.png` },
    { src: `/lpc/torso_${b}.png`, tint: a.shirtColor, mode: "recolor" },
    { src: `/lpc/hair_${HAIR_STYLES.includes(a.hair) ? a.hair : "plain"}.png`, tint: a.hairColor, mode: "recolor" },
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

export function appearanceKey(a: Appearance) {
  return `lpc_${a.body}_${a.skin}_${a.hair}_${a.hairColor}_${a.shirtColor}_${a.pantsColor}`.replace(/#/g, "");
}

/** Compose all layers into one 576x256 sheet. Cached by appearance. */
export function composeCharacter(a: Appearance): Promise<HTMLCanvasElement> {
  const key = appearanceKey(a);
  let p = composedCache.get(key);
  if (!p) {
    p = (async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 576; canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      for (const layer of layersFor(a)) {
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
export async function drawPreview(target: HTMLCanvasElement, a: Appearance, dir: keyof typeof ROWS = "down", frame = 0, scale = 3) {
  const sheet = await composeCharacter(a);
  target.width = FRAME * scale; target.height = FRAME * scale;
  const ctx = target.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(sheet, frame * FRAME, ROWS[dir] * FRAME, FRAME, FRAME, 0, 0, FRAME * scale, FRAME * scale);
}
