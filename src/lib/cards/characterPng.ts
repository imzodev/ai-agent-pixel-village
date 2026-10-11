// A player's character as a still PNG (standing, facing you), for share cards
// and the profile. The same LPC layer stack and recolouring the game uses
// (src/lib/lpcLayers.ts), composed with sharp. Server only.

import path from "node:path";
import sharp from "sharp";
import { layersFor, tintPixels } from "@/lib/lpcLayers";
import type { Appearance } from "@/types/domain";
import type { EquippedCosmetics } from "@/types/cosmetic";

const FRAME = 64;
/** Row 2 (facing down), frame 0 (standing) of an LPC sheet. */
const STAND = { left: 0, top: 2 * FRAME, width: FRAME, height: FRAME };

const frameCache = new Map<string, Promise<Buffer | null>>();
/** One layer's standing frame as raw RGBA (null when the sheet is missing). */
function frameOf(src: string): Promise<Buffer | null> {
  let p = frameCache.get(src);
  if (!p) {
    p = sharp(path.join(process.cwd(), "public", src)).extract(STAND).ensureAlpha().raw().toBuffer().catch(() => null);
    frameCache.set(src, p);
  }
  return p;
}

const pngCache = new Map<string, Promise<Buffer>>();

/** The character's standing frame, scaled up `scale`× with crisp pixels (64·scale square). */
export function characterPng(a: Appearance, eq?: EquippedCosmetics, weapon?: string, scale = 5): Promise<Buffer> {
  const key = JSON.stringify([a, eq ?? null, weapon ?? null, scale]);
  let p = pngCache.get(key);
  if (!p) {
    p = (async () => {
      const out = Buffer.alloc(FRAME * FRAME * 4);
      for (const layer of layersFor(a, eq, weapon)) {
        const src = await frameOf(layer.src);
        if (!src) continue; // missing layer: skip, as the game does
        const px = Uint8Array.from(src);
        if (layer.tint && layer.mode) tintPixels(px, layer.tint, layer.mode);
        over(out, px);
      }
      return sharp(out, { raw: { width: FRAME, height: FRAME, channels: 4 } })
        .resize(FRAME * scale, FRAME * scale, { kernel: "nearest" })
        .png()
        .toBuffer();
    })();
    if (pngCache.size > 500) pngCache.clear();
    pngCache.set(key, p);
  }
  return p;
}

/** Alpha-composite `top` over `base` (both straight RGBA, same size). */
function over(base: Uint8Array, top: Uint8Array): void {
  for (let i = 0; i < base.length; i += 4) {
    const a = top[i + 3] / 255;
    if (a === 0) continue;
    const b = base[i + 3] / 255;
    const outA = a + b * (1 - a);
    for (let c = 0; c < 3; c++) base[i + c] = Math.round((top[i + c] * a + base[i + c] * b * (1 - a)) / outA);
    base[i + 3] = Math.round(outA * 255);
  }
}
