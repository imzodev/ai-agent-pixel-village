// Bake a building template into its own spritesheet.
//
// Takes a Tiled template that draws from the shared tilesets (Walls.png,
// Roofs.png, Props.png, …), and writes:
//   public/assets/<name>.png        — every distinct 16×16 tile it uses
//   public/buildings/<file>.json    — the same layers, referencing only
//                                     that one tileset
// so a new building is one self-contained sheet + template. The tileset
// must also be listed in TILESET_FILES (src/game/worldTilemap.ts).
//
// Used by scripts/build-cabin-2.mjs and scripts/build-house.mjs.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const T = 16;
const SHEET_COLS = 8;
// Data-only layers: not rendered, only "non-zero means blocked / door".
const MARKER_LAYERS = new Set(["Collision", "Interactive"]);

export function readTemplate(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Tile helpers bound to a template's tilesets. */
export function tilesOf(template) {
  const sets = [...template.tilesets].sort((a, b) => a.firstgid - b.firstgid);
  const byName = new Map(sets.map((t) => [t.name, t]));
  return {
    /** Tileset containing `gid`. */
    tilesetOf: (gid) => sets.filter((t) => t.firstgid <= gid).at(-1),
    /** Global id of the tile at (row, col) of the named tileset. */
    gid: (name, r, c) => {
      const ts = byName.get(name);
      if (!ts) throw new Error(`template has no tileset "${name}"`);
      return ts.firstgid + r * ts.columns + c;
    },
    /** { name, r, c } of a global id. */
    where: (gid) => {
      const ts = sets.filter((t) => t.firstgid <= gid).at(-1);
      const i = gid - ts.firstgid;
      return { name: ts.name, r: Math.floor(i / ts.columns), c: i % ts.columns };
    },
  };
}

/**
 * Write `template` (using the shared tilesets) as `<name>.png` +
 * `public/buildings/<jsonName>.json`.
 *
 * `paint(ctx, pixels)` (optional) may repaint a tile before it is baked:
 * ctx = { layer, row, col, where: { name, r, c } } locates the tile in the
 * template and in its source tileset; `pixels` is its 16×16 RGBA buffer.
 * Return a new buffer (or mutate and return it), or undefined to keep it.
 */
export async function bakeBuilding(template, { name, jsonName, paint }) {
  const { tilesetOf, where } = tilesOf(template);
  const images = new Map();
  async function tilePixels(gid) {
    const ts = tilesetOf(gid);
    if (!images.has(ts.name)) {
      const file = path.join("public/assets", path.basename(ts.image));
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      images.set(ts.name, { data, width: info.width });
    }
    const img = images.get(ts.name);
    const i = gid - ts.firstgid;
    const x0 = (i % ts.columns) * T;
    const y0 = Math.floor(i / ts.columns) * T;
    const out = Buffer.alloc(T * T * 4);
    for (let y = 0; y < T; y++) img.data.copy(out, y * T * 4, ((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + T) * 4);
    return out;
  }

  // Every distinct tile image gets one slot in the new sheet.
  const slots = [];
  const slotByKey = new Map();
  async function slotFor(gid, layer, row, col) {
    let px = await tilePixels(gid);
    if (paint) px = paint({ layer, row, col, where: where(gid) }, px) ?? px;
    const key = px.toString("base64");
    if (!slotByKey.has(key)) {
      slotByKey.set(key, slots.length);
      slots.push(px);
    }
    return slotByKey.get(key) + 1; // local gid (firstgid 1)
  }

  const layers = [];
  for (const layer of template.layers) {
    if (layer.data.some((g) => g > 0x1fffffff)) throw new Error(`${layer.name}: flipped tiles are not supported`);
    const data = [];
    for (let k = 0; k < layer.data.length; k++) {
      const gid = layer.data[k];
      if (!gid) data.push(0);
      else if (MARKER_LAYERS.has(layer.name)) data.push(1);
      else data.push(await slotFor(gid, layer.name, Math.floor(k / template.width), k % template.width));
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
  const png = `public/assets/${name}.png`;
  await sharp(sheet, { raw: { width, height, channels: 4 } }).png().toFile(png);

  const out = {
    ...template,
    layers,
    tilesets: [{
      columns: SHEET_COLS,
      firstgid: 1,
      image: `../assets/${name}.png`,
      imageheight: height,
      imagewidth: width,
      margin: 0,
      name,
      spacing: 0,
      tilecount: SHEET_COLS * rows,
      tileheight: T,
      tilewidth: T,
    }],
  };
  const json = `public/buildings/${jsonName}.json`;
  fs.writeFileSync(json, JSON.stringify(out, null, 1) + "\n");
  console.log(`wrote ${png} (${width}×${height}, ${slots.length} tiles) and ${json}`);
}

// Standard template layer order (same as cabin_1.json and world chunks).
const TEMPLATE_LAYERS = [
  "Ground", "GroundUpper", "DecorationLowerShadow", "DecorationLower",
  "DecorationMiddle", "DecorationMiddle1", "DecorationMiddle2",
  "DecorationUpperShadow", "DecorationUpper", "DecorationUpper1",
  "DecorationUpper2", "Collision", "Overlay", "Interactive",
];

/**
 * Bake hand-painted layer canvases (scripts/canvas-art.mjs) into a tileset
 * + template, for buildings drawn from scratch rather than from the shared
 * tilesets.
 *
 * @param {object} o
 * @param {string} o.name      tileset / PNG name (public/assets/<name>.png)
 * @param {string} o.jsonName  template name (public/buildings/<jsonName>.json)
 * @param {Record<string, import("./canvas-art.mjs").Canvas>} o.layers  canvases
 *   keyed by template layer name; each must be width×16 by height×16 px
 * @param {Array<[number, number]>} o.collision  blocked [row, col] cells
 * @param {[number, number]} o.door  [row, col] of the door (Interactive)
 * @param {number} [o.width=24]  template width in tiles
 * @param {number} [o.height=15] template height in tiles
 */
export async function bakeCanvases({ name, jsonName, layers, collision, door, width = 24, height = 15 }) {
  const slots = [];
  const slotByKey = new Map();
  const data = {};
  for (const layerName of TEMPLATE_LAYERS) {
    const d = new Array(width * height).fill(0);
    const canvas = layers[layerName];
    if (canvas) {
      if (canvas.w !== width * T || canvas.h !== height * T) throw new Error(`${layerName}: canvas must be ${width * T}×${height * T}`);
      for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
        const px = canvas.tile(c, r, T);
        if (!px) continue;
        const key = px.toString("base64");
        if (!slotByKey.has(key)) { slotByKey.set(key, slots.length); slots.push(px); }
        d[r * width + c] = slotByKey.get(key) + 1;
      }
    }
    data[layerName] = d;
  }
  for (const [r, c] of collision) data.Collision[r * width + c] = 1;
  data.Interactive[door[0] * width + door[1]] = 1;

  const rows = Math.max(1, Math.ceil(slots.length / SHEET_COLS));
  const sw = SHEET_COLS * T;
  const sh = rows * T;
  const sheet = Buffer.alloc(sw * sh * 4);
  slots.forEach((px, s) => {
    const x0 = (s % SHEET_COLS) * T;
    const y0 = Math.floor(s / SHEET_COLS) * T;
    for (let y = 0; y < T; y++) px.copy(sheet, ((y0 + y) * sw + x0) * 4, y * T * 4, (y + 1) * T * 4);
  });
  const png = `public/assets/${name}.png`;
  await sharp(sheet, { raw: { width: sw, height: sh, channels: 4 } }).png().toFile(png);

  const template = {
    compressionlevel: -1,
    height,
    infinite: false,
    layers: TEMPLATE_LAYERS.map((layerName, i) => ({
      data: data[layerName],
      height,
      id: i + 1,
      name: layerName,
      opacity: 1,
      type: "tilelayer",
      visible: layerName !== "Collision" && layerName !== "Interactive",
      width,
      x: 0,
      y: 0,
    })),
    nextlayerid: TEMPLATE_LAYERS.length + 1,
    nextobjectid: 1,
    orientation: "orthogonal",
    renderorder: "right-down",
    tiledversion: "1.11.2",
    tileheight: T,
    tilesets: [{
      columns: SHEET_COLS, firstgid: 1, image: `../assets/${name}.png`, imageheight: sh, imagewidth: sw,
      margin: 0, name, spacing: 0, tilecount: SHEET_COLS * rows, tileheight: T, tilewidth: T,
    }],
    tilewidth: T,
    type: "map",
    version: "1.10",
    width,
  };
  const json = `public/buildings/${jsonName}.json`;
  fs.writeFileSync(json, JSON.stringify(template, null, 1) + "\n");
  console.log(`wrote ${png} (${sw}×${sh}, ${slots.length} tiles) and ${json}`);
}
