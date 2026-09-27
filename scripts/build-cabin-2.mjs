#!/usr/bin/env node
// Build "Cabin Two": a variant of public/buildings/cabin_1.json with a teal
// shingle roof and stacked-log walls, baked into its own spritesheet.
//
//   node scripts/build-cabin-2.mjs
//
// Writes:
//   public/assets/Cabin2.png        — tileset (16×16 tiles) with every tile
//                                     the cabin uses, deduplicated
//   public/buildings/cabin_2.json   — Tiled template, same layer layout as
//                                     cabin_1 (so Y-sorting, collision and
//                                     the door work the same), referencing
//                                     only the Cabin2 tileset
//
// The art comes from the existing tilesets (Roofs.png has a teal version
// of the A-frame roof 8 columns right of the brown one; Walls.png has a
// stacked-log version of the plaster wall panel 18 columns left of it), so
// it matches the rest of the village. The "Cabin2" tileset must be listed
// in TILESET_FILES (src/game/worldTilemap.ts) so the game preloads it.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const T = 16;
const SHEET_COLS = 8;
const SRC = "public/buildings/cabin_1.json";
const OUT_JSON = "public/buildings/cabin_2.json";
const OUT_PNG = "public/assets/Cabin2.png";
// Data-only layers: not rendered, only "non-zero means blocked / door".
const MARKER_LAYERS = new Set(["Collision", "Interactive"]);

const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
const sets = [...src.tilesets].sort((a, b) => a.firstgid - b.firstgid);
const tilesetOf = (gid) => sets.filter((t) => t.firstgid <= gid).at(-1);

/** The Cabin Two look, as a remap of Cabin One's tiles. */
function remap(gid) {
  const ts = tilesetOf(gid);
  const i = gid - ts.firstgid;
  let r = Math.floor(i / ts.columns);
  let c = i % ts.columns;
  if (ts.name === "Roofs" && c < 8) c += 8; // brown planks → teal shingles
  if (ts.name === "Walls" && r >= 8 && r <= 10 && c >= 19 && c <= 22) c -= 18; // plaster → stacked logs
  return ts.firstgid + r * ts.columns + c;
}

// Decoded tileset images, loaded on demand.
const images = new Map();
async function tilesetImage(ts) {
  if (!images.has(ts.name)) {
    const file = path.join("public/assets", path.basename(ts.image));
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    images.set(ts.name, { data, width: info.width });
  }
  return images.get(ts.name);
}
async function tilePixels(gid) {
  const ts = tilesetOf(gid);
  const img = await tilesetImage(ts);
  const i = gid - ts.firstgid;
  const x0 = (i % ts.columns) * T;
  const y0 = Math.floor(i / ts.columns) * T;
  const out = Buffer.alloc(T * T * 4);
  for (let y = 0; y < T; y++) img.data.copy(out, y * T * 4, ((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + T) * 4);
  return out;
}

// Bake: every distinct tile image gets one slot in the new sheet.
const slots = []; // pixel buffers
const slotByKey = new Map();
async function slotFor(gid) {
  const px = await tilePixels(remap(gid));
  const key = px.toString("base64");
  if (!slotByKey.has(key)) {
    slotByKey.set(key, slots.length);
    slots.push(px);
  }
  return slotByKey.get(key) + 1; // local gid (firstgid 1)
}

const layers = [];
for (const layer of src.layers) {
  if (layer.data.some((g) => g > 0x1fffffff)) throw new Error(`${layer.name}: flipped tiles are not supported`);
  const data = [];
  for (const gid of layer.data) {
    if (!gid) data.push(0);
    else if (MARKER_LAYERS.has(layer.name)) data.push(1);
    else data.push(await slotFor(gid));
  }
  layers.push({ ...layer, data });
}

const rows = Math.ceil(slots.length / SHEET_COLS);
const width = SHEET_COLS * T;
const height = rows * T;
const sheet = Buffer.alloc(width * height * 4);
slots.forEach((px, s) => {
  const x0 = (s % SHEET_COLS) * T;
  const y0 = Math.floor(s / SHEET_COLS) * T;
  for (let y = 0; y < T; y++) px.copy(sheet, ((y0 + y) * width + x0) * 4, y * T * 4, (y + 1) * T * 4);
});
await sharp(sheet, { raw: { width, height, channels: 4 } }).png().toFile(OUT_PNG);

const template = {
  ...src,
  layers,
  tilesets: [{
    columns: SHEET_COLS,
    firstgid: 1,
    image: "../assets/Cabin2.png",
    imageheight: height,
    imagewidth: width,
    margin: 0,
    name: "Cabin2",
    spacing: 0,
    tilecount: SHEET_COLS * rows,
    tileheight: T,
    tilewidth: T,
  }],
};
fs.writeFileSync(OUT_JSON, JSON.stringify(template, null, 1) + "\n");
console.log(`wrote ${OUT_PNG} (${width}×${height}, ${slots.length} tiles) and ${OUT_JSON}`);
