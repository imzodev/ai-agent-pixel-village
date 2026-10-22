// The arcade's spots in the village (src/lib/arcade/spots.ts): Whistle's
// sheepfold (public/assets/sheepfold.png, scripts/draw-sheepfold.mjs),
// Harvest Haul's cart (public/assets/haulstall.png, scripts/draw-haul-stall.mjs)
// and Fishing Derby's jetty (public/assets/derbyjetty.png, scripts/draw-derby-jetty.mjs),
// each with its game's name and today's number written on its sign.

import type Phaser from "phaser";
import { DEPTH_CHAR_BASE } from "./worldTilemap";
import { gameFont } from "./gameFont";
import { courseNumber } from "@/lib/arcade/games";
import { arcadeDay } from "@/lib/arcade/days";
import type { ArcadeGameKey, ArcadeSpot } from "@/types/arcade";

/** Each game's picture (loaded in textures.ts) and the words on its sign. */
export const ARCADE_ART: Record<ArcadeGameKey, { texture: string; image: string; sign: string }> = {
  whistle: { texture: "arcade_whistle", image: "/assets/sheepfold.png", sign: "WHISTLE" },
  haul: { texture: "arcade_haul", image: "/assets/haulstall.png", sign: "HARVEST HAUL" },
  derby: { texture: "arcade_derby", image: "/assets/derbyjetty.png", sign: "FISHING DERBY" },
};

/** Draw a spot (once, at start); returns its objects and a zone to click. */
export function buildArcadeSpot(scene: Phaser.Scene, s: ArcadeSpot): { objs: Phaser.GameObjects.GameObject[]; zone: Phaser.GameObjects.Zone } {
  const art = ARCADE_ART[s.game];
  const x = s.tx * 16, y = s.ty * 16, w = s.w * 16, h = s.h * 16;
  const depth = DEPTH_CHAR_BASE + y + h;
  const img = scene.add.image(x, y, art.texture).setOrigin(0, 0).setDepth(depth);
  const label = scene.add.text(x + w / 2, y + 8, `${art.sign} #${courseNumber(s.game, arcadeDay(Date.now()))}`, {
    fontFamily: gameFont(), fontStyle: "bold", fontSize: "8px", color: "#fff6d0", stroke: "#3a2a1e", strokeThickness: 2,
  }).setOrigin(0.5, 0.5).setResolution(3).setDepth(depth + 0.5);
  const zone = scene.add.zone(x, y, w, h).setOrigin(0, 0).setDepth(depth).setInteractive({ useHandCursor: true });
  return { objs: [img, label, zone], zone };
}


