// The banner every owned lot flies beside its door (colour + emblem the owner
// picked, src/lib/lotBanner.ts) and a small name sign, so lots can be told
// apart from a distance. Yours gets a pulsing ring. Drawn in code, no sheet.

import type Phaser from "phaser";
import { LOT_COLORS, LOT_EMBLEMS } from "@/lib/lotBanner";
import type { LotSnapshot } from "@/types/garden";
import { gameFont } from "./gameFont";
import { LOT_LABELS } from "./lotLabels";
import { DEPTH_CHAR_BASE } from "./worldTilemap";

const POLE_H = 34;
const FLAG_W = 22;
const FLAG_H = 15;

/** Changes whenever the drawn banner would, so the scene redraws only then. */
export function lotBannerSignature(lot: LotSnapshot, mine: boolean): string {
  const b = lot.banner;
  return b && lot.owner ? `${lot.owner.id}:${lot.owner.name}:${b.color}:${b.emblem}:${b.x}:${b.y}:${mine}` : "";
}

/** Build the banner for an owned lot (call only when `lot.banner` and `lot.owner` exist). */
export function buildLotBanner(scene: Phaser.Scene, lot: LotSnapshot, mine: boolean): Phaser.GameObjects.Container {
  const b = lot.banner!;
  const owner = lot.owner!;
  const hex = parseInt(LOT_COLORS[b.color].hex.slice(1), 16);
  const x = b.x + 18, y = b.y; // beside the door
  const c = scene.add.container(x, y).setDepth(DEPTH_CHAR_BASE + y);

  if (mine) {
    const ring = scene.add.ellipse(0, -2, 34, 12, hex, 0.35).setStrokeStyle(1, hex, 0.9);
    scene.tweens.add({ targets: ring, scaleX: 1.25, scaleY: 1.25, alpha: 0.4, duration: 1100, yoyo: true, repeat: -1 });
    c.add(ring);
  }
  // pole, then the flag with a darker edge and the emblem on it
  c.add(scene.add.rectangle(0, -POLE_H / 2, 3, POLE_H, 0x5a3a22).setStrokeStyle(1, 0x2a1a10));
  c.add(scene.add.rectangle(FLAG_W / 2 + 1.5, -POLE_H + FLAG_H / 2, FLAG_W, FLAG_H, hex).setStrokeStyle(1, 0x1c100a));
  c.add(scene.add.text(FLAG_W / 2 + 1.5, -POLE_H + FLAG_H / 2, LOT_EMBLEMS[b.emblem].icon, { fontFamily: gameFont(), fontSize: "10px" }).setOrigin(0.5).setResolution(3));
  // name sign under the flag
  const L = LOT_LABELS[lot.kind];
  const label = mine ? L.yours : `${owner.name} · ${L.yours.replace(/^Your /, "")}`;
  const sign = scene.add.text(0, 4, label, { fontFamily: gameFont(), fontSize: "9px", fontStyle: "bold", color: mine ? "#d8ffd0" : "#fff4d8", stroke: "#1a1a1a", strokeThickness: 3 }).setOrigin(0.5, 0).setResolution(3);
  c.add(sign);
  return c;
}
