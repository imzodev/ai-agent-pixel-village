import type Phaser from "phaser";
import { RELIC_ART } from "@/lib/relicArt";
import { buildingTextureKey, makeBuildingTexture } from "./buildings";
import type { BuildingView } from "./buildings";
import { ANIMAL_SPRITES } from "./animalSprites";

export type { BuildingView };
export { buildingTextureKey, makeBuildingTexture };

type Scene = Phaser.Scene;

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

export function pixelTexture(scene: Scene, key: string, rows: string[], palette: Record<string, string>, scale = 2) {
  if (scene.textures.exists(key)) return;
  const w = Math.max(...rows.map((r) => r.length));
  const { c, ctx } = canvas(w * scale, rows.length * scale);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = palette[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  scene.textures.addCanvas(key, c);
}

// ---------- Animals & creatures ----------
// Quick procedural placeholders for creatures without a spritesheet yet
// (rows of palette letters, drawn at 2x). Every current animal and enemy
// has a real sheet in src/game/animalSprites.ts; species listed there are
// skipped below so a placeholder can never overwrite the sheet.
const CREATURES: Record<string, { rows: string[]; palette: Record<string, string> }> = {};

export function makeCreatureTextures(scene: Scene) {
  for (const [k, def] of Object.entries(CREATURES)) {
    if (ANIMAL_SPRITES[k]) continue;
    pixelTexture(scene, `cr_${k}`, def.rows, def.palette, 2);
  }
}

// ---------- Nodes / props ----------

// Per-kind crop configuration (stage count, regrowth timing, sprite
// frames) lives in src/lib/crops.ts so the server (sim worker, action
// route) and client (texture frame registration, snapshot assembly)
// agree on the same source of truth.

import { CROP_KINDS, NODE_SHEETS } from "@/lib/crops";

const LPC_CROPS_KEY = "lpc_crops";

export function loadPropSprites(scene: Scene): void {
  // Master LPC crops spritesheet. One texture, many sub-region frames —
  // crops don't need per-state PNGs.
  scene.load.image(LPC_CROPS_KEY, "/assets/food/crops.png");
  // Other node sheets (e.g. choppable trees).
  for (const [key, url] of Object.entries(NODE_SHEETS)) scene.load.image(key, url);
}

/**
 * Registers named sub-region frames on each kind's sheet (`lpc_crops`
 * unless the kind names its own `sheet`). Call
 * once during scene create, after preload has finished. Each crop kind
 * gets one frame per stage — `kind_stage_0` (picked) through
 * `kind_stage_(stages-1)` (fully grown) — that Phaser renders at the
 * frame's native w×h.
 */
export function registerCropFrames(scene: Scene): void {
  for (const [kind, cfg] of Object.entries(CROP_KINDS)) {
    const tex = scene.textures.get(cfg.sheet ?? LPC_CROPS_KEY);
    if (!tex) continue;
    cfg.frames.forEach((rect, stage) => {
      tex.add(`${kind}_stage_${stage}`, 0, rect.x, rect.y, rect.w, rect.h);
    });
  }
}

/**
 * Returns the frame name (on `nodeSheetKey(kind)`) to use for a node, or `null`
 * if the kind falls back to its own procedural `node_<kind>` sprite.
 */
export function nodeFrameKey(kind: string, stage: number): string | null {
  const cfg = CROP_KINDS[kind];
  if (!cfg || cfg.frames.length === 0) return null;
  const clamped = Math.max(0, Math.min(stage, cfg.frames.length - 1));
  return `${kind}_stage_${clamped}`;
}

/** Texture a node's frames are cut from (see `nodeFrameKey`). */
export function nodeSheetKey(kind: string): string {
  return CROP_KINDS[kind]?.sheet ?? LPC_CROPS_KEY;
}

/**
 * Procedural texture key for a resource node. Used for every node kind
 * that doesn't have an `lpc_crops` frame (see `nodeFrameKey`).
 */
export function nodeTextureKey(kind: string): string {
  return `node_${kind}`;
}

export function makePropTextures(scene: Scene) {
  pixelTexture(scene, "node_berry_bush", ["...gggg....", "..gggpgg...", ".gpgggggg..", ".ggggpggpg.", "gggpggggggg", ".ggggggpgg.", "..ggpgggg..", "....dd....."], { g: "#4e9a51", p: "#7a4fb5", d: "#5a3a22" }, 2);
  pixelTexture(scene, "node_herb_patch", ["..g...g..g.", ".gg..gg.gg.", ".g.g.g.g.g.", "..g..g..g..", "..g..g..g..", ".dddddddddd"], { g: "#6fc36a", d: "#8a6a4a" }, 2);
  pixelTexture(scene, "node_rock", ["...sss....", "..sssss...", ".sssssss..", "sssslssss.", "sssssssss.", ".ddddddd.."], { s: "#9a9aa2", l: "#c9c9d0", d: "#5a5a62" }, 2);
  pixelTexture(scene, "node_mushroom_ring", ["rr...rr...", "rrr..rrr.r", ".w....w..r", ".w..rr.w.w", "....rrr...", ".....w...."], { r: "#d94a3a", w: "#f5efe4" }, 2);
  pixelTexture(scene, "rain", ["b", "b", "b", "b", "b", "b"], { b: "#bcdcf5" }, 1);
  pixelTexture(scene, "snow", [".ww.", "wwww", "wwww", ".ww."], { w: "#ffffff" }, 1);
  pixelTexture(scene, "shadow", ["..oooo..", ".oooooo.", "oooooooo", ".oooooo.", "..oooo.."], { o: "rgba(0,0,0,0.25)" }, 3);
  // A hidden relic's glint: a small four-pointed star.
  pixelTexture(scene, "relic_glint", ["...w...", "...w...", "..wyw..", "wwyyyww", "..wyw..", "...w...", "...w..."], { w: "#fffbe0", y: "#ffd54a" }, 2);
  // The relics themselves, one look per set (src/lib/relicArt.ts).
  for (const [set, art] of Object.entries(RELIC_ART)) pixelTexture(scene, `relic_${set}`, [...art.rows], art.palette, 2);
  // An enemy's bolt (shades, wisps).
  pixelTexture(scene, "fx_bolt", ["..pp..", ".pPPp.", "pPWWPp", "pPWWPp", ".pPPp.", "..pp.."], { p: "#3a1a5a", P: "#8a4ad8", W: "#e8d8ff" }, 2);
  // An arrow in flight (pointing right; rotated toward its target).
  pixelTexture(scene, "fx_arrow", ["w.......g.", "wbbbbbbbGg", "w.......g."], { w: "#f4f0e4", b: "#8a5a32", g: "#a8acb4", G: "#5c6068" }, 1);
  // Over whatever E would act on (src/game/interactTarget.ts): a small chevron.
  pixelTexture(scene, "fx_target", ["kkkkkkk", "kwwwwwk", ".kwwwk.", "..kwk..", "...k..."], { k: "#2a1a0e", w: "#ffe27a" }, 2);
  pixelTexture(scene, "marker", ["...y...", "..yyy..", ".yyyyy.", "...y...", "...y..."], { y: "#fff176" }, 2);
}

// ---------- Trees ----------
export function makeTreeTextures(scene: Scene) {
  const defs = [
    { key: "tree_0", leaf: "#5d9c59", dark: "#3f7a3c", kind: "round" },
    { key: "tree_1", leaf: "#3f7a5a", dark: "#2c5a40", kind: "pine" },
    { key: "tree_2", leaf: "#e8a0b8", dark: "#c97a98", kind: "round" },
  ];
  for (const d of defs) {
    if (scene.textures.exists(d.key)) continue;
    const { c, ctx } = canvas(48, 64);
    ctx.fillStyle = "#6b4a2a";
    ctx.fillRect(20, 44, 8, 18);
    if (d.kind === "pine") {
      for (let i = 0; i < 3; i++) {
        const y = 12 + i * 12, w = 16 + i * 8;
        ctx.fillStyle = d.dark; ctx.beginPath(); ctx.moveTo(24, y - 12); ctx.lineTo(24 + w / 2, y + 10); ctx.lineTo(24 - w / 2, y + 10); ctx.fill();
        ctx.fillStyle = d.leaf; ctx.beginPath(); ctx.moveTo(24, y - 10); ctx.lineTo(24 + w / 2 - 4, y + 8); ctx.lineTo(24 - w / 2 + 4, y + 8); ctx.fill();
      }
    } else {
      ctx.fillStyle = d.dark;
      ctx.beginPath(); ctx.arc(24, 28, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = d.leaf;
      ctx.beginPath(); ctx.arc(20, 24, 15, 0, Math.PI * 2); ctx.arc(30, 20, 12, 0, Math.PI * 2); ctx.arc(28, 32, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath(); ctx.arc(17, 18, 5, 0, Math.PI * 2); ctx.fill();
    }
    scene.textures.addCanvas(d.key, c);
  }
}

export function makeAllTextures(scene: Scene) {
  // The procedural `ground` canvas (plaza cobbles, paths, pond, fountain,
  // fence pens) is no longer drawn — the Tiled chunk maps render the entire
  // visible terrain. Trees, creatures and node textures are still needed
  // because the chunk maps only carry static tiles.
  makeTreeTextures(scene);
  makeCreatureTextures(scene);
  makePropTextures(scene);
}

