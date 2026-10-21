// Whistle's sheepfold in the plaza (src/lib/whistle/fold.ts): the fold from
// public/assets/sheepfold.png (scripts/draw-sheepfold.mjs), with "WHISTLE"
// and the course number written on its sign.

import type Phaser from "phaser";
import { DEPTH_CHAR_BASE } from "./worldTilemap";
import { gameFont } from "./gameFont";
import { FOLD, FOLD_H, FOLD_W } from "@/lib/whistle/fold";
import { whistleDay, whistleNumber } from "@/lib/whistle/course";

export const SHEEPFOLD_TEXTURE = "sheepfold";
export const SHEEPFOLD_IMAGE = "/assets/sheepfold.png";

/** Draw the fold (once, at start); returns the objects and a zone to click. */
export function buildSheepfold(scene: Phaser.Scene): { objs: Phaser.GameObjects.GameObject[]; zone: Phaser.GameObjects.Zone } {
  const x = FOLD.tx * 16, y = FOLD.ty * 16;
  const depth = DEPTH_CHAR_BASE + (FOLD.ty + FOLD_H) * 16;
  const img = scene.add.image(x, y, SHEEPFOLD_TEXTURE).setOrigin(0, 0).setDepth(depth);
  const label = scene.add.text(x + (FOLD_W * 16) / 2, y + 8, `WHISTLE #${whistleNumber(whistleDay(Date.now()))}`, {
    fontFamily: gameFont(), fontStyle: "bold", fontSize: "8px", color: "#fff6d0", stroke: "#3a2a1e", strokeThickness: 2,
  }).setOrigin(0.5, 0.5).setResolution(3).setDepth(depth + 0.5);
  const zone = scene.add.zone(x, y, FOLD_W * 16, FOLD_H * 16).setOrigin(0, 0).setDepth(depth).setInteractive({ useHandCursor: true });
  return { objs: [img, label, zone], zone };
}
