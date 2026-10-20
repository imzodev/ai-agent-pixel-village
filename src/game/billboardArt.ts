// Billboards in the world (src/lib/billboards.ts): the board from
// public/assets/billboard.png (scripts/draw-billboard.mjs) with the
// advertiser's poster in its window, or a paper "your ad here" notice.

import type Phaser from "phaser";
import { DEPTH_CHAR_BASE } from "./worldTilemap";
import { gameFont } from "./gameFont";
import { loadImage } from "./lpc";
import { BILLBOARD_TIERS, BOARD_H, BOARD_W, POSTER_WINDOW, posterUrl, spotFootY } from "@/lib/billboards";
import type { BillboardSnapshot, BillboardSpotDef } from "@/types/billboard";

export const BILLBOARD_TEXTURE = "billboard";
export const BILLBOARD_SHEET = "/assets/billboard.png";
const FW = BOARD_W * 16, FH = BOARD_H * 16;

/** Cut the sheet into its frames (once the image has loaded). */
export function registerBillboardFrames(scene: Phaser.Scene): void {
  const tex = scene.textures.get(BILLBOARD_TEXTURE);
  if (!tex || tex.key === "__MISSING") return;
  tex.add("bb_wood", 0, 0, 0, FW, FH);
  tex.add("bb_gilt", 0, FW, 0, FW, FH);
  tex.add("bb_notice", 0, FW * 2 + POSTER_WINDOW.x, POSTER_WINDOW.y, POSTER_WINDOW.w, POSTER_WINDOW.h);
}

/** What makes a board look different (redrawn only when this changes). */
export const billboardSig = (b: BillboardSnapshot): string => `${b.rentalId ?? ""}|${b.poster ?? ""}`;

/** A poster's texture key (one per file: the name is its content hash). */
const posterKey = (file: string) => `bb:${file}`;

/**
 * Draw a board: the frame, then the poster (loaded once, then shared) or the
 * notice with its price. `current` says whether these objects are still the
 * ones on screen when a poster finishes loading.
 */
export function buildBillboard(scene: Phaser.Scene, def: BillboardSpotDef, snap: BillboardSnapshot, current: () => boolean): Phaser.GameObjects.GameObject[] {
  const x = def.tx * 16, y = def.ty * 16;
  const depth = DEPTH_CHAR_BASE + spotFootY(def);
  const frame = scene.add.image(x, y, BILLBOARD_TEXTURE, def.tier === "plaza" ? "bb_gilt" : "bb_wood").setOrigin(0, 0).setDepth(depth);
  const out: Phaser.GameObjects.GameObject[] = [frame];
  const wx = x + POSTER_WINDOW.x, wy = y + POSTER_WINDOW.y;
  if (snap.poster) {
    const key = posterKey(snap.poster);
    const place = () => {
      if (!current() || !scene.sys?.isActive() || !scene.textures.exists(key)) return;
      out.push(scene.add.image(wx, wy, key).setOrigin(0, 0).setDisplaySize(POSTER_WINDOW.w, POSTER_WINDOW.h).setDepth(depth + 0.5));
    };
    if (scene.textures.exists(key)) place();
    else loadImage(posterUrl(snap.poster)).then((img) => {
      if (!scene.sys?.isActive()) return;
      if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
      place();
    }).catch(() => undefined);
  } else {
    out.push(scene.add.image(wx, wy, BILLBOARD_TEXTURE, "bb_notice").setOrigin(0, 0).setDepth(depth + 0.5));
    const text = { fontFamily: gameFont(), fontStyle: "bold", color: "#3a2a1e", align: "center" } as const;
    out.push(scene.add.text(wx + POSTER_WINDOW.w / 2, wy + 12, "YOUR AD HERE", { ...text, fontSize: "11px" }).setOrigin(0.5, 0.5).setDepth(depth + 0.6));
    out.push(scene.add.text(wx + POSTER_WINDOW.w / 2, wy + 22, `$${BILLBOARD_TIERS[def.tier].priceCents / 100}/mo · tap me`, { ...text, fontSize: "8px", color: "#6a4a30" }).setOrigin(0.5, 0.5).setDepth(depth + 0.6));
  }
  return out;
}
