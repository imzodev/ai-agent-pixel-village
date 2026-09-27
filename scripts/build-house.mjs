#!/usr/bin/env node
// Build "Willow House": a two-storey house (scripts/house-layout.mjs) with a
// brown plank roof, three tall glass windows upstairs, and plaster on a
// brick base downstairs. Baked into its own spritesheet.
//
//   node scripts/build-house.mjs
//
// Writes public/assets/House1.png + public/buildings/house_1.json (see
// scripts/bake-building.mjs).

import { bakeBuilding } from "./bake-building.mjs";
import { twoStoreyHouse } from "./house-layout.mjs";

const template = twoStoreyHouse({
  upperWindow: [32, 2], // Walls.png: single-pane glass window over a wood base
  groundPanelShift: 12, // plaster → plaster on a brick base
});
await bakeBuilding(template, { name: "House1", jsonName: "house_1" });
