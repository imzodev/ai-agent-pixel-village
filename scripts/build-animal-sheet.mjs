#!/usr/bin/env node
// Combine per-action animal sheets into ONE spritesheet.
//
//   node scripts/build-animal-sheet.mjs cow walk eat
//
// reads public/assets/animals/cow_walk.png and cow_eat.png and stacks them
// vertically (in the order given) into public/assets/animals/cow.png.
// Every input must have the same width and frame grid: rows = directions,
// columns = animation frames. In the output each action becomes a "block"
// of direction rows; block N = the Nth action on the command line. Record
// the block order in src/game/animalSprites.ts.
//
// The per-action source files are not needed afterwards.

import sharp from "sharp";
import path from "node:path";

const DIR = path.resolve("public/assets/animals");
const [species, ...actions] = process.argv.slice(2);
if (!species || actions.length === 0) {
  console.error("usage: node scripts/build-animal-sheet.mjs <species> <action> [action...]");
  process.exit(1);
}

const inputs = await Promise.all(
  actions.map(async (action) => {
    const file = path.join(DIR, `${species}_${action}.png`);
    const meta = await sharp(file).metadata();
    return { action, file, width: meta.width, height: meta.height };
  }),
);
const width = inputs[0].width;
const bad = inputs.find((i) => i.width !== width);
if (bad) {
  console.error(`${bad.file} is ${bad.width}px wide; expected ${width}px like the others`);
  process.exit(1);
}

let top = 0;
const composite = inputs.map((i) => {
  const layer = { input: i.file, left: 0, top };
  top += i.height;
  return layer;
});
const out = path.join(DIR, `${species}.png`);
await sharp({ create: { width, height: top, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(composite)
  .png()
  .toFile(out);

console.log(`wrote ${out} (${width}×${top})`);
inputs.forEach((i, block) => console.log(`  block ${block}: ${i.action} (${i.height}px)`));
