#!/usr/bin/env node
// Build "Cabin Two": a variant of public/buildings/cabin_1.json with a teal
// shingle roof and stacked-log walls, baked into its own spritesheet.
//
//   node scripts/build-cabin-2.mjs
//
// Writes public/assets/Cabin2.png + public/buildings/cabin_2.json (see
// scripts/bake-building.mjs). Same layer layout as cabin_1, so Y-sorting,
// collision and the door work the same.
//
// The art comes from the existing tilesets (Roofs.png has a teal version
// of the A-frame roof 8 columns right of the brown one; Walls.png has a
// stacked-log version of the plaster wall panel 18 columns left of it), so
// it matches the rest of the village.

import { bakeBuilding, readTemplate, tilesOf } from "./bake-building.mjs";

const src = readTemplate("public/buildings/cabin_1.json");
const { gid, where } = tilesOf(src);

/** The Cabin Two look, as a remap of Cabin One's tiles. */
function remap(g) {
  if (!g) return g;
  let { name, r, c } = where(g);
  if (name === "Roofs" && c < 8) c += 8; // brown planks → teal shingles
  if (name === "Walls" && r >= 8 && r <= 10 && c >= 19 && c <= 22) c -= 18; // plaster → stacked logs
  return gid(name, r, c);
}

const template = { ...src, layers: src.layers.map((l) => ({ ...l, data: l.data.map(remap) })) };
await bakeBuilding(template, { name: "Cabin2", jsonName: "cabin_2" });
